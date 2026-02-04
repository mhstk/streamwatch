// Build script for Chrome Web Store (removes 'key' field from manifest and creates zip)
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(__dirname, '../dist/manifest.json');
const distPath = resolve(__dirname, '../dist');
const zipPath = resolve(__dirname, '../StreamWatch-webstore.zip');

// Read manifest
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// Remove key field
delete manifest.key;

// Write back
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('✓ Removed "key" field from manifest.json');

// Remove old zip if exists
if (existsSync(zipPath)) {
  unlinkSync(zipPath);
}

// Create zip
try {
  execSync(`cd "${distPath}" && zip -r "${zipPath}" . -x "*.DS_Store"`, { stdio: 'inherit' });
  console.log('✓ Created StreamWatch-webstore.zip');
  console.log(`\n📦 Ready for Chrome Web Store: StreamWatch-webstore.zip`);
} catch (error) {
  console.error('Failed to create zip. Make sure zip is installed.');
  console.log('You can manually zip the dist/ folder.');
}
