// Remote video access. The first 1 MB and last 2 MB of each file are kept in memory (stream info and
// seek index live there), and ffmpeg reads the file through a loopback route that answers those ranges
// from memory and streams the rest from the video host with backpressure.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { ApiError, log, sleep } from './util.mjs';

export const HEAD_BYTES = 1 << 20;
export const TAIL_BYTES = 2 << 20;
const RESPONSE_TIMEOUT_MS = 10000;

// ---- SSRF guard -------------------------------------------------------------

function ipv4Private(a) {
  const p = a.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [x, y] = p;
  return x === 0 || x === 10 || x === 127 || x >= 224
    || (x === 100 && y >= 64 && y <= 127)
    || (x === 169 && y === 254)
    || (x === 172 && y >= 16 && y <= 31)
    || (x === 192 && y === 168)
    || (x === 192 && y === 0)
    || (x === 198 && (y === 18 || y === 19));
}

export function isPrivateAddress(addr) {
  const a = String(addr).toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIPv4(a)) return ipv4Private(a);
  if (net.isIPv6(a)) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (mapped) return ipv4Private(mapped[1]);
    if (a === '::' || a === '::1') return true;
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(a) || a.startsWith('64:ff9b:') || a.startsWith('2001:db8');
  }
  return true;
}

/** Throws ApiError('bad_url') when the link is not an https link to a public host. */
const DEV_LOCAL = process.env.STREAMWATCH_DEV_LOCAL_SOURCES === '1'; // tests with local files only

export function checkVideoUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { throw new ApiError('bad_url', 'not a valid link'); }
  if (DEV_LOCAL && u.protocol === 'http:' && u.hostname === '127.0.0.1') return u;
  if (u.protocol !== 'https:') throw new ApiError('bad_url', 'only https links are supported');
  if (u.username || u.password) throw new ApiError('bad_url', 'links with credentials are not supported');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new ApiError('bad_url', 'local addresses are not allowed');
  }
  if (net.isIP(host) && isPrivateAddress(host)) throw new ApiError('bad_url', 'private addresses are not allowed');
  return u;
}

// DNS lookup that refuses private addresses, so a public name cannot point the server at the LAN.
function safeLookup(hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err);
    const list = Array.isArray(address) ? address : [{ address, family }];
    if (list.some((a) => isPrivateAddress(a.address))) {
      const e = new Error('host resolves to a private address');
      e.code = 'EPRIVATE';
      return callback(e);
    }
    callback(null, address, family);
  });
}

const agent = new https.Agent({ keepAlive: true, maxSockets: 16, lookup: safeLookup });

// ---- upstream requests ----------------------------------------------------------

function classifyStatus(status) {
  if ([401, 403, 404, 410, 451].includes(status)) return new ApiError('source_gone', `video host answered ${status}`);
  if (status === 416) return new ApiError('source_gone', 'video host refused the byte range (416)');
  const e = new Error(`video host answered ${status}`);
  e.retryable = status >= 500 || status === 429;
  return e;
}

/** One ranged GET. Resolves with the 206 response (body not consumed). Follows up to 3 redirects. */
function rangeRequest(url, start, end, redirects = 0) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = checkVideoUrl(url); } catch (e) { reject(e); return; }
    const local = u.protocol === 'http:';
    const req = (local ? http : https).get(u, {
      agent: local ? undefined : agent,
      headers: { Range: `bytes=${start}-${end ?? ''}`, 'User-Agent': 'Lavf/61', Accept: '*/*', 'Accept-Encoding': 'identity' },
    }, (res) => {
      req.setTimeout(0);
      const s = res.statusCode;
      if (s >= 300 && s < 400 && res.headers.location && redirects < 3) {
        res.resume();
        rangeRequest(new URL(res.headers.location, u).href, start, end, redirects + 1).then(resolve, reject);
        return;
      }
      if (s === 206 || (s === 200 && start === 0)) { resolve(res); return; }
      res.resume();
      reject(classifyStatus(s));
    });
    req.on('error', (e) => {
      if (e.code === 'EPRIVATE') reject(new ApiError('bad_url', 'private addresses are not allowed'));
      else if (e.code === 'ENOTFOUND') reject(new ApiError('source_gone', 'video host not found'));
      else { e.retryable = true; reject(e); }
    });
    req.setTimeout(RESPONSE_TIMEOUT_MS, () => {
      const e = new Error('video host timed out');
      e.retryable = true;
      req.destroy(e);
    });
  });
}

/** How many requests have gone to video hosts since start (the host blocks clients that send too many). */
export const upstreamStats = { requests: 0 };

/** Ranged GET with one retry on timeouts / network errors / 5xx. */
export async function upstream(url, start, end) {
  upstreamStats.requests++;
  try {
    return await rangeRequest(url, start, end);
  } catch (e) {
    if (!e.retryable) throw e;
    await sleep(300);
    return rangeRequest(url, start, end);
  }
}

function readAll(res, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const timer = setTimeout(() => res.destroy(Object.assign(new Error('video host too slow'), { retryable: true })), timeoutMs);
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
    res.on('error', (e) => { clearTimeout(timer); reject(e); });
    res.on('aborted', () => { clearTimeout(timer); reject(Object.assign(new Error('video host closed the connection'), { retryable: true })); });
  });
}

async function fetchRange(url, start, end) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await upstream(url, start, end);
      const buf = await readAll(res);
      return { res, buf };
    } catch (e) {
      if (attempt >= 1 || !e.retryable) throw e;
    }
  }
}

// ---- one remote file -----------------------------------------------------------

export class Source {
  constructor(url) {
    this.url = url;
    this.size = 0;
    this.head = null;
    this.tail = null;
    this.tailStart = 0;
    this.tailP = null;
  }

  /** Fetches the size and the first 1 MB. */
  async open() {
    const { res, buf } = await fetchRange(this.url, 0, HEAD_BYTES - 1);
    if (res.statusCode === 200) throw new ApiError('unsupported', 'video host does not support byte ranges');
    const total = parseInt(String(res.headers['content-range'] || '').split('/')[1], 10);
    if (!Number.isFinite(total) || total <= 0) throw new ApiError('unsupported', 'video host did not report the file size');
    this.size = total;
    this.head = buf.subarray(0, Math.min(buf.length, total));
    this.tailStart = Math.max(this.head.length, total - TAIL_BYTES);
  }

  /** Fetches the last 2 MB (once; retried on the next call after a failure). */
  loadTail() {
    if (!this.tailP) {
      this.tailP = (async () => {
        if (this.tailStart >= this.size) { this.tail = Buffer.alloc(0); return; }
        const { buf } = await fetchRange(this.url, this.tailStart, this.size - 1);
        if (buf.length !== this.size - this.tailStart) throw new Error('short read of the file end');
        this.tail = buf;
      })();
      this.tailP.catch(() => { this.tailP = null; });
    }
    return this.tailP;
  }

  /** Reads [start, start+len) from memory when possible, else from the video host. */
  async read(start, len) {
    const end = Math.min(start + len, this.size);
    if (end <= this.head.length) return this.head.subarray(start, end);
    if (this.tail && start >= this.tailStart) return this.tail.subarray(start - this.tailStart, end - this.tailStart);
    const { buf } = await fetchRange(this.url, start, end - 1);
    return buf;
  }

  /** Serves the file to ffmpeg on this machine (GET /src/<id>, loopback only). */
  async serve(req, res, label) {
    await this.loadTail();
    const size = this.size;
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    const start = m ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    if (start >= size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      res.end();
      return;
    }
    const headers = { 'Content-Type': 'video/x-matroska', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 };
    if (m) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    res.writeHead(m ? 206 : 200, headers);
    if (req.method === 'HEAD') { res.end(); return; }

    let closed = false;
    let up = null;
    res.on('close', () => { closed = true; if (up) up.destroy(); });
    const write = (buf) => new Promise((resolve) => {
      if (closed || res.write(buf)) { resolve(); return; }
      const done = () => { res.off('drain', done); res.off('close', done); resolve(); };
      res.on('drain', done);
      res.on('close', done);
    });

    let pos = start;
    if (pos < this.head.length) {
      const chunk = this.head.subarray(pos, Math.min(end + 1, this.head.length));
      await write(chunk);
      pos += chunk.length;
    }
    // middle of the file: stream from the video host; resume from the current position if the
    // connection drops (it can sit idle for a while when the player is far behind)
    const midEnd = Math.min(end, this.tailStart - 1);
    let failures = 0;
    while (!closed && pos <= midEnd) {
      try {
        up = await upstream(this.url, pos, midEnd);
      } catch (e) {
        if (!closed) log(`source ${label}: video host error at byte ${pos}: ${e.message}`);
        if (++failures > 2 || e instanceof ApiError) { res.destroy(); return; }
        continue;
      }
      if (closed) { up.destroy(); return; }
      const stream = up;
      const ok = await new Promise((resolve) => {
        const onDrain = () => stream.resume();
        stream.on('data', (c) => {
          pos += c.length;
          if (pos > midEnd + 1) { stream.destroy(); resolve(false); return; }
          failures = 0;
          if (!res.write(c)) { stream.pause(); res.once('drain', onDrain); }
        });
        stream.on('end', () => resolve(pos === midEnd + 1));
        stream.on('error', () => resolve(false));
        stream.on('aborted', () => resolve(false));
        stream.on('close', () => resolve(pos === midEnd + 1));
        res.once('close', () => resolve(false));
      });
      up = null;
      if (closed) return;
      if (!ok && pos <= midEnd) {
        if (++failures > 2) { log(`source ${label}: giving up at byte ${pos}`); res.destroy(); return; }
      }
    }
    if (!closed && pos <= end && pos >= this.tailStart) {
      await write(this.tail.subarray(pos - this.tailStart, end + 1 - this.tailStart));
    }
    if (!closed) res.end();
  }
}
