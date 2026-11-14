// Client for the streaming server (web/server). See README "Streaming server API".
import { getIdToken } from './auth';

/** VITE_STREAM_URL if set (no trailing slash), otherwise '' = same origin. */
export const STREAM_BASE: string = String((import.meta as any).env?.VITE_STREAM_URL || '').replace(/\/+$/, '');

export type StreamErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'bad_url'
  | 'source_gone'
  | 'unsupported'
  | 'internal'
  | 'network';

export class StreamError extends Error {
  readonly code: StreamErrorCode;
  readonly status: number;
  constructor(message: string, code: StreamErrorCode, status = 0) {
    super(message);
    this.name = 'StreamError';
    this.code = code;
    this.status = status;
  }
}

export interface OpenMediaResult {
  id: string;
  /** absolute URL of the full-length VOD playlist (includes STREAM_BASE) */
  playlist: string;
  duration: number;
  video: { codec: string; width: number; height: number };
  audio: { codec: string; channels: number; converted: boolean };
}

/** Absolute URL on the streaming server for a path like "/api/health". */
export function streamUrl(path: string): string {
  return (STREAM_BASE || window.location.origin) + (path.startsWith('/') ? path : '/' + path);
}

async function withToken(init: RequestInit, forceRefresh: boolean): Promise<RequestInit> {
  const headers = new Headers(init.headers);
  const token = await getIdToken(forceRefresh);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

/** fetch() to the streaming server with the Firebase bearer token; retries once on 401 with a fresh token. */
export async function streamFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = streamUrl(path);
  const res = await fetch(url, await withToken(init, false));
  const replayable = init.body == null || typeof init.body === 'string';
  if (res.status === 401 && replayable) {
    return fetch(url, await withToken(init, true));
  }
  return res;
}

const KNOWN_CODES: StreamErrorCode[] = ['unauthorized', 'forbidden', 'bad_url', 'source_gone', 'unsupported', 'internal'];

/** Ask the server to prepare a video; returns the HLS playlist to put in video.src. */
export async function openMedia(videoUrl: string): Promise<OpenMediaResult> {
  let res: Response;
  try {
    res = await streamFetch('/api/media/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: videoUrl }),
    });
  } catch (err) {
    throw new StreamError(err instanceof Error ? err.message : 'Streaming server unreachable', 'network');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || typeof data.playlist !== 'string') {
    const code: StreamErrorCode = KNOWN_CODES.includes(data?.code)
      ? data.code
      : res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : 'internal';
    throw new StreamError(data?.error || `Streaming server error (${res.status})`, code, res.status);
  }
  return { ...data, playlist: streamUrl(data.playlist) } as OpenMediaResult;
}

/** Playlist URL that starts loading at `seconds` (keeps the full timeline). */
export function withStart(playlistUrl: string, seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return playlistUrl;
  const url = new URL(playlistUrl, window.location.href);
  url.searchParams.set('start', String(Math.round(seconds * 1000) / 1000));
  return url.toString();
}
