// Locates the ffmpeg/ffprobe binaries: FFMPEG_BIN (a directory) first, then the winget install
// location on Windows, then PATH.
import fs from 'node:fs';
import path from 'node:path';

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

export function killAll() {
  for (const p of children) { try { p.kill('SIGKILL'); } catch { /* gone */ } }
  children.clear();
}
