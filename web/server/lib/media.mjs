// Media registry, segment plan, playlist and the "runner" that produces HLS segments with ffmpeg.
//
// Timeline: every segment is rebuilt from ffmpeg's samples so its content and timestamps depend only
// on the source file, never on which ffmpeg run produced it:
//   - segment n = video samples in decode order from keyframe K[n] up to (not incl.) keyframe K[n+1],
//     plus audio samples whose presentation time is in [K[n], K[n+1]).
//   - presentation time = source time + P, where P is the video's initial reorder delay (so decode
//     times are never negative); decode times run from K[n] to K[n+1] inside segment n.
// ffmpeg is run with -copyts and +delay_moov, so the init segment's edit lists give the absolute
// start time of each track; the init that is served has those edit lists removed.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { FFMPEG, children, stopChild } from './ffmpeg.mjs';
import { BoxSplitter, parseInit, canonicalInit, initSignature, parseFragment, buildFragment, SAMPLE_NON_SYNC } from './mp4.mjs';
import { readMkvIndex } from './mkv.mjs';
import { upstreamStats, Source, checkVideoUrl } from './source.mjs';
import { ApiError, log, fileNameOf } from './util.mjs';

const INDEX_VERSION = 4;
const SEGMENT_TARGET = 6; // seconds
// Read-ahead (see Runner.flow): defaults for cfg.readAheadSeconds / cfg.readAheadSpeed
export const READ_AHEAD_SECONDS = 60; // video produced beyond the last requested segment before pausing ffmpeg
export const READ_AHEAD_SPEED = 3; // after the fast start, produce at most this many times real time
const FAST_START_SECONDS = 30; // video produced as fast as possible after a runner starts
const PACE_CREDIT_SECONDS = 2; // unused pacing allowance kept while paused for another reason
const JOIN_WINDOW = 3; // a request this many segments ahead of a runner waits for it
const IDLE_KILL_MS = 25000;
const MAX_ACTIVE = 2;
const SEGMENT_WAIT_MS = 45000;
const COPY_AUDIO = ['aac', 'ac3', 'eac3', 'mp3'];
const PLAYABLE_VIDEO = ['h264', 'hevc'];
const TOL = 0.005; // seconds; source timestamps are millisecond-rounded

export function makePlan(keyframes, duration) {
  const starts = [keyframes[0]];
  for (const k of keyframes) {
    if (k >= starts[starts.length - 1] + SEGMENT_TARGET - 1e-6 && k < duration - 0.5) starts.push(k);
  }
  const durations = starts.map((s, n) => (n + 1 < starts.length ? starts[n + 1] : duration) - (n === 0 ? 0 : s));
  return { starts, durations };
}

export function renderPlaylist(plan, start) {
  const target = Math.ceil(Math.max(...plan.durations));
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    `#EXT-X-TARGETDURATION:${target}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-INDEPENDENT-SEGMENTS',
  ];
  if (start !== undefined && Number.isFinite(start) && start >= 0) {
    lines.push(`#EXT-X-START:TIME-OFFSET=${start.toFixed(3)},PRECISE=YES`);
  }
  lines.push('#EXT-X-MAP:URI="init.mp4"');
  plan.durations.forEach((d, n) => { lines.push(`#EXTINF:${d.toFixed(6)},`, `seg_${n}.m4s`); });
  lines.push('#EXT-X-ENDLIST', '');
  return lines.join('\n');
}

/** Index of the segment containing source time t. */
function segmentAt(starts, t) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= t + TOL) lo = mid; else hi = mid - 1;
  }
  return lo;
}

class Media {
  constructor(id, name, index, source) {
    this.id = id;
    this.name = name;
    this.index = index;
    this.source = source; // null when only the disk cache is known (server restarted)
    this.plan = makePlan(index.keyframes, index.duration);
    this.runner = null;
    this.lastRequested = 0;
    this.lastRequestAt = 0;
    this.startHint = 0;
    this.waiters = new Set();
    this.initSig = null;
  }

  get audioConverted() { return !!this.index.audio && !COPY_AUDIO.includes(this.index.audio.codec); }

  waitFor(key, timeoutMs) {
    return new Promise((resolve, reject) => {
      const w = { key, resolve, reject, timer: null };
      w.timer = setTimeout(() => { this.waiters.delete(w); reject(Object.assign(new Error('timed out'), { timeout: true })); }, timeoutMs);
      this.waiters.add(w);
    });
  }

  notify(key) {
    for (const w of this.waiters) {
      if (w.key === key) { clearTimeout(w.timer); this.waiters.delete(w); w.resolve(); }
    }
  }

  failWaiters(err) {
    for (const w of this.waiters) { clearTimeout(w.timer); w.reject(err); }
    this.waiters.clear();
  }
}

class Runner {
  constructor(mgr, media, startSeg, early) {
    this.mgr = mgr;
    this.media = media;
    this.startSeg = startSeg;
    this.early = early;
    this.alive = true;
    this.vSeg = -1; // segment receiving video samples
    this.aSeg = -1; // segment receiving audio samples
    this.open = new Map(); // segment -> {video: [], audio: []}
    this.tracks = null;
    this.vId = 0;
    this.aId = 0;
    this.offsets = new Map();
    this.pendingMoof = null;
    this.splitter = new BoxSplitter();
    this.id = ++mgr.runnerSeq;
    this.paused = false;
    this.vTime = -Infinity; // source time (s) of the latest video sample received
    this.pace = null; // {wall, video}: pacing reference, set when the fast start is over
    this.paceTimer = null;
    this.sources = new Set(); // this run's /src responses (ffmpeg's reads), torn down when it stops
    this.produced = 0;
    this.t0 = Date.now();
    this.stderr = '';
    this.killedFor = '';
    this.writes = new Set();
    this.firstPts = { v: null, a: null, tb: {}, done: false }; // absolute times of the first packets
    this.queue = []; // fragments that arrived before those times were known
  }

  drainQueue() {
    const q = this.queue;
    this.queue = [];
    try {
      for (const [moof, mdat] of q) if (this.alive) this.onFragment(moof, mdat);
    } catch (e) {
      log(`runner ${this.media.name}: ${e.message}`);
      this.kill('bad output');
    }
  }

  /** Position used to decide whether a request can wait for this runner. */
  get position() { return Math.max(this.startSeg, this.vSeg); }

  start() {
    const { media, mgr } = this;
    const { starts } = media.plan;
    const kfs = media.index.keyframes;
    const K = starts[this.startSeg];
    // Start one keyframe before K and drop everything before K: Matroska has no decode times, and in
    // the first GOP of a run ffmpeg's guessed dts can exceed the pts of open-GOP leading frames, which
    // makes its muxer rewrite their pts. From the second GOP on the timestamps are right.
    // ffmpeg seeks to the keyframe at or before (-ss - 3/23 s) when the video has B-frames, so aim
    // 0.2 s past the previous keyframe. `early` (after a run started too late) aims further back.
    let ss = 0;
    if (this.startSeg > 0) {
      const i = kfs.findIndex((k) => k > K - 1e-6);
      const prev = i > 0 ? kfs[i - 1] : 0;
      ss = this.early ? Math.max(0, prev - 3) : prev > 0 && K - prev > 0.35 ? prev + 0.2 : Math.max(0, prev - 0.5);
    }
    const v = media.index.video;
    const audioArgs = !media.index.audio ? [] : media.audioConverted ? ['-c:a', 'aac', '-b:a', '160k', '-ac', '2'] : ['-c:a', 'copy'];
    const args = [
      '-hide_banner', '-nostdin', '-loglevel', 'error', '-copyts',
      '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_on_network_error', '1', '-reconnect_delay_max', '2',
      '-rw_timeout', '30000000',
      ...(ss > 0 ? ['-ss', ss.toFixed(6)] : []),
      '-i', `http://127.0.0.1:${mgr.port}/src/${media.id}?r=${this.id}`,
      '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1',
      '-c:v', 'copy', ...(v.codec === 'hevc' ? ['-tag:v', 'hvc1'] : []),
      ...audioArgs,
      '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-frag_duration', '1000000', '-flush_packets', '1',
      'pipe:1',
      // second output: one text line per packet with the original (absolute, -copyts) timestamps.
      // The mp4 muxer restarts every track at 0, so this is where the absolute times come from.
      '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-f', 'framecrc', 'pipe:3',
    ];
    const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe', 'pipe'], windowsHide: true });
    this.proc = proc;
    children.add(proc);
    proc.stderr.on('data', (d) => { this.stderr = (this.stderr + d).slice(-2000); });
    let crc = '';
    proc.stdio[3].on('data', (d) => {
      if (this.firstPts.done) return; // keep draining, nothing more needed
      crc += d;
      let i;
      while ((i = crc.indexOf('\n')) >= 0) {
        const line = crc.slice(0, i).trim();
        crc = crc.slice(i + 1);
        const tb = /^#tb (\d+): (\d+)\/(\d+)/.exec(line);
        if (tb) { this.firstPts.tb[tb[1]] = Number(tb[2]) / Number(tb[3]); continue; }
        if (!line || line.startsWith('#')) continue;
        const [stream, , pts] = line.split(',').map((x) => Number(x.trim()));
        const key = stream === 0 ? 'v' : 'a';
        if (this.firstPts[key] === null && Number.isFinite(pts)) this.firstPts[key] = pts * (this.firstPts.tb[stream] || 0.001);
        if (this.firstPts.v !== null && (this.firstPts.a !== null || !media.index.audio)) {
          this.firstPts.done = true;
          crc = '';
          this.drainQueue();
          break;
        }
      }
    });
    proc.stdout.on('data', (chunk) => {
      if (!this.alive) return;
      try {
        for (const b of this.splitter.push(chunk)) this.onBox(b);
      } catch (e) {
        log(`runner ${media.name}: ${e.message}`);
        this.kill('bad output');
      }
    });
    proc.on('error', (e) => { log(`runner ${media.name}: cannot start ffmpeg: ${e.message}`); this.end(false); });
    proc.on('exit', () => children.delete(proc));
    proc.on('close', (code) => {
      children.delete(proc);
      const clean = code === 0 && this.alive;
      if (!clean && this.alive) log(`runner ${media.name}: ffmpeg stopped (${code}): ${this.stderr.trim().split('\n').pop() || 'no message'}`);
      this.end(clean);
    });
    log(`runner ${media.name}: start at segment ${this.startSeg} (${K.toFixed(2)}s${this.early ? ', early seek' : ''}, pid ${proc.pid})`);
  }

  onBox(b) {
    if (b.type === 'ftyp') { this.ftyp = b.buf; return; }
    if (b.type === 'moov') { this.onInit(Buffer.concat([this.ftyp || Buffer.alloc(0), b.buf])); return; }
    if (b.type === 'moof') { this.pendingMoof = b.buf; return; }
    if (b.type === 'mdat' && this.pendingMoof) {
      const moof = this.pendingMoof;
      this.pendingMoof = null;
      if (this.tracks) this.onFragment(moof, b.buf);
    }
  }

  onInit(raw) {
    const { media, mgr } = this;
    this.tracks = parseInit(raw);
    for (const t of this.tracks.values()) {
      if (t.handler === 'vide' && !this.vId) this.vId = t.trackId;
      if (t.handler === 'soun' && !this.aId) this.aId = t.trackId;
    }
    const vt = this.tracks.get(this.vId);
    if (!vt) { this.kill('no video in output'); return; }
    const init = canonicalInit(raw);
    const sig = initSignature(init);
    if (!mgr.cache.has(media.id, 'init.mp4')) {
      // new init: the presentation offset P is measured again from this run (see anchorVideo)
      delete media.index.ptsOffset;
      media.initSig = sig;
      mgr.cache.write(media.id, 'init.mp4', init).then(() => media.notify('init'), (e) => log(`cache write failed: ${e.message}`));
    } else {
      if (!media.initSig) {
        try { media.initSig = initSignature(fs.readFileSync(mgr.cache.path(media.id, 'init.mp4'))); } catch { media.initSig = sig; }
      }
      if (media.initSig !== sig) {
        log(`runner ${media.name}: stream setup differs from the cached init segment; clearing the cache for this video`);
        mgr.clearMedia(media);
        this.kill('init mismatch');
        return;
      }
    }
    this.videoAnchored = false;
  }

  /**
   * On the first fragment: fixes P if unknown, then the video offset, which maps the run's first
   * frame to its absolute source time (from the framecrc output) + P.
   */
  anchorVideo(vs) {
    const { media, mgr } = this;
    const vt = this.tracks.get(this.vId);
    const first = vs[0];
    if (media.index.ptsOffset === undefined) {
      // P = reordering depth seen in this fragment (at least 3 frames, at most 0.5 s), so that
      // composition offsets stay non-negative
      // (the first GOP of a seeked run may have rewritten timestamps: skip it)
      let from = 0;
      if (this.startSeg > 0) {
        from = vs.findIndex((s, i) => i > 0 && !(s.flags & SAMPLE_NON_SYNC));
        if (from < 0) from = vs.length;
      }
      const rel = vs.slice(from).map((s) => s.dts + s.cts);
      const sorted = [...rel].sort((a, b) => a - b);
      let depth = 0;
      sorted.forEach((p, i) => { depth = Math.max(depth, p - rel[i]); });
      const steps = sorted.slice(1).map((p, i) => p - sorted[i]).filter((d) => d > 0).sort((a, b) => a - b);
      const frame = steps.length ? steps[steps.length >> 1] : first.dur || vt.timescale / 25;
      media.index.ptsOffset = Math.min(0.5, Math.max(depth, 3 * frame) / vt.timescale);
      mgr.saveIndex(media);
    }
    const P = media.index.ptsOffset;
    const first0 = this.firstPts.v;
    if (first.flags & SAMPLE_NON_SYNC) log(`runner ${media.name}: output does not start with a keyframe`);
    this.offsets.set(this.vId, Math.round((first0 + P) * vt.timescale) - (first.dts + first.cts));
    this.videoAnchored = true;
    const K = media.plan.starts[this.startSeg];
    if (first0 > K + TOL) {
      // ffmpeg started after the segment's keyframe: the segment cannot be produced from this run
      log(`runner ${media.name}: started at ${first0.toFixed(3)}s, after ${K.toFixed(3)}s; retrying with an earlier seek`);
      this.kill('late start');
      if (!this.early) this.mgr.startRunner(media, this.startSeg, true);
      return false;
    }
    return true;
  }

  onFragment(moof, mdat) {
    const { media } = this;
    const { starts } = media.plan;
    const samples = parseFragment(moof, mdat, this.tracks);
    const seg = (n) => {
      let s = this.open.get(n);
      if (!s) { s = { video: [], audio: [] }; this.open.set(n, s); }
      return s;
    };
    const vt = this.tracks.get(this.vId);
    const vs = samples.get(this.vId) || [];
    if (!this.videoAnchored) {
      if (!this.firstPts.done) {
        this.queue.push([moof, mdat]);
        // audio track without packets near here: stop waiting for its first time
        if (this.queue.length > 5 && this.firstPts.v !== null) {
          this.firstPts.done = true;
          if (this.firstPts.a === null) this.firstPts.a = this.firstPts.v;
          this.drainQueue();
        }
        return;
      }
      if (!vs.length) return; // nothing to anchor on yet (audio-only fragment): drop it
      if (!this.anchorVideo(vs)) return;
    }
    const P = media.index.ptsOffset;
    const as = this.aId ? samples.get(this.aId) || [] : [];
    if (as.length && !this.offsets.has(this.aId)) {
      // the first audio sample of the mp4 output is the first audio packet of the framecrc output
      const at = this.tracks.get(this.aId);
      this.offsets.set(this.aId, Math.round((this.firstPts.a + P) * at.timescale) - (as[0].dts + as[0].cts));
    }
    for (const s of vs) {
      const pts = s.dts + s.cts + this.offsets.get(this.vId);
      if (!(s.flags & SAMPLE_NON_SYNC)) {
        const n = segmentAt(starts, pts / vt.timescale - P);
        if (n > this.vSeg) this.vSeg = n;
      }
      if (this.vSeg < this.startSeg) continue; // before the requested segment (or no keyframe yet)
      const t = pts / vt.timescale - P;
      if (t > this.vTime) this.vTime = t;
      seg(this.vSeg).video.push({ pts, dur: s.dur, size: s.size, flags: s.flags, data: s.data });
    }
    if (this.aId) {
      const at = this.tracks.get(this.aId);
      for (const s of as) {
        const pts = s.dts + s.cts + this.offsets.get(this.aId);
        const n = segmentAt(starts, pts / at.timescale - P);
        if (n > this.aSeg) this.aSeg = n;
        if (n < this.startSeg || this.vSeg < 0) continue;
        seg(n).audio.push({ pts, dur: s.dur, size: s.size, flags: s.flags, data: s.data });
      }
    }
    // a segment is complete once both tracks have moved past it (or video is well past it)
    for (const n of [...this.open.keys()].sort((a, b) => a - b)) {
      const audioDone = !this.aId || this.aSeg > n || this.vSeg - n >= 2;
      if (n < this.vSeg && audioDone) this.finalize(n);
    }
    this.flow();
  }

  finalize(n) {
    const { media, mgr } = this;
    const s = this.open.get(n);
    this.open.delete(n);
    if (!s || !s.video.length) return;
    const name = `seg_${n}.m4s`;
    if (mgr.cache.has(media.id, name)) { media.notify(n); return; }
    const { starts } = media.plan;
    const vt = this.tracks.get(this.vId);
    const ts = vt.timescale;
    // decode times: the i-th decoded frame gets the i-th smallest presentation time minus P. This
    // depends only on the segment's frames (not on ffmpeg's dts guess), keeps composition offsets
    // non-negative while the reordering depth is <= P, and is continuous across segments because
    // each segment's frames cover a contiguous range of presentation times (also with open GOPs,
    // whose leading frames belong to the segment of their keyframe).
    const Pu = Math.round(media.index.ptsOffset * ts);
    const sorted = s.video.map((x) => x.pts).sort((a, b) => a - b);
    const count = sorted.length;
    const dts = sorted.map((p) => p - Pu);
    const steps = dts.slice(1).map((d, i) => d - dts[i]).sort((a, b) => a - b);
    const frame = steps.length ? steps[steps.length >> 1] : s.video[0].dur;
    const durs = dts.map((d, i) => (i + 1 < count ? dts[i + 1] - d : Math.max(1, frame)));
    const video = s.video.map((x, i) => ({ dur: durs[i], size: x.size, flags: x.flags, cts: x.pts - dts[i], data: x.data }));
    if (dts[0] < 0) log(`runner ${media.name}: segment ${n} would start before 0`);
    const trafs = [{ trackId: this.vId, baseDts: Math.max(0, dts[0]), samples: video }];
    if (s.audio.length) {
      trafs.push({ trackId: this.aId, baseDts: s.audio[0].pts, samples: s.audio.map((x) => ({ dur: x.dur, size: x.size, flags: x.flags, cts: 0, data: x.data })) });
    }
    const buf = buildFragment(n + 1, trafs);
    this.produced++;
    if (this.produced === 1) log(`runner ${media.name}: segment ${n} ready after ${Date.now() - this.t0} ms (host requests so far: ${upstreamStats.requests})`);
    const w = mgr.cache.write(media.id, name, buf).then(() => media.notify(n), (e) => log(`cache write failed: ${e.message}`));
    this.writes.add(w);
    w.finally(() => this.writes.delete(w));
  }

  /**
   * Read-ahead control, by pausing the read of ffmpeg's stdout (backpressure reaches ffmpeg, then the
   * source proxy, then the video host). Called after every fragment, on every request and by a timer.
   *  - while a request waits for output: full speed (and the time produced for it is not counted);
   *  - the first FAST_START_SECONDS after the run's start: full speed;
   *  - then at most readAheadSpeed x real time;
   *  - never more than readAheadSeconds of video beyond the last requested segment.
   */
  flow() {
    clearTimeout(this.paceTimer);
    this.paceTimer = null;
    if (!this.alive || !this.proc) return;
    const { media, mgr } = this;
    const { starts } = media.plan;
    const now = Date.now();
    const speed = mgr.readAheadSpeed;
    let hold = false;
    let waitMs = 0;
    const started = this.vTime > -Infinity;
    if (started && speed > 0) {
      if (!this.pace) {
        if (this.vTime - starts[this.startSeg] >= FAST_START_SECONDS) this.pace = { wall: now, video: this.vTime };
      } else {
        // allowance accumulated while paused for another reason is capped, so there is no burst after
        const allowed = this.pace.video + (speed * (now - this.pace.wall)) / 1000;
        if (allowed > this.vTime + PACE_CREDIT_SECONDS) this.pace = { wall: now, video: this.vTime + PACE_CREDIT_SECONDS };
        else if (this.vTime > allowed) { hold = true; waitMs = ((this.vTime - allowed) / speed) * 1000; }
      }
    }
    if (media.waiters.size) {
      hold = false;
      waitMs = 0;
      if (this.pace && this.pace.video < this.vTime) this.pace = { wall: now, video: this.vTime };
    } else if (started) {
      const n = Math.min(media.lastRequested, starts.length - 1);
      const requestedEnd = n + 1 < starts.length ? starts[n + 1] : media.index.duration;
      if (this.vTime - requestedEnd > mgr.readAheadSeconds) { hold = true; waitMs = 0; } // resumed by a request
    }
    if (hold && !this.paused) { this.paused = true; this.proc.stdout.pause(); }
    else if (!hold && this.paused) { this.paused = false; this.proc.stdout.resume(); }
    if (hold && waitMs > 0) {
      this.paceTimer = setTimeout(() => this.flow(), Math.min(5000, Math.max(50, Math.ceil(waitMs))));
      this.paceTimer.unref();
    }
  }

  kill(reason) {
    if (!this.alive) return;
    this.killedFor = reason;
    this.alive = false;
    stopChild(this.proc, `runner ${this.media.name}`);
    this.end(false);
  }

  /** Tears down ffmpeg's reads through the source proxy, which closes their connections to the video host. */
  closeSources() {
    for (const res of this.sources) { try { res.destroy(); } catch { /* closed */ } }
    this.sources.clear();
  }

  end(clean) {
    const { media } = this;
    clearTimeout(this.paceTimer);
    this.paceTimer = null;
    this.closeSources();
    this.mgr.runners.delete(this.id);
    if (clean) {
      // end of file: the trailing segments are complete (only trust it when it is the last segment)
      const last = media.plan.starts.length - 1;
      for (const n of [...this.open.keys()].sort((a, b) => a - b)) {
        if (n < this.vSeg || n === last) this.finalize(n);
      }
      if (this.vSeg < last) log(`runner ${media.name}: ffmpeg ended early at segment ${this.vSeg} of ${last}`);
    }
    this.alive = false;
    this.open.clear();
    if (media.runner === this) {
      media.runner = null;
      // waiters re-check the cache (after pending writes) and start another runner if still needed
      const fail = () => media.failWaiters(Object.assign(new Error('runner ended'), { retry: true }));
      if (clean) Promise.allSettled([...this.writes]).then(fail); else fail();
    }
  }
}

export class MediaManager {
  constructor({ cfg, cache }) {
    this.cfg = cfg;
    this.cache = cache;
    this.port = cfg.port;
    this.medias = new Map();
    this.runnerSeq = 0;
    this.runners = new Map(); // runner id -> runner, while it is alive
    const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 && v !== '' && v !== null ? Number(v) : d);
    this.readAheadSeconds = num(cfg.readAheadSeconds, READ_AHEAD_SECONDS);
    this.readAheadSpeed = num(cfg.readAheadSpeed, READ_AHEAD_SPEED); // 0: no pacing
    cache.protect = () => {
      const m = new Map();
      for (const media of this.medias.values()) {
        if (media.runner || Date.now() - media.lastRequestAt < 10 * 60000) m.set(media.id, media.lastRequested);
      }
      return m;
    };
    this.idleTimer = setInterval(() => {
      for (const media of this.medias.values()) {
        if (media.runner && Date.now() - media.lastRequestAt > IDLE_KILL_MS) {
          log(`runner ${media.name}: idle, stopping`);
          media.runner.kill('idle');
        }
      }
    }, 5000);
    this.idleTimer.unref();
  }

  saveIndex(media) {
    const data = { version: INDEX_VERSION, name: media.name, size: media.index.size, ...media.index };
    this.cache.write(media.id, 'index.json', Buffer.from(JSON.stringify(data))).catch((e) => log(`cache write failed: ${e.message}`));
  }

  clearMedia(media) {
    for (const name of [...(this.cache.media.get(media.id)?.files.keys() || [])]) {
      if (name !== 'index.json') this.cache.remove(media.id, name);
    }
    delete media.index.ptsOffset;
    media.initSig = null;
    this.saveIndex(media);
  }

  async open(rawUrl) {
    const u = checkVideoUrl(rawUrl);
    const name = fileNameOf(u);
    const t0 = Date.now();
    const source = new Source(u.href);
    try {
      await source.open();
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError('source_gone', `video host unreachable (${e.message})`);
    }
    const id = crypto.createHash('sha256').update(`${name.toLowerCase()}\n${source.size}`).digest('hex').slice(0, 16);
    let media = this.medias.get(id);
    if (media && media.source) {
      media.source.url = u.href; // links are re-issued with new tokens
    } else {
      let index = this.cache.readJson(id, 'index.json');
      if (!index || index.version !== INDEX_VERSION || index.size !== source.size || !Array.isArray(index.keyframes)) {
        try {
          await source.loadTail();
          index = { ...(await readMkvIndex(source)), size: source.size };
        } catch (e) {
          if (e instanceof ApiError) throw e;
          throw new ApiError('source_gone', `could not read the video (${e.message})`);
        }
        delete index.version;
        delete index.name;
      } else {
        source.loadTail().catch((e) => log(`open ${name}: could not fetch the file end: ${e.message}`));
      }
      if (media) {
        media.source = source;
      } else {
        media = new Media(id, name, index, source);
        this.medias.set(id, media);
      }
      this.saveIndex(media);
    }
    const ix = media.index;
    if (!PLAYABLE_VIDEO.includes(ix.video.codec)) {
      throw new ApiError('unsupported', `video codec ${ix.video.codec} cannot be played on this device`);
    }
    log(`open ${name}: ${ix.video.codec} ${ix.video.width}x${ix.video.height}, ${ix.audio ? `${ix.audio.codec} ${ix.audio.channels}ch` : 'no audio'}, ${Math.round(ix.duration / 60)} min, ${media.plan.starts.length} segments, ${Date.now() - t0} ms`);
    return media;
  }

  describe(media, playlist) {
    const ix = media.index;
    return {
      id: media.id,
      playlist,
      duration: ix.duration,
      video: { codec: ix.video.codec, width: ix.video.width, height: ix.video.height },
      audio: ix.audio ? { codec: ix.audio.codec, channels: media.audioConverted ? Math.min(2, ix.audio.channels) : ix.audio.channels, converted: media.audioConverted } : null,
    };
  }

  /** Known media (in memory, or from the disk cache after a restart). */
  get(id) {
    let media = this.medias.get(id);
    if (media) return media;
    const index = this.cache.readJson(id, 'index.json');
    if (!index || index.version !== INDEX_VERSION) return null;
    media = new Media(id, index.name, index, null);
    this.medias.set(id, media);
    return media;
  }

  playlist(media, start) {
    if (start !== undefined) {
      const n = segmentAt(media.plan.starts, Math.min(start, media.index.duration));
      media.startHint = n;
      media.lastRequested = n;
    }
    media.lastRequestAt = Date.now();
    this.cache.touch(media.id);
    // warm up: the player asks for init + this segment next
    const n = media.startHint;
    if (media.source && !media.runner && !this.cache.has(media.id, `seg_${n}.m4s`)) this.startRunner(media, n);
    return renderPlaylist(media.plan, start);
  }

  startRunner(media, n, early = false) {
    if (media.runner) media.runner.kill('seek');
    const active = [...this.medias.values()].filter((m) => m.runner && m !== media).sort((a, b) => a.lastRequestAt - b.lastRequestAt);
    while (active.length >= MAX_ACTIVE) {
      const m = active.shift();
      log(`runner ${m.name}: stopping, too many active videos`);
      m.runner?.kill('too many');
    }
    const r = new Runner(this, media, n, early);
    media.runner = r;
    this.runners.set(r.id, r);
    r.start();
    return r;
  }

  async getInit(media, isGone) {
    media.lastRequestAt = Date.now();
    this.cache.touch(media.id);
    const deadline = Date.now() + SEGMENT_WAIT_MS;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (this.cache.has(media.id, 'init.mp4')) return this.cache.path(media.id, 'init.mp4');
      if (!media.source) throw new ApiError('source_gone', 'open the video again', 410);
      if (isGone()) throw new ApiError('internal', 'client went away', 499);
      if (!media.runner || !media.runner.alive) this.startRunner(media, media.startHint);
      const waiting = media.waitFor('init', Math.max(1000, deadline - Date.now()));
      media.runner?.flow();
      try {
        await waiting;
      } catch (e) {
        if (e.timeout) throw new ApiError('internal', 'timed out preparing the video', 504);
      }
    }
    throw new ApiError('internal', 'could not prepare the video', 502);
  }

  async getSegment(media, n, isGone) {
    media.lastRequested = n;
    media.lastRequestAt = Date.now();
    this.cache.touch(media.id);
    const name = `seg_${n}.m4s`;
    const deadline = Date.now() + SEGMENT_WAIT_MS;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (this.cache.has(media.id, name)) { media.runner?.flow(); return this.cache.path(media.id, name); }
      if (!media.source) throw new ApiError('source_gone', 'open the video again', 410);
      if (isGone()) throw new ApiError('internal', 'client went away', 499);
      const r = media.runner;
      if (!(r && r.alive && r.position <= n && n <= r.position + JOIN_WINDOW)) this.startRunner(media, n);
      const waiting = media.waitFor(n, Math.max(1000, deadline - Date.now()));
      media.runner?.flow(); // a waiting request lifts the pacing
      try {
        await waiting;
      } catch (e) {
        if (e.timeout) throw new ApiError('internal', 'timed out producing the segment', 504);
      }
    }
    throw new ApiError('internal', 'could not produce the segment', 502);
  }

  /** GET /src/<id>?r=<runner>: ffmpeg's reads; a runner's reads are closed when it stops. */
  async serveSource(id, req, res, runnerId) {
    const media = this.medias.get(id);
    if (!media || !media.source) { res.writeHead(404); res.end(); return; }
    if (runnerId) {
      const r = this.runners.get(Number(runnerId));
      if (!r || !r.alive || r.media !== media) { res.writeHead(410); res.end(); return; } // a stopped run
      r.sources.add(res);
      res.on('close', () => r.sources.delete(res));
    }
    await media.source.serve(req, res, media.name);
  }

  shutdown() {
    clearInterval(this.idleTimer);
    for (const m of this.medias.values()) m.runner?.kill('shutdown');
    for (const r of [...this.runners.values()]) r.kill('shutdown');
  }
}
