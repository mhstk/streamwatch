(() => {
  // ?reset restores the sample data and default settings
  if (new URLSearchParams(location.search).has('reset')) {
    localStorage.clear();
    history.replaceState(null, '', location.pathname + location.hash);
  }
  const listeners = [];
  const area = (name) => ({
    get(keys, cb) {
      const out = {};
      const list = keys == null ? Object.keys(localStorage).filter((k) => k.startsWith(name + ':')).map((k) => k.slice(name.length + 1))
        : Array.isArray(keys) ? keys : [keys];
      for (const k of list) {
        const raw = localStorage.getItem(name + ':' + k);
        if (raw != null) out[k] = JSON.parse(raw);
      }
      const p = Promise.resolve(out);
      if (cb) setTimeout(() => cb(out), 0);
      return p;
    },
    set(obj, cb) {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) {
        const old = localStorage.getItem(name + ':' + k);
        localStorage.setItem(name + ':' + k, JSON.stringify(v));
        changes[k] = { oldValue: old ? JSON.parse(old) : undefined, newValue: v };
      }
      setTimeout(() => { listeners.forEach((fn) => fn(changes, name)); cb && cb(); }, 0);
      return Promise.resolve();
    },
    remove(k, cb) { localStorage.removeItem(name + ':' + k); cb && cb(); return Promise.resolve(); },
  });
  window.chrome = {
    runtime: {
      getURL: (p) => '/' + String(p).replace(/^\//, ''),
      sendMessage: (msg, cb) => {
        const res = msg && msg.type === 'GET_VIDEO_SOURCE'
          ? { success: true, sourceUrl: 'https://example.com/shows/source-page' }
          : { success: false, error: 'harness' };
        cb && setTimeout(() => cb(res), 0);
      },
      lastError: undefined,
      openOptionsPage: () => { location.href = '/src/settings/settings.html'; },
      getManifest: () => ({ version: '1.0.0' }),
      onMessage: { addListener() {} },
    },
    storage: {
      sync: area('sync'),
      local: area('local'),
      session: area('session'),
      onChanged: {
        addListener: (fn) => listeners.push(fn),
        removeListener: (fn) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
      },
    },
    tabs: { create: ({ url }) => { location.href = url; } },
  };
})();
