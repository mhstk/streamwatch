// Tiny History-API router (no library). Use navigate() and <Link>, never window.location.
import { useMemo, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

const NAV_EVENT = 'sw:navigate';

function emit(): void {
  window.dispatchEvent(new Event(NAV_EVENT));
}

/** Strip a same-origin absolute URL down to path+search+hash; null for other origins. */
function toLocalPath(to: string): string | null {
  try {
    const url = new URL(to, window.location.href);
    if (url.origin !== window.location.origin) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

export interface NavigateOptions {
  replace?: boolean;
}

/** Go to a path in the app (or a same-origin absolute URL). Other origins do a full page load. */
export function navigate(to: string, options: NavigateOptions = {}): void {
  const local = toLocalPath(to);
  if (local == null) {
    window.location.assign(to);
    return;
  }
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (local === current) return;
  const prevPath = window.location.pathname;
  if (options.replace) window.history.replaceState(null, '', local);
  else window.history.pushState(null, '', local);
  if (new URL(local, window.location.origin).pathname !== prevPath) window.scrollTo(0, 0);
  emit();
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('popstate', cb);
  window.addEventListener(NAV_EVENT, cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener(NAV_EVENT, cb);
  };
}

const getPath = () => window.location.pathname;
const getSearch = () => window.location.search;

export interface Route {
  /** pathname without trailing slash ("/" for the root) */
  path: string;
  query: URLSearchParams;
}

export function useRoute(): Route {
  const rawPath = useSyncExternalStore(subscribe, getPath);
  const search = useSyncExternalStore(subscribe, getSearch);
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;
  const query = useMemo(() => new URLSearchParams(search), [search]);
  return useMemo(() => ({ path, query }), [path, query]);
}

export type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean };

/** <a> that navigates in-app; modified / middle clicks and target=_blank behave like a normal link. */
export function Link({ to, replace, onClick, target, ...rest }: LinkProps) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ||
      (target && target !== '_self') ||
      toLocalPath(to) == null
    ) {
      return;
    }
    e.preventDefault();
    navigate(to, { replace });
  };
  return <a href={to} target={target} onClick={handleClick} {...rest} />;
}

/** Route of the player for a video link. */
export function playerPath(videoUrl: string): string {
  return `/watch?url=${encodeURIComponent(videoUrl)}`;
}
