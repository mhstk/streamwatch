// Checks for the runner's read-ahead pacing and for stopping ffmpeg, against local files only:
//   node web/server/test/pacing.mjs --local-dir=<dir with .mkv files (>= 4 min each)>
// Starts the server in dev mode on 8766 (temporary cache dir, removed at the end) and a local Range
// server on an ephemeral port in this process.
//   1 pacing   after one segment request: fast start, then about readAheadSpeed x real time, never more
//              than readAheadSeconds ahead of the request
//   2 stop     after the idle stop, a seek restart and a server shutdown: no ffmpeg child left, no
//              connection to the source left (Windows: tasklist, Linux: ps)
//   3 seek     time to the first segment after an uncached seek
//   4 cache    age cleanup at startup removes a video unused for > cacheMaxAgeDays, keeps a recent one;
//              serving from the cache marks the video as used durably (directory mtime)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLocalSource } from './localsource.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(HERE, '..', 'server.mjs');
const LOCAL_DIR = (process.argv.find((a) => a.startsWith('--local-dir=')) || '').slice(12);
const PORT = 8766;
const B = `http://127.0.0.1:${PORT}`;
const cfgFile = (() => { try { return JSON.parse(fs.readFileSync(path.resolve(HERE, '..', 'config.local.json'), 'utf8')); } catch { return {}; } })();
const AHEAD = Number(cfgFile.readAheadSeconds) > 0 ? Number(cfgFile.readAheadSeconds) : 60;
const SPEED = Number(cfgFile.readAheadSpeed) > 0 ? Number(cfgFile.readAheadSpeed) : 3;
const FAST_START = 30;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'streamwatch-pacing-'));
const cacheDir = path.join(tmp, 'cache');
const results = [];
let server = null;
let local = null;
let logText = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

function report(check, ok, detail) {
  results.push({ check, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${check}: ${detail}`);
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve(''));
    p.on('close', () => resolve(out));
  });
}

/** pids of all running ffmpeg processes (tasklist on Windows, ps elsewhere). */
async function ffmpegPids() {
  if (process.platform === 'win32') {
    const out = await run('tasklist', ['/FO', 'CSV', '/NH', '/FI', 'IMAGENAME eq ffmpeg.exe']);
    return new Set([...out.matchAll(/^"ffmpeg\.exe","(\d+)"/gim)].map((m) => Number(m[1])));
  }
  const out = await run('ps', ['-e', '-o', 'pid=,comm=']);
  return new Set(out.split('\n').map((l) => l.trim().split(/\s+/)).filter((x) => /ffmpeg/.test(x[1] || '')).map((x) => Number(x[0])));
}

/** ffmpeg pids this server started (from its log), plus on Linux any child it has right now. */
async function serverChildren() {
  const logged = [...logText.matchAll(/start at segment .*pid (\d+)/g)].map((m) => Number(m[1]));
  const all = await ffmpegPids();
  let kids = logged.filter((p) => all.has(p));
  if (process.platform !== 'win32' && server?.pid) {
    const out = await run('ps', ['-o', 'pid=,comm=', '--ppid', String(server.pid)]);
    for (const l of out.split('\n')) { const [pid, comm] = l.trim().split(/\s+/); if (pid && /ffmpeg/.test(comm || '')) kids.push(Number(pid)); }
  }
  if (!logged.length) kids = [...all]; // server without pid logging: count every ffmpeg on the machine
  return { alive: [...new Set(kids)], logged: logged.length };
}

async function waitFor(fn, timeoutMs, stepMs = 200) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return Date.now() - t0;
    if (Date.now() - t0 > timeoutMs) return -1;
    await sleep(stepMs);
  }
}

function startServer() {
  const env = { ...process.env, PORT: String(PORT), STREAMWATCH_CACHE_DIR: cacheDir, STREAMWATCH_DEV_NO_AUTH: '1', STREAMWATCH_DEV_LOCAL_SOURCES: '1' };
  const p = spawn(process.execPath, [SERVER], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  server = p;
  const from = logText.length;
  const onData = (d) => { logText += d; if (process.env.VERBOSE) process.stdout.write(`     | ${d}`); };
  p.stdout.on('data', onData);
  p.stderr.on('data', onData);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 10000);
    p.stdout.on('data', () => { if (logText.slice(from).includes('streaming server on')) { clearTimeout(t); resolve(p); } });
    p.on('exit', (c) => reject(new Error(`server exited (${c})`)));
  });
}

async function openMedia(url) {
  const r = await fetch(`${B}/api/media/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  const j = await r.json();
  if (r.status !== 200) throw new Error(`open failed ${r.status} ${j.code}`);
  const text = await (await fetch(B + j.playlist)).text();
  const durs = [...text.matchAll(/#EXTINF:([\d.]+),/g)].map((x) => Number(x[1]));
  const starts = [];
  let acc = 0;
  for (const d of durs) { starts.push(acc); acc += d; }
  return { ...j, durs, starts, total: acc, base: B + j.playlist.replace('index.m3u8', '') };
}

async function getSeg(m, n) {
  const t0 = performance.now();
  const r = await fetch(`${m.base}seg_${n}.m4s`);
  await r.arrayBuffer();
  return { status: r.status, ms: performance.now() - t0 };
}

const evict = (id, name) => fetch(`${B}/api/dev/evict`, { method: 'POST', body: JSON.stringify({ id, name }) });

/** End time (s) of the run of cached segments that starts at segment `from`. */
function producedEnd(m, from) {
  let n = from;
  while (n < m.durs.length && fs.existsSync(path.join(cacheDir, m.id, `seg_${n}.m4s`))) n++;
  return n === from ? m.starts[from] : (n < m.durs.length ? m.starts[n] : m.total);
}

const idleStops = () => (logText.match(/idle, stopping/g) || []).length;

async function checkStopped(label, sinceMs) {
  const procMs = await waitFor(async () => (await serverChildren()).alive.length === 0, 5000);
  const { alive, logged } = await serverChildren();
  const connMs = await waitFor(() => local.stats().connections === 0, 8000);
  const st = local.stats();
  report(`2 stop ${label}`, procMs >= 0 && connMs >= 0,
    `ffmpeg left: ${alive.length}${alive.length ? ` (pids ${alive.join(',')})` : ''}, gone ${procMs >= 0 ? `${procMs} ms` : 'never'} after the check began (${logged} runner pids logged); source connections ${st.connections} (requests in progress ${st.active}), zero ${connMs >= 0 ? `after ${connMs} ms` : 'not within 8 s'}${sinceMs !== undefined ? `; ${sinceMs}` : ''}`);
}

async function main() {
  if (!LOCAL_DIR) throw new Error('--local-dir=<dir> is required');
  local = await startLocalSource(LOCAL_DIR);
  if (local.episodes.length < 2) throw new Error('need at least two .mkv files');
  await startServer();
  const [epA, epB] = local.episodes;

  // 1. pacing: the playlist warms a runner up at segment 0, the player asks for segment 0, then nothing
  const a = await openMedia(epA.url);
  const t0 = Date.now();
  const first = await getSeg(a, 0);
  const reqEnd = a.starts[0] + a.durs[0];
  const samples = [];
  while (Date.now() - t0 < 22000) {
    samples.push({ t: (Date.now() - t0) / 1000, v: producedEnd(a, 0) });
    await sleep(100);
  }
  const maxSeg = Math.max(...a.durs);
  const peak = Math.max(...samples.map((s) => s.v));
  const limit = reqEnd + AHEAD + maxSeg; // segments are only written once complete
  const firstAt = (v) => samples.find((s) => s.v >= v);
  const burst = firstAt(FAST_START);
  // paced rate: from the first segment boundary after the fast start to the plateau
  const from = samples.find((s) => s.v > FAST_START + maxSeg * 0.5) || samples[0];
  const to = samples.find((s) => s.v >= Math.min(peak, reqEnd + AHEAD - maxSeg)) || samples[samples.length - 1];
  const rate = to.t > from.t ? (to.v - from.v) / (to.t - from.t) : Infinity;
  report('1 pacing first segment', first.status === 200, `segment 0 in ${Math.round(first.ms)} ms`);
  report('1 pacing fast start', !!burst && burst.t < 6, `${FAST_START}s of video produced after ${burst ? burst.t.toFixed(1) : '-'} s`);
  report('1 pacing limit', peak <= limit && peak >= reqEnd + AHEAD - 2 * maxSeg, `peak produced ${peak.toFixed(1)}s of video, requested up to ${reqEnd.toFixed(1)}s, allowed ${reqEnd.toFixed(1)}+${AHEAD}s (+ one segment ${maxSeg.toFixed(1)}s)`);
  report('1 pacing rate', rate >= SPEED * 0.65 && rate <= SPEED * 1.35, `${rate.toFixed(2)}x real time from ${from.v.toFixed(1)}s (t=${from.t.toFixed(1)}) to ${to.v.toFixed(1)}s (t=${to.t.toFixed(1)}), target ${SPEED}x`);
  console.log(`     produced video (wall s -> video s): ${samples.filter((s, i) => i % 10 === 0).map((s) => `${s.t.toFixed(0)}:${s.v.toFixed(0)}`).join(' ')}`);

  // 2a. idle stop: nothing requested since; the runner is stopped by the idle timer
  const idleMs = await waitFor(() => idleStops() >= 1, 45000, 500);
  const sinceReq = (Date.now() - t0) / 1000;
  await checkStopped('after idle', idleMs >= 0 ? `idle stop logged ${sinceReq.toFixed(0)} s after the last request` : 'no idle stop logged');

  // 2b. seek restart: runner at segment 0, then a request far away restarts ffmpeg there
  const b = await openMedia(epB.url);
  const s0 = await getSeg(b, 0);
  await sleep(1500);
  const before = await serverChildren();
  const far = Math.floor(b.durs.length * 0.7);
  const s1 = await getSeg(b, far);
  const afterMs = await waitFor(async () => (await serverChildren()).alive.length <= 1, 5000);
  const after = await serverChildren();
  const active = await waitFor(() => local.stats().active <= 1, 5000);
  report('2 stop seek restart', s0.status === 200 && s1.status === 200 && afterMs >= 0 && active >= 0,
    `ffmpeg before ${before.alive.length}, after the restart ${after.alive.length} (old one gone after ${afterMs} ms); source requests in progress ${local.stats().active}`);
  await waitFor(() => idleStops() >= 2, 45000, 500);
  await checkStopped('after seek + idle');

  // 3. time to the first segment of an uncached seek (one restart each)
  const times = [];
  for (const [m, f] of [[a, 0.35], [b, 0.45], [a, 0.55], [b, 0.25], [a, 0.85]]) {
    const n = Math.floor(m.durs.length * f);
    await evict(m.id, `seg_${n}.m4s`);
    const r = await getSeg(m, n);
    times.push(r.ms);
    console.log(`     seek ${m.id.slice(0, 6)} seg ${n}: ${Math.round(r.ms)} ms (${r.status})`);
  }
  report('3 seek first segment', median(times) < 3000, `median ${Math.round(median(times))} ms of [${times.map(Math.round).join(', ')}]`);

  // 2c. shutdown with a runner working
  await evict(b.id, 'seg_5.m4s');
  await getSeg(b, 5);
  const busy = await serverChildren();
  if (process.platform === 'win32') await fetch(`${B}/api/dev/shutdown`, { method: 'POST' }).catch(() => {});
  else server.kill('SIGTERM');
  await waitFor(() => server.exitCode !== null || server.signalCode !== null, 5000);
  await checkStopped('after shutdown', `${busy.alive.length} ffmpeg running before, server exit ${server.exitCode ?? server.signalCode}`);

  // 4. cache age: a unused for 10 days, b for 6 days (limit 7 by default); restart runs the cleanup
  const maxAge = Number(cfgFile.cacheMaxAgeDays ?? 7);
  const dirA = path.join(cacheDir, a.id);
  const dirB = path.join(cacheDir, b.id);
  const days = (d) => new Date(Date.now() - d * 86400000);
  fs.utimesSync(dirA, days(maxAge + 3), days(maxAge + 3));
  fs.utimesSync(dirB, days(maxAge - 1), days(maxAge - 1));
  const logFrom = logText.length;
  await startServer();
  const goneMs = await waitFor(() => !fs.existsSync(dirA), 3000, 100);
  const line = (logText.slice(logFrom).match(/cache: removed[^\r\n]*/) || ['no cleanup line'])[0].trim();
  report('4 cache age cleanup', goneMs >= 0 && fs.existsSync(dirB), `old video ${goneMs >= 0 ? 'deleted' : 'still there'}, recent one ${fs.existsSync(dirB) ? 'kept' : 'deleted'}; log: "${line}"`);
  const seg = fs.readdirSync(dirB).find((f) => f.startsWith('seg_'));
  const r = await fetch(b.base + seg);
  await r.arrayBuffer();
  await sleep(300);
  const age = (Date.now() - fs.statSync(dirB).mtimeMs) / 1000;
  report('4 cache use is durable', r.status === 200 && age < 60, `served cached ${seg} (${r.status}); directory mtime now ${age.toFixed(1)} s old (was ${maxAge - 1} days)`);
  if (process.platform === 'win32') await fetch(`${B}/api/dev/shutdown`, { method: 'POST' }).catch(() => {});
  else server.kill('SIGTERM');
  await waitFor(() => server.exitCode !== null || server.signalCode !== null, 5000);
}

let exitCode = 0;
try {
  await main();
} catch (e) {
  console.log(`FAIL setup: ${e.message}`);
  exitCode = 1;
} finally {
  try { server?.kill(); } catch { /* gone */ }
  // anything still alive here is a leak: report it and clean up
  const left = await serverChildren();
  if (left.alive.length) {
    console.log(`     cleaning up leftover ffmpeg ${left.alive.join(',')}`);
    for (const pid of left.alive) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
  }
  if (local) await local.close();
  await sleep(300);
  if (process.env.KEEP_TMP) console.log(`temp dir kept: ${tmp}`);
  else fs.rmSync(tmp, { recursive: true, force: true });
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (failed) exitCode = 1;
  process.exit(exitCode);
}
