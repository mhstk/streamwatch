// Uses the extension's Tailwind config as a preset so colours, fonts and tokens are shared, not copied.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import extensionConfig from '../tailwind.config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const abs = (p) => path.join(here, p).split(path.sep).join('/');

/** @type {import('tailwindcss').Config} */
export default {
  presets: [extensionConfig],
  // web.css component classes kept even before a page uses them
  safelist: ['sheet', 'sheet-backdrop', 'sheet-handle'],
  content: [
    abs('index.html'),
    abs('src/**/*.{js,ts,jsx,tsx,html}'),
    // shared extension components may be imported from @/...
    abs('../src/**/*.{js,ts,jsx,tsx,html}'),
  ],
};
