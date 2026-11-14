// Small UI helpers shared by the home and settings pages (web only).
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

/** Live result of a CSS media query. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    [query]
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

/** Desktop layout (extension look): wide screen with a mouse. Below this, modals become bottom sheets. */
export const DESKTOP_QUERY = '(min-width: 1024px) and (hover: hover)';

/** Header layout with the tabs inline (the bottom tab bar is used below this). */
export const WIDE_QUERY = '(min-width: 768px)';

/** Prevent the page behind an overlay from scrolling while `active`. */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    const body = document.body;
    const scrollbar = window.innerWidth - html.clientWidth;
    const prev = { html: html.style.overflow, body: body.style.overflow, pad: body.style.paddingRight };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      html.style.overflow = prev.html;
      body.style.overflow = prev.body;
      body.style.paddingRight = prev.pad;
    };
  }, [active]);
}

/**
 * Let the browser Back button / gesture close an overlay: while `open`, an extra history
 * entry (same URL) is pushed, and going back to it calls `onClose`. Closing the overlay any
 * other way removes that entry again.
 *
 * Use it in a component that stays mounted (open toggles), not in the overlay itself.
 * Returns `release()`: call it right before navigating away while the overlay is open and
 * navigate with `{ replace: true }`, so the new page takes the overlay's history entry.
 */
export function useBackToClose(open: boolean, onClose: () => void): () => void {
  const pushed = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ ...(window.history.state ?? {}), swOverlay: true }, '');
    pushed.current = true;
    const onPop = () => {
      if (!pushed.current) return;
      pushed.current = false;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (pushed.current) {
        pushed.current = false;
        window.history.back();
      }
    };
  }, [open]);

  return useCallback(() => {
    pushed.current = false;
  }, []);
}

/** Escape key handler while `active`. */
export function useEscape(active: boolean, onEscape: () => void): void {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ref.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);
}
