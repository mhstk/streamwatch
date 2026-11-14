// Small shared helpers: logging, JSON responses, errors with API codes.
import path from 'node:path';

export function log(msg) {
  const t = new Date();
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  const ss = String(t.getSeconds()).padStart(2, '0');
  console.log(`[${hh}:${mm}:${ss}] ${msg}`);
}

/** Error that maps to an API error code (see README "Streaming server API"). */
export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status || ({ unauthorized: 401, forbidden: 403, bad_url: 400, source_gone: 410, unsupported: 415, not_found: 404, internal: 500 }[code] ?? 500);
  }
}

/** File name of a video link, for logs and the stable media id. Never the full URL. */
export function fileNameOf(url) {
  try {
    const u = typeof url === 'string' ? new URL(url) : url;
    const last = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
    let name;
    try { name = decodeURIComponent(last); } catch { name = last; }
    return path.basename(name);
  } catch {
    return '(invalid url)';
  }
}

export function sendJson(res, status, body, extraHeaders = {}) {
  if (res.headersSent) { res.destroy(); return; }
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(text);
}

export function sendError(res, err) {
  if (err instanceof ApiError) {
    sendJson(res, err.status, { error: err.message, code: err.code });
  } else {
    sendJson(res, 500, { error: 'internal error', code: 'internal' });
  }
}

export function readBody(req, limit = 1e5) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new ApiError('bad_url', 'request body too large', 413)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function isLoopback(addr) {
  const a = String(addr || '').replace(/^::ffff:/, '');
  return a === '127.0.0.1' || a === '::1' || a.startsWith('127.');
}
