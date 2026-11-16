// Locates the ffmpeg/ffprobe binaries: FFMPEG_BIN (a directory) first, then the winget install
// location on Windows, then PATH.
import fs from 'node:fs';
import path from 'node:path';
import { log } from './util.mjs';

function findFfmpegDir() {
  if (process.env.FFMPEG_BIN) return process.env.FFMPEG_BIN;
  if (process.platform === 'win32') {
    try {
      const pkgs = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
      for (const pkg of fs.readdirSync(pkgs).filter((d) => d.startsWith('Gyan.FFmpeg'))) {
        for (const build of fs.readdirSync(path.join(pkgs, pkg))) {
          const bin = path.join(pkgs, pkg, build, 'bin');
          if (fs.existsSync(path.join(bin, 'ffmpeg.exe'))) return bin;
        }
      }
    } catch { /* fall through */ }
  }
  return ''; // rely on PATH
}

const dir = findFfmpegDir();
const exe = process.platform === 'win32' ? '.exe' : '';
export const FFMPEG = dir ? path.join(dir, 'ffmpeg' + exe) : 'ffmpeg';
export const FFPROBE = dir ? path.join(dir, 'ffprobe' + exe) : 'ffprobe';

/** All ffmpeg children, killed on shutdown. */
export const children = new Set();

const STOP_CHECK_MS = 3000;

/**
 * Stops a child for good. A plain kill() is SIGTERM on Linux, which ffmpeg traps to finish its output;
 * with nobody reading its stdout any more it then blocks forever. Nothing it would still write is
 * wanted, so: SIGKILL, and destroy our ends of its pipes. Logs if it is still there a few seconds later.
 */
export function stopChild(proc, label = 'ffmpeg') {
  if (!proc) return;
  const running = () => proc.exitCode === null && proc.signalCode === null;
  if (running()) { try { proc.kill('SIGKILL'); } catch { /* gone */ } }
  for (const s of proc.stdio || []) { try { s?.destroy(); } catch { /* closed */ } }
  if (!running() || proc.stopCheck) return;
  proc.stopCheck = setTimeout(() => {
    if (!running()) return;
    log(`${label}: ffmpeg (pid ${proc.pid}) still running ${STOP_CHECK_MS / 1000} s after being stopped; killing again`);
    try { proc.kill('SIGKILL'); } catch { /* gone */ }
  }, STOP_CHECK_MS);
  proc.stopCheck.unref();
  proc.once('exit', () => clearTimeout(proc.stopCheck));
}

export function killAll() {
  for (const p of children) stopChild(p);
  children.clear();
}
