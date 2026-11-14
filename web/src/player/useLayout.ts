// Which player layout fits the device right now.
//  desktop   >= 1024px with a mouse: the extension's layout
//  portrait  phones/tablets upright: video on top, page scrolls below
//  landscape phones/tablets sideways: video fills the screen
import { useSyncExternalStore } from 'react';

export type PlayerLayout = 'desktop' | 'portrait' | 'landscape';

const DESKTOP_QUERY = '(hover: hover) and (pointer: fine) and (min-width: 1024px)';
const LANDSCAPE_QUERY = '(orientation: landscape)';

function current(): PlayerLayout {
  if (typeof window === 'undefined' || !window.matchMedia) return 'desktop';
  if (window.matchMedia(DESKTOP_QUERY).matches) return 'desktop';
  return window.matchMedia(LANDSCAPE_QUERY).matches ? 'landscape' : 'portrait';
}

function subscribe(cb: () => void): () => void {
  const lists = [DESKTOP_QUERY, LANDSCAPE_QUERY].map((q) => window.matchMedia(q));
  lists.forEach((l) => l.addEventListener?.('change', cb));
  window.addEventListener('resize', cb);
  window.addEventListener('orientationchange', cb);
  return () => {
    lists.forEach((l) => l.removeEventListener?.('change', cb));
    window.removeEventListener('resize', cb);
    window.removeEventListener('orientationchange', cb);
  };
}

export function usePlayerLayout(): PlayerLayout {
  return useSyncExternalStore(subscribe, current, () => 'desktop');
}
