// Device / browser capabilities.

const mq = (q: string) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches;

/** Primary input is touch (no hover). Evaluated once at load. */
export const isTouch: boolean = mq('(hover: none)') || mq('(pointer: coarse)');

/** iPhone / iPod / iPad, including iPadOS which reports itself as a Mac with touch. */
export const isIOS: boolean =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Safari or any iOS browser (all WebKit): native HLS, no MKV. */
export const isSafariFamily: boolean = isIOS || /^Apple/.test(navigator.vendor || '');

/** Installed to the home screen / running as a PWA. */
export const isStandalone: boolean =
  mq('(display-mode: standalone)') || (navigator as Navigator & { standalone?: boolean }).standalone === true;

let hlsNative: boolean | null = null;
export function canPlayHlsNatively(): boolean {
  if (hlsNative == null) {
    const v = document.createElement('video');
    hlsNative = v.canPlayType('application/vnd.apple.mpegurl') !== '' || v.canPlayType('application/x-mpegURL') !== '';
  }
  return hlsNative;
}

const DIRECT_EXT = /\.(mp4|m4v|mov)$/i;

function pathOf(videoUrl: string): string {
  try {
    return decodeURIComponent(new URL(videoUrl, window.location.href).pathname);
  } catch {
    return videoUrl.split(/[?#]/)[0];
  }
}

/**
 * README rule: Safari-family browsers (native HLS, no MKV) need the streaming server for
 * anything that is not .mp4/.m4v/.mov; everything else plays the link directly.
 */
export function needsStreamServer(videoUrl: string): boolean {
  if (!isSafariFamily || !canPlayHlsNatively()) return false;
  return !DIRECT_EXT.test(pathOf(videoUrl));
}
