// Server configuration: web/server/config.local.json (gitignored), created on first run.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIST_DIR = path.resolve(SERVER_DIR, '..', 'dist');
const CONFIG_FILE = process.env.STREAMWATCH_CONFIG || path.join(SERVER_DIR, 'config.local.json');

const DEFAULTS = {
  port: 8765,
  host: '0.0.0.0',
  // nobody is allowed until a uid is added to config.local.json; a refused sign-in logs its uid
  allowedUids: [],
  allowedOrigins: [],
  cacheMaxBytes: 3 * 1024 ** 3,
  cacheDir: '',
  secret: '',
};

export function loadConfig() {
  let file = {};
  let exists = false;
  try {
    file = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    exists = true;
  } catch (e) {
    if (e.code !== 'ENOENT') throw new Error(`cannot read ${CONFIG_FILE}: ${e.message}`);
  }
  const cfg = { ...DEFAULTS, ...file };
  if (!cfg.secret || String(cfg.secret).length < 32) {
    cfg.secret = crypto.randomBytes(32).toString('base64url');
    const toSave = exists ? { ...file, secret: cfg.secret } : {
      port: cfg.port,
      allowedUids: cfg.allowedUids,
      allowedOrigins: cfg.allowedOrigins,
      cacheMaxBytes: cfg.cacheMaxBytes,
      secret: cfg.secret,
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(toSave, null, 2) + '\n');
  }
  // environment overrides
  if (process.env.PORT) cfg.port = parseInt(process.env.PORT, 10);
  if (process.env.HOST) cfg.host = process.env.HOST;
  if (process.env.STREAMWATCH_CACHE_DIR) cfg.cacheDir = process.env.STREAMWATCH_CACHE_DIR;
  if (process.env.STREAMWATCH_CACHE_MAX_BYTES) cfg.cacheMaxBytes = Number(process.env.STREAMWATCH_CACHE_MAX_BYTES);
  cfg.cacheDir = path.resolve(SERVER_DIR, cfg.cacheDir || '.cache');
  cfg.devNoAuth = process.env.STREAMWATCH_DEV_NO_AUTH === '1';
  cfg.allowedUids = (cfg.allowedUids || []).map(String);
  cfg.allowedOrigins = (cfg.allowedOrigins || []).map((o) => String(o).replace(/\/+$/, ''));
  return cfg;
}
