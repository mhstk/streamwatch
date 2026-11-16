// Disk cache: <cacheDir>/<mediaId>/{index.json, init.mp4, seg_<n>.m4s}. Files are written atomically
// (temp file + rename). Total size is kept under a limit by evicting the least recently used media
// (then, if still needed, segments of the active media that are furthest from the playhead).
// Media not used (served or written) for more than maxAgeDays are deleted (at startup, then every few
// hours). "Last used" survives restarts as the media directory's mtime: writes change it, and serving
// from the cache touches it (at most once per TOUCH_PERSIST_MS per media).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { log } from './util.mjs';

const TOUCH_PERSIST_MS = 5 * 60000;
const AGE_CLEANUP_EVERY_MS = 3 * 3600000;

export class DiskCache {
  constructor(dir, maxBytes, maxAgeDays = 0) {
    this.dir = dir;
    this.maxBytes = maxBytes;
    this.maxAgeDays = maxAgeDays; // 0: no age limit
    this.ageTimer = null;
    this.media = new Map(); // id -> {files: Map(name -> size), lastAccess, persistedAt}
    this.total = 0;
    this.protect = () => new Map(); // id -> playhead segment, for media that must not be evicted
    fs.mkdirSync(dir, { recursive: true });
    for (const id of fs.readdirSync(dir)) {
      const d = path.join(dir, id);
      let st;
      try { st = fs.statSync(d); } catch { continue; }
      if (!st.isDirectory()) continue;
      const files = new Map();
      for (const f of fs.readdirSync(d)) {
        const p = path.join(d, f);
        if (f.startsWith('.tmp-')) { fs.rmSync(p, { force: true }); continue; }
        const size = fs.statSync(p).size;
        files.set(f, size);
        this.total += size;
      }
      this.media.set(id, { files, lastAccess: st.mtimeMs, persistedAt: st.mtimeMs });
    }
  }

  path(id, name) { return path.join(this.dir, id, name); }

  has(id, name) { return !!this.media.get(id)?.files.has(name); }

  touch(id) {
    const m = this.media.get(id);
    if (!m) return;
    const now = Date.now();
    m.lastAccess = now;
    if (now - m.persistedAt > TOUCH_PERSIST_MS) {
      m.persistedAt = now;
      const t = new Date(now);
      fs.utimes(path.join(this.dir, id), t, t, () => {});
    }
  }

  readJson(id, name) {
    try { return JSON.parse(fs.readFileSync(this.path(id, name), 'utf8')); } catch { return null; }
  }

  async write(id, name, data) {
    let m = this.media.get(id);
    if (!m) { m = { files: new Map(), lastAccess: Date.now(), persistedAt: Date.now() }; this.media.set(id, m); }
    const d = path.join(this.dir, id);
    await fs.promises.mkdir(d, { recursive: true });
    const tmp = path.join(d, `.tmp-${crypto.randomBytes(6).toString('hex')}`);
    await fs.promises.writeFile(tmp, data);
    try {
      await fs.promises.rename(tmp, path.join(d, name));
    } catch (e) {
      await fs.promises.rm(tmp, { force: true });
      throw e;
    }
    this.total += data.length - (m.files.get(name) || 0);
    m.files.set(name, data.length);
    m.lastAccess = Date.now();
    m.persistedAt = m.lastAccess; // the rename changed the directory's mtime
    if (this.total > this.maxBytes) this.evict();
  }

  remove(id, name) {
    const m = this.media.get(id);
    if (!m || !m.files.has(name)) return;
    this.total -= m.files.get(name);
    m.files.delete(name);
    try { fs.rmSync(this.path(id, name), { force: true }); } catch { /* in use: left for the next scan */ }
  }

  removeMedia(id) {
    const m = this.media.get(id);
    if (!m) return 0;
    let size = 0;
    for (const s of m.files.values()) size += s;
    this.total -= size;
    this.media.delete(id);
    fs.rm(path.join(this.dir, id), { recursive: true, force: true }, () => {});
    return size;
  }

  /** Deletes media unused for more than maxAgeDays (never protected ones: active or recently requested). */
  cleanupOld() {
    if (!(this.maxAgeDays > 0)) return 0;
    const cutoff = Date.now() - this.maxAgeDays * 86400000;
    const active = this.protect();
    let count = 0;
    let bytes = 0;
    for (const [id, m] of [...this.media]) {
      if (m.lastAccess >= cutoff || active.has(id)) continue;
      bytes += this.removeMedia(id);
      count++;
    }
    if (count) log(`cache: removed ${count} video${count > 1 ? 's' : ''} unused for more than ${this.maxAgeDays} days (${Math.round(bytes / 1048576)} MB)`);
    return count;
  }

  /** Age cleanup now and then every few hours. */
  startAgeCleanup() {
    if (!(this.maxAgeDays > 0) || this.ageTimer) return;
    this.cleanupOld();
    this.ageTimer = setInterval(() => this.cleanupOld(), AGE_CLEANUP_EVERY_MS);
    this.ageTimer.unref();
  }

  evict() {
    const target = this.maxBytes * 0.9;
    const active = this.protect();
    const order = [...this.media.entries()].filter(([id]) => !active.has(id)).sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    for (const [id] of order) {
      if (this.total <= target) return;
      const size = this.removeMedia(id);
      log(`cache: evicted ${id} (${Math.round(size / 1048576)} MB)`);
    }
    // still too big: drop segments of active media furthest from where they are being watched
    const segs = [];
    for (const [id, playhead] of active) {
      const m = this.media.get(id);
      if (!m) continue;
      for (const [name, size] of m.files) {
        const n = /^seg_(\d+)\.m4s$/.exec(name);
        if (n) segs.push({ id, name, size, dist: Math.abs(Number(n[1]) - playhead) });
      }
    }
    segs.sort((a, b) => b.dist - a.dist);
    for (const s of segs) {
      if (this.total <= target || s.dist < 20) break;
      this.remove(s.id, s.name);
    }
  }
}
