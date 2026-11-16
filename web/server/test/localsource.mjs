// Test helper: serves the .mkv files of a local directory over http://127.0.0.1 with Range support,
// standing in for the video host (the server needs STREAMWATCH_DEV_LOCAL_SOURCES=1 to accept it).
// Counts open connections and requests in progress so tests can check that nothing is left open.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export async function startLocalSource(dir, port = 0) {
  const sockets = new Set();
  let active = 0;
  let requests = 0;
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1));
    const file = path.join(dir, path.basename(name));
    let st;
    try { st = fs.statSync(file); } catch { res.writeHead(404); res.end(); return; }
    requests++;
    active++;
    res.on('close', () => { active--; });
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    const start = m ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? Math.min(parseInt(m[2], 10), st.size - 1) : st.size - 1;
    if (start >= st.size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); res.end(); return; }
    const headers = { 'Content-Type': 'video/x-matroska', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 };
    if (m) headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
    res.writeHead(m ? 206 : 200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    const rs = fs.createReadStream(file, { start, end });
    rs.on('error', () => res.destroy());
    res.on('close', () => rs.destroy());
    rs.pipe(res);
  });
  server.keepAliveTimeout = 2000;
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.mkv')).sort();
  return {
    base,
    episodes: files.map((f) => ({ id: f.replace(/\.mkv$/i, ''), url: `${base}/${encodeURIComponent(f)}` })),
    stats: () => ({ connections: sockets.size, active, requests }),
    close: () => new Promise((resolve) => { for (const s of sockets) s.destroy(); server.close(() => resolve()); }),
  };
}
