// Transparent reverse proxy for Firebase's sign-in helper (Firebase "redirect best practices", option 3:
// https://firebase.google.com/docs/auth/web/redirect-best-practices). With authDomain set to this
// server's own host, the browser loads https://<host>/__/auth/handler, /__/auth/iframe and their scripts
// from this origin, so iOS storage partitioning never sees a cross-site helper.
//
// Only /__/auth/* is forwarded. The handler script also asks for /__/firebase/init.json, but that file
// exists only on Firebase Hosting sites; upstream answers 404 for this project, which is what the static
// server here answers too, so it is deliberately not proxied.
//
// No authentication (this is the sign-in helper itself) and no caching of our own: method, path, query,
// body, status and headers (Cache-Control included) pass through unchanged, except hop-by-hop headers,
// Host (set to the upstream) and the upstream's Alt-Svc.
import https from 'node:https';

export const AUTH_UPSTREAM_HOST = 'streamwatch-2dfd2.firebaseapp.com';
export const AUTH_PREFIX = '/__/auth/';

const agent = new https.Agent({ keepAlive: true, maxSockets: 16 });

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'proxy-connection',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host',
]);

/** Copies headers minus hop-by-hop ones (including any listed in the Connection header). */
function endToEnd(headers) {
  const drop = new Set(HOP_BY_HOP);
  for (const name of String(headers.connection || '').split(',')) {
    const n = name.trim().toLowerCase();
    if (n) drop.add(n);
  }
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined && !drop.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

/** True when `pathname` (already normalised by URL parsing) belongs to the sign-in helper. */
export function isAuthHelperPath(pathname) {
  return pathname.startsWith(AUTH_PREFIX);
}

/**
 * Forwards the request to https://<firebase auth domain><pathname><search>.
 * `pathname` and `search` come from the parsed request URL, so `..` segments are already resolved.
 */
export function proxyAuthHelper(req, res, pathname, search, log) {
  const headers = endToEnd(req.headers);
  headers.host = AUTH_UPSTREAM_HOST;
  const up = https.request(
    { host: AUTH_UPSTREAM_HOST, port: 443, servername: AUTH_UPSTREAM_HOST, method: req.method, path: pathname + search, headers, agent },
    (ur) => {
      const out = endToEnd(ur.headers);
      // Alt-Svc advertises the upstream's own HTTP/3 endpoint; on this origin it would point browsers
      // at a port/protocol this server does not offer.
      for (const k of Object.keys(out)) if (k.toLowerCase() === 'alt-svc') delete out[k];
      res.writeHead(ur.statusCode || 502, ur.statusMessage, out);
      ur.pipe(res);
      ur.on('error', () => res.destroy());
    }
  );
  up.setTimeout(30000, () => up.destroy(new Error('timeout')));
  up.on('error', (e) => {
    if (log) log(`auth proxy: ${req.method} ${pathname} failed: ${e.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('sign-in helper unreachable\n');
    } else res.destroy();
  });
  res.on('close', () => { if (!res.writableFinished) up.destroy(); });
  req.pipe(up);
}
