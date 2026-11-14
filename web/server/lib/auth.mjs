// Firebase ID token verification (RS256, Google's securetoken certificates) and signed HLS grants.
import crypto from 'node:crypto';
import { ApiError, log } from './util.mjs';

const PROJECT_ID = 'streamwatch-2dfd2';
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const GRANT_TTL_S = 12 * 3600;

let certs = null; // Map kid -> KeyObject
let certsExpire = 0;
let certsLoading = null;

async function loadCerts(force = false) {
  if (!force && certs && Date.now() < certsExpire) return certs;
  if (!certsLoading) {
    certsLoading = (async () => {
      const res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`certificate download failed (${res.status})`);
      const body = await res.json();
      const map = new Map();
      for (const [kid, pem] of Object.entries(body)) map.set(kid, new crypto.X509Certificate(pem).publicKey);
      const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
      certs = map;
      certsExpire = Date.now() + (maxAge ? parseInt(maxAge[1], 10) : 3600) * 1000;
      return map;
    })().finally(() => { certsLoading = null; });
  }
  return certsLoading;
}

function b64json(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

/** Verifies a Firebase ID token; returns its uid. Throws ApiError('unauthorized'). */
export async function verifyIdToken(token) {
  const bad = (why) => new ApiError('unauthorized', `invalid sign-in token (${why})`);
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw bad('malformed');
  let header;
  let payload;
  try { header = b64json(parts[0]); payload = b64json(parts[1]); } catch { throw bad('malformed'); }
  if (header.alg !== 'RS256' || !header.kid) throw bad('algorithm');
  let keys;
  try { keys = await loadCerts(); } catch (e) {
    log(`auth: ${e.message}`);
    throw new ApiError('internal', 'cannot verify sign-in right now', 503);
  }
  let key = keys.get(header.kid);
  if (!key) {
    try { keys = await loadCerts(true); } catch { /* keep old */ }
    key = keys.get(header.kid);
  }
  if (!key) throw bad('unknown key');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw bad('signature');
  const now = Math.floor(Date.now() / 1000);
  const skew = 300;
  if (payload.aud !== PROJECT_ID) throw bad('audience');
  if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) throw bad('issuer');
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw bad('expired');
  if (typeof payload.iat !== 'number' || payload.iat > now + skew) throw bad('issued in the future');
  if (payload.auth_time !== undefined && payload.auth_time > now + skew) throw bad('auth time');
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) throw bad('subject');
  return payload.sub;
}

export function makeGrant(secret, id, now = Date.now()) {
  const exp = Math.floor(now / 1000) + GRANT_TTL_S;
  const sig = crypto.createHmac('sha256', secret).update(`${id}.${exp}`).digest('base64url');
  return `${exp}.${sig}`;
}

/** True when the grant was issued by this server for this media id and has not expired. */
export function checkGrant(secret, id, grant) {
  const m = /^(\d{9,12})\.([A-Za-z0-9_-]{43})$/.exec(String(grant || ''));
  if (!m) return false;
  if (Number(m[1]) <= Date.now() / 1000) return false;
  const want = crypto.createHmac('sha256', secret).update(`${id}.${m[1]}`).digest();
  const got = Buffer.from(m[2], 'base64url');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
