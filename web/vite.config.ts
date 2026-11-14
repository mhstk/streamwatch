import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const web = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(web, '..');
const norm = (p: string) => p.split(path.sep).join('/');
/** comparison key for a file path (Windows paths are case-insensitive) */
const fileKey = (p: string) => {
  const n = norm(path.resolve(p)).replace(/\.(tsx?|jsx?|mjs)$/, '');
  return process.platform === 'win32' ? n.toLowerCase() : n;
};

const SAMPLE = 'https://media.w3.org/2010/05/sintel/trailer.mp4';

/**
 * Swaps extension modules that need browser-extension APIs for web versions
 * (see README "Sharing code with the extension"). Matching is done on the resolved
 * file, so `@/hooks/useAuth`, `./useAuth` (from src/hooks) and `../hooks/useAuth`
 * are all caught, while unrelated files named useAuth are not.
 */
function moduleSwaps(demo: boolean): Plugin {
  const swaps = new Map<string, string>();
  const swap = (from: string, to: string) => swaps.set(fileKey(from), norm(to));
  swap(path.join(repo, 'src/hooks/useAuth'), path.join(web, 'src/platform/useAuth.ts'));
  swap(path.join(repo, 'src/lib/auth'), path.join(web, 'src/platform/auth.ts'));
  if (demo) {
    const authMock = path.join(repo, 'dev-harness/useAuth.mock.ts');
    swap(path.join(repo, 'src/hooks/useAuth'), authMock);
    swap(path.join(web, 'src/platform/useAuth'), authMock);
    swap(path.join(repo, 'src/lib/firestore'), path.join(repo, 'dev-harness/firestore.mock.ts'));
  }

  const toAbsolute = (source: string, importer?: string): string | null => {
    // vite's alias plugin runs first, so `@/x` usually arrives here already absolute
    if (path.isAbsolute(source) || /^[A-Za-z]:\//.test(source)) return source.split('?')[0];
    if (source.startsWith('@/')) return path.join(repo, 'src', source.slice(2));
    if (source.startsWith('~/')) return path.join(web, 'src', source.slice(2));
    if ((source.startsWith('./') || source.startsWith('../')) && importer && !importer.startsWith('\0')) {
      return path.resolve(path.dirname(importer.split('?')[0]), source);
    }
    return null;
  };

  return {
    name: 'streamwatch-module-swaps',
    enforce: 'pre',
    resolveId(source, importer) {
      const abs = toAbsolute(source, importer);
      if (!abs) return null;
      return swaps.get(fileKey(abs)) ?? null;
    },
  };
}

/** Demo only: any /media/<token>/<name>.mkv plays a public sample clip; /media/expired/... returns 403 (same as dev-harness). */
function demoMedia(): Plugin {
  return {
    name: 'streamwatch-demo-media',
    configureServer(server) {
      server.middlewares.use('/media', (req, res) => {
        if ((req.url || '').startsWith('/expired')) {
          res.statusCode = 403;
          res.end('expired');
          return;
        }
        res.statusCode = 302;
        res.setHeader('Location', SAMPLE);
        res.end();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, web, 'VITE_');
  const demo = mode === 'demo' || env.VITE_DEMO === '1' || process.env.VITE_DEMO === '1';
  const streamTarget = 'http://localhost:8765';

  return {
    root: web,
    base: '/',
    publicDir: path.join(web, 'public'),
    plugins: [moduleSwaps(demo), react(), ...(demo ? [demoMedia()] : [])],
    define: demo ? { 'import.meta.env.VITE_DEMO': JSON.stringify('1') } : {},
    resolve: {
      alias: [
        { find: /^@\//, replacement: norm(path.join(repo, 'src')) + '/' },
        { find: /^~\//, replacement: norm(path.join(web, 'src')) + '/' },
      ],
    },
    css: {
      postcss: web,
    },
    server: {
      port: demo ? 5175 : 5174,
      strictPort: true,
      host: true,
      fs: { allow: [repo] },
      // /api and /hls go to the streaming server (web/server, port 8765)
      proxy: {
        '/api': { target: streamTarget, changeOrigin: true },
        '/hls': { target: streamTarget, changeOrigin: true },
      },
    },
    build: {
      outDir: path.join(web, 'dist'),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase';
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
            return undefined;
          },
        },
      },
    },
  };
});
