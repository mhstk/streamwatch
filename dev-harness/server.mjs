// Demo / dev harness: `npm run demo`, then open http://localhost:5199/src/home/home.html
//
// Serves the extension pages in a normal browser tab - no need to load the
// extension into Chrome - with a fake `chrome` API, a fake signed-in user and
// a localStorage-backed stand-in for Firestore filled with sample data.
// Nothing here ships in the extension build.
//   /src/home/home.html           library + history
//   /src/settings/settings.html   settings
//   /src/popup/popup.html         toolbar popup
// Add ?reset to any URL to restore the sample data.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..').split(path.sep).join('/');

const shim = fs.readFileSync(path.join(here, 'chrome-shim.js'), 'utf8');
const SAMPLE = 'https://media.w3.org/2010/05/sintel/trailer.mp4';
const norm = (p) => p.replace(/\\/g, '/');

const server = await createServer({
  configFile: false,
  root: project,
  plugins: [
    react(),
    {
      name: 'harness',
      transformIndexHtml: () => [{ tag: 'script', children: shim, injectTo: 'head-prepend' }],
      configureServer(s) {
        // any /media/<token>/<Release_Name>.mkv plays the same public sample clip;
        // /media/expired/... simulates an expired link
        s.middlewares.use('/media', (req, res) => {
          if (req.url.startsWith('/expired')) {
            res.statusCode = 403;
            res.end('expired');
            return;
          }
          res.statusCode = 302;
          res.setHeader('Location', SAMPLE);
          res.end();
        });
      },
    },
  ],
  resolve: {
    alias: [
      { find: /^@\/lib\/firestore$/, replacement: norm(path.join(here, 'firestore.mock.ts')) },
      { find: /^(@\/hooks\/useAuth|\.\/useAuth)$/, replacement: norm(path.join(here, 'useAuth.mock.ts')) },
      { find: /^@\//, replacement: project + '/src/' },
    ],
  },
  server: { port: 5199, strictPort: true, fs: { strict: false } },
  logLevel: 'info',
});
await server.listen();
server.printUrls();
