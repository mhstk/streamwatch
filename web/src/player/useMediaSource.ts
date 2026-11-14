// Chooses how the <video> gets its media (README "Choosing how to play a video"):
//  1. needsStreamServer(url) (or ?stream=1) -> openMedia(url), play the returned HLS playlist,
//     loading it from the resume point with withStart().
//  2. otherwise the direct link.
//  3. one automatic fallback from direct to the streaming server on "format not supported"
//     before anything played (the caller decides when and calls fallbackToStream()).
// hls.js is loaded from cdnjs only when the browser has no native HLS.
// The original link stays the video's identity; the playlist URL is only a playback detail.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { openMedia, withStart, StreamError, type OpenMediaResult, type StreamErrorCode } from '~/platform/stream';
import { canPlayHlsNatively, needsStreamServer } from '~/platform/env';

const HLS_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.17/hls.min.js';

type HlsCtor = any; // loaded at runtime from cdnjs, no types available
let hlsPromise: Promise<HlsCtor> | null = null;

function loadHlsJs(): Promise<HlsCtor> {
  const w = window as unknown as { Hls?: HlsCtor };
  if (w.Hls) return Promise.resolve(w.Hls);
  if (!hlsPromise) {
    hlsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = HLS_JS_URL;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = () => (w.Hls ? resolve(w.Hls) : reject(new Error('hls.js did not load')));
      s.onerror = () => {
        hlsPromise = null;
        s.remove();
        reject(new Error('Could not load hls.js'));
      };
      document.head.appendChild(s);
    });
  }
  return hlsPromise;
}

export type SourceMode = 'direct' | 'stream';

export interface MediaSourceState {
  mode: SourceMode;
  /** value for <video src>; undefined while preparing or when hls.js drives the element */
  src: string | undefined;
  /** openMedia is running / waiting for the resume position */
  preparing: boolean;
  /** openMedia failed */
  streamError: StreamErrorCode | null;
  /** the stream path was reached by the automatic fallback from a direct link */
  fellBack: boolean;
  /** hls.js could not play the stream */
  hlsFailed: boolean;
  /** start position baked into the playlist URL (0 = from the beginning) */
  startApplied: number;
  /** switch a failed direct link to the streaming server once; false if not possible */
  fallbackToStream: () => boolean;
  /** stream path: open the media again (new playlist) */
  retry: () => void;
}

interface Options {
  videoUrl: string;
  videoRef: RefObject<HTMLVideoElement>;
  /** ?stream=1: treat needsStreamServer() as true (testing) */
  forceStream: boolean;
  /** saved progress + settings are known, so the start position can be decided */
  startReady: boolean;
  /** where to start the stream (resume position), 0 for the beginning */
  startAt: number;
}

export function useMediaSource({ videoUrl, videoRef, forceStream, startReady, startAt }: Options): MediaSourceState {
  const [mode, setMode] = useState<SourceMode>(() =>
    forceStream || needsStreamServer(videoUrl) ? 'stream' : 'direct'
  );
  const [fellBack, setFellBack] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [opened, setOpened] = useState<OpenMediaResult | null>(null);
  const [streamError, setStreamError] = useState<StreamErrorCode | null>(null);
  const [streamSrc, setStreamSrc] = useState<string | null>(null);
  const [hlsFailed, setHlsFailed] = useState(false);
  const startAppliedRef = useRef(0);
  const useHlsJs = mode === 'stream' && !canPlayHlsNatively();

  // Ask the streaming server for a playlist
  useEffect(() => {
    if (mode !== 'stream') return;
    let cancelled = false;
    setOpened(null);
    setStreamSrc(null);
    setStreamError(null);
    setHlsFailed(false);
    openMedia(videoUrl)
      .then((res) => { if (!cancelled) setOpened(res); })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[player] openMedia failed', err);
        setStreamError(err instanceof StreamError ? err.code : 'internal');
      });
    return () => { cancelled = true; };
  }, [mode, attempt, videoUrl]);

  // Once the resume position is known, fix the playlist URL (only once per opened playlist)
  useEffect(() => {
    if (mode !== 'stream' || !opened || !startReady || streamSrc) return;
    const start = startAt > 0 ? startAt : 0;
    startAppliedRef.current = start;
    setStreamSrc(withStart(opened.playlist, start));
  }, [mode, opened, startReady, startAt, streamSrc]);

  // Browsers without native HLS: attach hls.js
  useEffect(() => {
    if (!useHlsJs || !streamSrc) return;
    const video = videoRef.current;
    if (!video) return;
    let destroyed = false;
    let hls: any = null;
    loadHlsJs()
      .then((Hls) => {
        if (destroyed) return;
        if (!Hls.isSupported()) {
          setHlsFailed(true);
          return;
        }
        let networkRetries = 0;
        let mediaRecovered = false;
        hls = new Hls({ enableWorker: true });
        hls.on(Hls.Events.ERROR, (_evt: unknown, data: any) => {
          if (!data?.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 2) {
            networkRetries++;
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovered) {
            mediaRecovered = true;
            hls.recoverMediaError();
          } else {
            console.warn('[player] hls.js fatal error', data?.details);
            setHlsFailed(true);
          }
        });
        hls.loadSource(streamSrc);
        hls.attachMedia(video);
      })
      .catch((err) => {
        console.warn('[player]', err);
        if (!destroyed) setHlsFailed(true);
      });
    return () => {
      destroyed = true;
      try { hls?.destroy(); } catch { /* ignore */ }
    };
  }, [useHlsJs, streamSrc, videoRef]);

  const fallbackToStream = useCallback((): boolean => {
    if (mode !== 'direct' || fellBack) return false;
    setFellBack(true);
    setMode('stream');
    return true;
  }, [mode, fellBack]);

  const retry = useCallback(() => {
    if (mode === 'stream') setAttempt((a) => a + 1);
  }, [mode]);

  let src: string | undefined;
  if (mode === 'direct') src = videoUrl;
  else if (streamSrc && !useHlsJs) src = streamSrc;

  return {
    mode,
    src,
    preparing: mode === 'stream' && !streamError && !streamSrc,
    streamError,
    fellBack,
    hlsFailed,
    startApplied: mode === 'stream' && streamSrc ? startAppliedRef.current : 0,
    fallbackToStream,
    retry,
  };
}
