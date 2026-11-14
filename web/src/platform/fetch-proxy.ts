// Side-effect module: api.subsource.net does not allow cross-site calls, so requests to it are
// sent through the streaming server (/api/proxy/subsource/...) with the Firebase bearer token.
// Everything else goes to the original fetch untouched.
import { getIdToken } from './auth';
import { STREAM_BASE } from './stream';

const SUBSOURCE = 'https://api.subsource.net/';
const FLAG = '__swFetchProxy';

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function install(): void {
  const w = window as unknown as Record<string, unknown>;
  if (w[FLAG]) return;
  w[FLAG] = true;

  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input);
    if (!url.startsWith(SUBSOURCE)) return original(input, init);

    const target = `${STREAM_BASE || window.location.origin}/api/proxy/subsource/${url.slice(SUBSOURCE.length)}`;
    // keep method, headers and body of the original request
    const src = input instanceof Request ? input : null;
    const method = (init?.method ?? src?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers ?? src?.headers);
    let body = init?.body;
    if (body === undefined && src && method !== 'GET' && method !== 'HEAD') {
      body = await src.clone().arrayBuffer();
    }
    const token = await getIdToken().catch(() => null);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return original(target, {
      ...init,
      method,
      headers,
      body,
      signal: init?.signal ?? src?.signal,
    });
  };
}

install();
