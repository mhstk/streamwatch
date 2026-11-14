// Side-effect module: defines the subset of `window.chrome` that shared extension modules use
// (chrome.storage in useSettings, chrome.runtime.getURL in utils, ...). Import before anything else.
// chrome.storage.* is backed by localStorage; extension page URLs are mapped to web routes.
import { navigate } from '~/router';
import { version } from '../../../package.json';

type Listener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void;
type Callback<T> = ((value: T) => void) | undefined;

const PREFIX = 'sw:chrome:';
const listeners: Listener[] = [];

function fire(changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string): void {
  if (Object.keys(changes).length === 0) return;
  setTimeout(() => {
    for (const fn of [...listeners]) {
      try {
        fn(changes, area);
      } catch (err) {
        console.error('[chrome-shim] onChanged listener failed', err);
      }
    }
  }, 0);
}

function parse(raw: string | null): unknown {
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Calls the callback (async, like Chrome) and returns a promise, so both API forms work. */
function settle<T>(value: T, cb: Callback<T>): Promise<T> {
  if (cb) setTimeout(() => cb(value), 0);
  return Promise.resolve(value);
}

function storageArea(name: string) {
  const prefix = `${PREFIX}${name}:`;
  const keysInArea = () => {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length));
    }
    return out;
  };
  const read = (k: string) => parse(localStorage.getItem(prefix + k));

  return {
    get(keys?: string | string[] | Record<string, unknown> | null, cb?: Callback<Record<string, unknown>>) {
      if (typeof keys === 'function') {
        cb = keys as unknown as Callback<Record<string, unknown>>;
        keys = null;
      }
      const out: Record<string, unknown> = {};
      if (keys == null) {
        for (const k of keysInArea()) out[k] = read(k);
      } else if (typeof keys === 'string' || Array.isArray(keys)) {
        for (const k of typeof keys === 'string' ? [keys] : keys) {
          const v = read(k);
          if (v !== undefined) out[k] = v;
        }
      } else {
        for (const [k, def] of Object.entries(keys)) {
          const v = read(k);
          out[k] = v === undefined ? def : v;
        }
      }
      return settle(out, cb);
    },
    set(items: Record<string, unknown>, cb?: () => void) {
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const [k, v] of Object.entries(items)) {
        const oldValue = read(k);
        localStorage.setItem(prefix + k, JSON.stringify(v));
        changes[k] = { oldValue, newValue: v };
      }
      fire(changes, name);
      return settle(undefined, cb);
    },
    remove(keys: string | string[], cb?: () => void) {
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const k of typeof keys === 'string' ? [keys] : keys) {
        const oldValue = read(k);
        localStorage.removeItem(prefix + k);
        if (oldValue !== undefined) changes[k] = { oldValue };
      }
      fire(changes, name);
      return settle(undefined, cb);
    },
    clear(cb?: () => void) {
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const k of keysInArea()) {
        changes[k] = { oldValue: read(k) };
        localStorage.removeItem(prefix + k);
      }
      fire(changes, name);
      return settle(undefined, cb);
    },
    getBytesInUse(_keys?: unknown, cb?: Callback<number>) {
      return settle(0, cb);
    },
  };
}

/** Extension page path -> web route (absolute URL on this origin, like chrome.runtime.getURL). */
export function extensionPathToRoute(p: string): string {
  const raw = String(p).replace(/^\/+/, '');
  const cut = raw.search(/[?#]/);
  const file = cut >= 0 ? raw.slice(0, cut) : raw;
  const rest = cut >= 0 ? raw.slice(cut) : '';
  const routes: Record<string, string> = {
    'index.html': '/watch',
    'src/home/home.html': '/',
    'src/settings/settings.html': '/settings',
    'src/popup/popup.html': '/',
  };
  const route = routes[file] ?? '/' + file;
  return window.location.origin + route + rest;
}

function goTo(url: string): void {
  try {
    const target = new URL(url, window.location.href);
    if (target.origin === window.location.origin) {
      navigate(target.pathname + target.search + target.hash);
      return;
    }
  } catch {
    // fall through
  }
  window.location.assign(url);
}

function install(): void {
  const w = window as unknown as { chrome?: Record<string, any> };
  const chromeObj: Record<string, any> = w.chrome && typeof w.chrome === 'object' ? w.chrome : {};

  // never replace a real extension storage API
  if (!chromeObj.storage?.sync) {
    chromeObj.storage = {
      sync: storageArea('sync'),
      local: storageArea('local'),
      session: storageArea('session'),
      onChanged: {
        addListener: (fn: Listener) => { listeners.push(fn); },
        removeListener: (fn: Listener) => {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        },
        hasListener: (fn: Listener) => listeners.includes(fn),
      },
    };
    // other tabs writing the same keys
    window.addEventListener('storage', (e) => {
      if (!e.key || !e.key.startsWith(PREFIX)) return;
      const [area, ...keyParts] = e.key.slice(PREFIX.length).split(':');
      const key = keyParts.join(':');
      fire({ [key]: { oldValue: parse(e.oldValue), newValue: parse(e.newValue) } }, area);
    });
  }

  if (typeof chromeObj.runtime?.getURL !== 'function') {
    chromeObj.runtime = {
      id: undefined,
      lastError: undefined,
      getURL: extensionPathToRoute,
      getManifest: () => ({ manifest_version: 3, name: 'StreamWatch', version }),
      openOptionsPage: (cb?: () => void) => {
        navigate('/settings');
        return settle(undefined, cb);
      },
      // there is no background worker on the web
      sendMessage: (...args: unknown[]) => {
        const cb = args.find((a) => typeof a === 'function') as Callback<unknown>;
        return settle({ success: false, error: 'not available on the web' }, cb);
      },
      onMessage: { addListener() {}, removeListener() {}, hasListener: () => false },
    };
  }

  if (typeof chromeObj.tabs?.create !== 'function') {
    chromeObj.tabs = {
      create: (props: { url?: string }, cb?: Callback<unknown>) => {
        if (props?.url) goTo(props.url);
        return settle({}, cb);
      },
    };
  }

  if (!w.chrome) {
    try {
      w.chrome = chromeObj;
    } catch {
      Object.defineProperty(window, 'chrome', { value: chromeObj, configurable: true, writable: true });
    }
  }
}

install();
