// StreamWatch streaming server: repackages remote .mkv files into full-length VOD HLS (fMP4, stream
// copy) on demand, proxies the SubSource API, and serves the built web app. See ../README.md.
//
//   node web/server/server.mjs        (config: web/server/config.local.json, env PORT overrides)
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, DIST_DIR } from './lib/config.mjs';
import { DiskCache } from './lib/cache.mjs';
import { MediaManager } from './lib/media.mjs';
import { verifyIdToken, makeGrant, checkGrant } from './lib/auth.mjs';
import { killAll, FFMPEG } from './lib/ffmpeg.mjs';
import { ApiError, log, sendJson, sendError, readBody, isLoopback } from './lib/util.mjs';

const cfg = loadConfig();
const cache = new DiskCache(cfg.cacheDir, cfg.cacheMaxBytes);
const media = new MediaManager({ cfg, cache });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.map': 'application/json', '.wasm': 'application/wasm',
};

// ---- CORS -----------------------------------------------------------------------

function allowedOrigin(origin) {
  if (!origin) return null;
  const o = origin.replace(/\/+$/, '');
  if (cfg.allowedOrigins.includes(o)) return o;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return o; // web app dev server
  return null;
}

function corsHeaders(req) {
  const o = allowedOrigin(req.headers.origin);
  if (!o) return {};
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-API-Key',
    'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length, Content-Type',
    Vary: 'Origin',
  };
}

// ---- auth -----------------------------------------------------------------------

async function authenticate(req) {
  // dev mode: loopback callers are trusted whatever token they send (the demo app sends a fake one)
  if (cfg.devNoAuth && isLoopback(req.socket.remoteAddress)) return 'dev';
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) throw new ApiError('unauthorized', 'sign-in required');
  const uid = await verifyIdToken(m[1].trim());
  if (!cfg.allowedUids.includes(uid)) {
    log(`auth: signed-in user ${uid} is not on the allow-list (add it to allowedUids in config.local.json)`);
    throw new ApiError('forbidden', 'this account is not allowed to use this server');
  }
  return uid;
}

// ---- static web app -------------------------------------------------------------

function serveFile(req, res, file, headers, status = 200) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    const h = { 'Content-Length': st.size, 'Accept-Ranges': 'bytes', ...headers };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2]) && status === 200) {
      let start = range[1] ? parseInt(range[1], 10) : st.size - parseInt(range[2], 10);
      let end = range[1] && range[2] ? parseInt(range[2], 10) : st.size - 1;
      start = Math.max(0, start);
      end = Math.min(end, st.size - 1);
      if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); res.end(); return; }
      res.writeHead(206, { ...h, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${st.size}` });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
      return;
    }
    res.writeHead(status, h);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  const indexFile = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(indexFile)) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('StreamWatch streaming server is running. The web app is not built yet (npm --prefix web run build).\n');
    return;
  }
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400); res.end(); return; }
  const file = path.resolve(DIST_DIR, '.' + rel);
  if (!file.startsWith(DIST_DIR + path.sep) && file !== DIST_DIR) { res.writeHead(403); res.end(); return; }
  const isFile = fs.existsSync(file) && fs.statSync(file).isFile();
  if (isFile && path.basename(file) !== 'index.html') {
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const cacheControl = rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    serveFile(req, res, file, { 'Content-Type': type, 'Cache-Control': cacheControl });
    return;
  }
  const last = rel.split('/').pop() || '';
  if (!isFile && last.includes('.')) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
  serveFile(req, res, indexFile, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
}

// ---- SubSource pass-through -----------------------------------------------------

const subsourceAgent = new https.Agent({ keepAlive: true, maxSockets: 8 });

function proxySubsource(req, res, rest) {
  let target;
  try {
    target = new URL(`https://api.subsource.net/${rest}`);
  } catch {
    sendJson(res, 400, { error: 'bad path', code: 'bad_url' });
    return;
  }
  if (target.host !== 'api.subsource.net' || target.protocol !== 'https:') {
    sendJson(res, 400, { error: 'bad path', code: 'bad_url' });
    return;
  }
  const headers = { 'User-Agent': 'StreamWatch' };
  for (const h of ['accept', 'content-type', 'x-api-key', 'content-length']) {
    if (req.headers[h]) headers[h] = req.headers[h];
  }
  const up = https.request(target, { method: req.method, headers, agent: subsourceAgent }, (ur) => {
    const out = { ...corsHeaders(req), 'Cache-Control': 'no-store' };
    for (const h of ['content-type', 'content-length', 'content-disposition', 'content-encoding', 'retry-after']) {
      if (ur.headers[h]) out[h] = ur.headers[h];
    }
    res.writeHead(ur.statusCode || 502, out);
    ur.pipe(res);
    ur.on('error', () => res.destroy());
  });
  up.setTimeout(30000, () => up.destroy(new Error('timeout')));
  up.on('error', (e) => {
    if (!res.headersSent) sendJson(res, 502, { error: `subtitle service unreachable (${e.message})`, code: 'internal' }, corsHeaders(req));
    else res.destroy();
  });
  res.on('close', () => { if (!res.writableFinished) up.destroy(); });
  if (req.method === 'GET' || req.method === 'HEAD') up.end();
  else req.pipe(up);
}

// ---- HLS ------------------------------------------------------------------------

async function handleHls(req, res, m, url) {
  const [, id, grant, file] = m;
  const cors = corsHeaders(req);
  if (!checkGrant(cfg.secret, id, grant)) { sendJson(res, 403, { error: 'invalid or expired link', code: 'forbidden' }, cors); return; }
  const md = media.get(id);
  if (!md) { sendJson(res, 404, { error: 'unknown video, open it again', code: 'source_gone' }, cors); return; }
  let gone = false;
  res.on('close', () => { gone = true; });
  const isGone = () => gone;
  if (file === 'index.m3u8') {
    const s = url.searchParams.get('start');
    const start = s !== null && s !== '' && Number.isFinite(Number(s)) ? Math.max(0, Number(s)) : undefined;
    const text = media.playlist(md, start);
    res.writeHead(200, { ...cors, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(text) });
    res.end(req.method === 'HEAD' ? undefined : text);
    return;
  }
  const headers = { ...cors, 'Cache-Control': 'private, max-age=86400' };
  if (file === 'init.mp4') {
    const p = await media.getInit(md, isGone);
    serveFile(req, res, p, { ...headers, 'Content-Type': 'video/mp4' });
    return;
  }
  const n = parseInt(file.slice(4), 10);
  if (!(n >= 0 && n < md.plan.starts.length)) { sendJson(res, 404, { error: 'no such segment', code: 'not_found' }, cors); return; }
  const t0 = Date.now();
  const p = await media.getSegment(md, n, isGone);
  const ms = Date.now() - t0;
  if (ms > 1500) log(`hls ${md.name}: segment ${n} served after ${ms} ms`);
  serveFile(req, res, p, { ...headers, 'Content-Type': 'video/iso.segment' });
}

// ---- router ---------------------------------------------------------------------

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const isApi = p.startsWith('/api/');
  const isHls = p.startsWith('/hls/');

  if (req.method === 'OPTIONS' && (isApi || isHls)) {
    const cors = corsHeaders(req);
    res.writeHead(cors['Access-Control-Allow-Origin'] ? 204 : 403, {
      ...cors,
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Max-Age': '600',
    });
    res.end();
    return;
  }

  if (p.startsWith('/src/')) {
    if (!isLoopback(req.socket.remoteAddress)) { res.writeHead(403); res.end(); return; }
    await media.serveSource(p.slice(5), req, res);
    return;
  }

  if (isHls) {
    const m = /^\/hls\/([a-f0-9]{16})\/([^/]+)\/(index\.m3u8|init\.mp4|seg_\d{1,6}\.m4s)$/.exec(p);
    if (!m || (req.method !== 'GET' && req.method !== 'HEAD')) { sendJson(res, 404, { error: 'not found', code: 'not_found' }, corsHeaders(req)); return; }
    await handleHls(req, res, m, url);
    return;
  }

  if (isApi) {
    const cors = corsHeaders(req);
    if (p === '/api/health') { sendJson(res, 200, { ok: true }, cors); return; }
    await authenticate(req);
    if (p === '/api/media/open') {
      if (req.method !== 'POST') { sendJson(res, 405, { error: 'use POST', code: 'bad_url' }, cors); return; }
      let body;
      try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); } catch { throw new ApiError('bad_url', 'body must be JSON {"url": "..."}'); }
      if (!body || typeof body.url !== 'string') throw new ApiError('bad_url', 'missing "url"');
      const md = await media.open(body.url);
      const playlist = `/hls/${md.id}/${makeGrant(cfg.secret, md.id)}/index.m3u8`;
      sendJson(res, 200, media.describe(md, playlist), cors);
      return;
    }
    // test hook (dev mode, loopback only): drop one cached file so the next request produces it again
    if (p === '/api/dev/evict' && cfg.devNoAuth && isLoopback(req.socket.remoteAddress) && req.method === 'POST') {
      const b = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      if (/^[a-f0-9]{16}$/.test(b.id) && /^(seg_\d+\.m4s|init\.mp4)$/.test(b.name)) cache.remove(b.id, b.name);
      sendJson(res, 200, { ok: true });
      return;
    }
    const sub = /^\/api\/proxy\/subsource\/(.*)$/.exec(p);
    if (sub) {
      const rawPath = req.url.slice('/api/proxy/subsource/'.length);
      proxySubsource(req, res, rawPath);
      return;
    }
    sendJson(res, 404, { error: 'not found', code: 'not_found' }, cors);
    return;
  }

  serveStatic(req, res, p);
}

const server = http.createServer((req, res) => {
  route(req, res).catch((err) => {
    if (!(err instanceof ApiError)) log(`error ${req.method} ${req.url.split('?')[0].slice(0, 80)}: ${err.stack || err.message}`);
    else if (err.code === 'internal' && err.status !== 499) log(`error ${req.url.split('?')[0].slice(0, 80)}: ${err.message}`);
    if (res.headersSent) { res.destroy(); return; }
    const cors = corsHeaders(req);
    if (err instanceof ApiError) sendJson(res, err.status, { error: err.message, code: err.code }, cors);
    else sendError(res, err);
  });
});
server.keepAliveTimeout = 65000;
server.requestTimeout = 0; // segment requests can wait for ffmpeg

function shutdown(code = 0) {
  media.shutdown();
  killAll();
  server.close();
  process.exit(code);
}
process.on('exit', () => killAll());
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
if (process.platform === 'win32') process.on('SIGBREAK', () => shutdown(0));
process.on('uncaughtException', (e) => { log(`fatal: ${e.stack || e.message}`); shutdown(1); });

server.listen(cfg.port, cfg.host, () => {
  log(`StreamWatch streaming server on http://${cfg.host}:${cfg.port} (ffmpeg: ${FFMPEG === 'ffmpeg' ? 'PATH' : FFMPEG}, cache ${cfg.cacheDir}, max ${Math.round(cfg.cacheMaxBytes / 1048576)} MB${cfg.devNoAuth ? ', DEV: unauthenticated loopback API allowed' : ''})`);
});
