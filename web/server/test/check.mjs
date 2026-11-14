// End-to-end checks against the real test files (../../../phone-test/episodes.json, private links:
// never printed). Starts its own servers: dev mode on 8766 (and 8767 without dev mode for the auth
// checks) with a temporary cache directory that is removed at the end.
//
//   node web/server/test/check.mjs [--only=a,b,c,d,e,f] [--episodes=<json [{id,url}]>]
// (local http://127.0.0.1 test files need STREAMWATCH_DEV_LOCAL_SOURCES=1 in the environment)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FFMPEG, FFPROBE } from '../lib/ffmpeg.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(HERE, '..', 'server.mjs');
const EPISODES = (process.argv.find((a) => a.startsWith('--episodes=')) || '').slice(11) || path.resolve(HERE, '..', '..', '..', 'phone-test', 'episodes.json');
const CONFIG = path.resolve(HERE, '..', 'config.local.json');
const PORT = 8766;
const PORT_NOAUTH = 8767;
const B = `http://127.0.0.1:${PORT}`;
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (c) => !only.length || only.includes(c);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'streamwatch-check-'));
const cacheDir = path.join(tmp, 'cache');
const results = [];
const procs = [];

function report(check, ok, detail) {
  results.push({ check, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${check}: ${detail}`);
}

function startServer(port, dev) {
  const env = { ...process.env, PORT: String(port), STREAMWATCH_CACHE_DIR: cacheDir };
  if (dev) env.STREAMWATCH_DEV_NO_AUTH = '1'; else delete env.STREAMWATCH_DEV_NO_AUTH;
  const p = spawn(process.execPath, [SERVER], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(p);
  const logFile = path.join(tmp, `server-${port}.log`);
  p.stdout.on('data', (d) => fs.appendFileSync(logFile, d));
  p.stderr.on('data', (d) => fs.appendFileSync(logFile, d));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`server on ${port} did not start`)), 10000);
    p.stdout.on('data', (d) => { if (String(d).includes('streaming server on')) { clearTimeout(t); resolve(p); } });
    p.on('exit', (c) => reject(new Error(`server on ${port} exited (${c}); log: ${logFile}`)));
  });
}

function run(cmd, args, timeoutMs = 600000) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    const t = setTimeout(() => p.kill(), timeoutMs);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
}

async function openMedia(url) {
  const r = await fetch(`${B}/api/media/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  const j = await r.json();
  if (r.status !== 200) throw new Error(`open failed ${r.status} ${j.code}`);
  return j;
}

async function getPlaylist(m) {
  const text = await (await fetch(B + m.playlist)).text();
  const durs = [...text.matchAll(/#EXTINF:([\d.]+),/g)].map((x) => Number(x[1]));
  const starts = [];
  let acc = 0;
  for (const d of durs) { starts.push(acc); acc += d; }
  return { text, durs, starts, total: acc, base: B + m.playlist.replace('index.m3u8', '') };
}

async function getBytes(url) {
  const t0 = performance.now();
  const r = await fetch(url);
  const b = Buffer.from(await r.arrayBuffer());
  return { status: r.status, buf: b, ms: performance.now() - t0 };
}

async function evict(id, name) {
  await fetch(`${B}/api/dev/evict`, { method: 'POST', body: JSON.stringify({ id, name }) });
}

/** ffprobe packets of a file: [{s: 'video'|'audio', pts, dts, dur}] */
async function packets(file) {
  const { out } = await run(FFPROBE, ['-v', 'error', '-show_entries', 'packet=codec_type,pts_time,dts_time,duration_time', '-of', 'csv=p=0', file]);
  return out.trim().split(/\r?\n/).filter(Boolean).map((l) => {
    const [s, pts, dts, dur] = l.split(',');
    return { s, pts: Number(pts), dts: Number(dts), dur: Number(dur) };
  });
}

async function probeDuration(id) {
  const { out } = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${B}/src/${id}`], 60000);
  return Number(out.trim());
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

async function main() {
  const episodes = JSON.parse(fs.readFileSync(EPISODES, 'utf8'));
  await startServer(PORT, true);
  const media = new Map(); // episode id -> {ep, m, pl}
  for (const ep of episodes) {
    const t0 = Date.now();
    const m = await openMedia(ep.url);
    const pl = await getPlaylist(m);
    media.set(ep.id, { ep, m, pl, openMs: Date.now() - t0 });
  }

  // a. index
  if (want('a')) {
    for (const { ep, m, pl } of media.values()) {
      const index = JSON.parse(fs.readFileSync(path.join(cacheDir, m.id, 'index.json'), 'utf8'));
      const probed = await probeDuration(m.id);
      const kf = index.keyframes;
      const ok = kf.length > 0 && Math.abs(kf[0]) < 0.5 && Math.abs(pl.total - probed) < 1;
      report(`a index ${ep.id}`, ok, `${kf.length} keyframes, first ${kf[0].toFixed(3)}s, ${pl.durs.length} segments (max ${Math.max(...pl.durs).toFixed(1)}s), EXTINF sum ${pl.total.toFixed(3)} vs ffprobe ${probed.toFixed(3)} (${m.video.codec} ${m.video.width}x${m.video.height}, ${m.audio?.codec})`);
    }
  }

  // b. segment correctness: first, middle, last
  if (want('b')) {
    for (const { ep, m, pl } of media.values()) {
      const init = await getBytes(pl.base + 'init.mp4');
      const n = pl.durs.length;
      for (const s of [0, Math.floor(n / 2), n - 1]) {
        const seg = await getBytes(pl.base + `seg_${s}.m4s`);
        const file = path.join(tmp, `b-${m.id}-${s}.mp4`);
        fs.writeFileSync(file, Buffer.concat([init.buf, seg.buf]));
        const pk = await packets(file);
        // full decode; keep the stream's time base so the null muxer does not round frame times onto
        // an estimated frame rate (that only produces "non monotonically increasing dts" noise)
        const dec = await run(FFMPEG, ['-v', 'error', '-nostdin', '-i', file, '-enc_time_base:v', 'demux', '-fps_mode', 'passthrough', '-f', 'null', '-']);
        fs.rmSync(file);
        const decodeErrors = dec.err.split(/\r?\n/).filter(Boolean);
        const P = JSON.parse(fs.readFileSync(path.join(cacheDir, m.id, 'index.json'), 'utf8')).ptsOffset || 0;
        const v = pk.filter((p) => p.s === 'video');
        const a = pk.filter((p) => p.s === 'audio');
        const firstPts = Math.min(...v.map((p) => p.pts));
        const firstDecoded = v.length ? v[0].pts : NaN;
        // every presentation time is source time + P (constant per file, the reordering delay)
        const diff = firstDecoded - P - pl.starts[s];
        const ok = seg.status === 200 && v.length > 0 && Math.abs(diff) <= 0.15 && a.length > 0 && decodeErrors.length === 0;
        report(`b segment ${ep.id} #${s}`, ok, `first video pts ${firstDecoded.toFixed(3)} = planned ${pl.starts[s].toFixed(3)} + P ${P.toFixed(3)} ${diff >= 0 ? '+' : ''}${diff.toFixed(3)}s (earliest shown ${firstPts.toFixed(3)}), ${v.length} video / ${a.length} audio packets, decode errors ${decodeErrors.length}${decodeErrors.length ? ` (${decodeErrors[0].slice(0, 80)})` : ''}, ${Math.round(seg.ms)} ms`);
      }
    }
  }

  // c. continuity across two different ffmpeg runs
  if (want('c')) {
    const preferred = ['friends-s05e16', 'love-island-s05e26', 'monster-s01e02'].filter((id) => media.has(id));
    for (const id of preferred.length ? preferred : [...media.keys()]) {
      const x = media.get(id);
      if (!x) continue;
      const { m, pl } = x;
      const n = Math.floor(pl.durs.length * 0.3) + 1;
      await evict(m.id, `seg_${n}.m4s`);
      await evict(m.id, `seg_${n + 1}.m4s`);
      const init = await getBytes(pl.base + 'init.mp4');
      const a = await getBytes(pl.base + `seg_${n}.m4s`); // runner A starts at n
      await getBytes(pl.base + `seg_${Math.floor(pl.durs.length * 0.8)}.m4s`); // runner A killed, B elsewhere
      await evict(m.id, `seg_${n + 1}.m4s`); // in case runner A got that far
      const b = await getBytes(pl.base + `seg_${n + 1}.m4s`); // runner C starts at n+1
      const file = path.join(tmp, `c-${m.id}.mp4`);
      fs.writeFileSync(file, Buffer.concat([init.buf, a.buf, b.buf]));
      const pk = await packets(file);
      fs.rmSync(file);
      const v = pk.filter((p) => p.s === 'video');
      const au = pk.filter((p) => p.s === 'audio');
      const vp = v.map((p) => p.pts).sort((p, q) => p - q);
      const steps = vp.slice(1).map((p, i) => p - vp[i]);
      const frame = median(steps);
      const boundary = pl.starts[n + 1];
      // video: around the joint, frame steps must stay one frame (no gap, no duplicate/overlap)
      const near = steps.map((s, i) => ({ s, t: vp[i] })).filter((z) => Math.abs(z.t - boundary) < 1);
      const worstV = Math.max(...near.map((z) => Math.abs(z.s - frame)));
      let dtsMono = true;
      for (let i = 1; i < v.length; i++) if (!(v[i].dts > v[i - 1].dts)) dtsMono = false;
      // audio: each packet starts where the previous one ended
      let worstA = 0;
      let worstAt = 0;
      for (let i = 1; i < au.length; i++) {
        const gap = au[i].pts - (au[i - 1].pts + au[i - 1].dur);
        if (Math.abs(gap) > Math.abs(worstA)) { worstA = gap; worstAt = au[i].pts; }
      }
      const ok = worstV <= frame * 0.5 && dtsMono && Math.abs(worstA) <= 0.05;
      report(`c continuity ${id} seg ${n}->${n + 1}`, ok, `joint at ${boundary.toFixed(3)}s; video frame ${(frame * 1000).toFixed(1)} ms, worst step deviation near joint ${(worstV * 1000).toFixed(1)} ms, dts monotonic ${dtsMono}; worst audio gap/overlap ${(worstA * 1000).toFixed(1)} ms at ${worstAt.toFixed(3)}s`);
    }
  }

  // d. whole stream through ffmpeg's HLS demuxer (shortest file)
  if (want('d')) {
    const shortest = [...media.values()].sort((p, q) => p.pl.total - q.pl.total)[0];
    const t0 = Date.now();
    const r = await run(FFMPEG, ['-v', 'warning', '-nostdin', '-i', shortest.pl.base + 'index.m3u8', '-map', '0', '-c', 'copy', '-f', 'null', '-progress', 'pipe:1', '-'], 900000);
    const outTimes = [...r.out.matchAll(/out_time_us=(\d+)/g)].map((x) => Number(x[1]) / 1e6);
    const outDur = outTimes.length ? outTimes[outTimes.length - 1] : 0;
    const probed = await probeDuration(shortest.m.id);
    const bad = r.err.split(/\r?\n/).filter((l) => /non monotonic|non-monoton|discontinuity/i.test(l));
    const ok = r.code === 0 && bad.length === 0 && Math.abs(outDur - probed) < 1;
    const otherWarnings = r.err.split(/\r?\n/).filter((l) => l.trim() && !bad.includes(l));
    report(`d whole stream ${shortest.ep.id}`, ok, `exit ${r.code}, output ${outDur.toFixed(2)}s vs source ${probed.toFixed(2)}s, ${bad.length} monotonic/discontinuity warnings, ${otherWarnings.length} other warning lines${otherWarnings.length ? ` (first: ${otherWarnings[0].slice(0, 120)})` : ''}, ${Math.round((Date.now() - t0) / 1000)} s`);
  }

  // e. timing
  if (want('e')) {
    const list = [...media.values()];
    const uncached = [];
    const cached = [];
    for (let i = 0; i < 5; i++) {
      const { m, pl, ep } = list[(i * 2 + 1) % list.length];
      const n = 2 + Math.floor(Math.random() * (pl.durs.length - 4));
      await evict(m.id, `seg_${n}.m4s`);
      const u = await getBytes(pl.base + `seg_${n}.m4s`);
      const c = await getBytes(pl.base + `seg_${n}.m4s`);
      uncached.push(u.ms);
      cached.push(c.ms);
      console.log(`     ${ep.id} seg ${n}: uncached ${Math.round(u.ms)} ms (${(u.buf.length / 1048576).toFixed(1)} MB), cached ${Math.round(c.ms)} ms`);
    }
    report('e timing uncached', median(uncached) < 3000, `median ${Math.round(median(uncached))} ms of [${uncached.map(Math.round).join(', ')}]`);
    report('e timing cached', median(cached) < 100, `median ${Math.round(median(cached))} ms of [${cached.map(Math.round).join(', ')}]`);
  }

  // f. auth (second server without the dev flag; same config, so grants from the dev server are valid)
  if (want('f')) {
    await startServer(PORT_NOAUTH, false);
    const A = `http://127.0.0.1:${PORT_NOAUTH}`;
    const ep = episodes[0];
    const body = JSON.stringify({ url: ep.url });
    const r1 = await fetch(`${A}/api/media/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const j1 = await r1.json();
    report('f no token -> 401', r1.status === 401 && j1.code === 'unauthorized', `${r1.status} ${j1.code}`);
    const r2 = await fetch(`${A}/api/media/open`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer abc.def.ghi' }, body });
    const j2 = await r2.json();
    report('f garbage token -> 401', r2.status === 401 && j2.code === 'unauthorized', `${r2.status} ${j2.code}`);
    // a structurally valid RS256 token with an unknown key / bad signature
    const fake = [{ alg: 'RS256', kid: 'nope', typ: 'JWT' }, { aud: 'streamwatch-2dfd2', iss: 'https://securetoken.google.com/streamwatch-2dfd2', sub: 'x', iat: 1, exp: 9999999999 }]
      .map((o) => Buffer.from(JSON.stringify(o)).toString('base64url')).join('.') + '.' + Buffer.alloc(256).toString('base64url');
    const r3 = await fetch(`${A}/api/media/open`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${fake}` }, body });
    report('f forged token -> 401', r3.status === 401, `${r3.status} ${(await r3.json()).code}`);
    const { m } = media.get(ep.id);
    const [, , id, grant] = m.playlist.split('/');
    const ok = await fetch(`${A}/hls/${id}/${grant}/index.m3u8`);
    report('f valid grant -> 200', ok.status === 200, `${ok.status}`);
    const [exp, sig] = grant.split('.');
    const tampered = `${exp}.${sig.slice(0, -2)}${sig.slice(-2) === 'AA' ? 'BB' : 'AA'}`;
    const t1 = await fetch(`${A}/hls/${id}/${tampered}/index.m3u8`);
    report('f tampered grant -> 403', t1.status === 403, `${t1.status}`);
    const longer = `${Number(exp) + 3600}.${sig}`;
    const t2 = await fetch(`${A}/hls/${id}/${longer}/seg_0.m4s`);
    report('f extended expiry -> 403', t2.status === 403, `${t2.status}`);
    const secret = JSON.parse(fs.readFileSync(CONFIG, 'utf8')).secret;
    const past = Math.floor(Date.now() / 1000) - 60;
    const expired = `${past}.${crypto.createHmac('sha256', secret).update(`${id}.${past}`).digest('base64url')}`;
    const t3 = await fetch(`${A}/hls/${id}/${expired}/init.mp4`);
    report('f expired grant -> 403', t3.status === 403, `${t3.status}`);
    const other = `${'0'.repeat(16)}`;
    const t4 = await fetch(`${A}/hls/${other}/${grant}/index.m3u8`);
    report('f grant for another id -> 403', t4.status === 403, `${t4.status}`);
    const src = await fetch(`${A}/api/health`);
    report('f health -> 200', src.status === 200, `${src.status}`);
  }
}

let exitCode = 0;
try {
  await main();
} catch (e) {
  console.log(`FAIL setup: ${e.message}`);
  exitCode = 1;
} finally {
  for (const p of procs) { try { p.kill(); } catch { /* gone */ } }
  await new Promise((r) => setTimeout(r, 500));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (process.env.KEEP_TMP) console.log(`temp dir kept: ${tmp}`);
  else fs.rmSync(tmp, { recursive: true, force: true });
  if (failed) exitCode = 1;
  process.exit(exitCode);
}
