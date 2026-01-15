/**
 * Generate placeholder icons for StreamWatch extension
 * Run with: npm run generate-icons
 */

import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'public', 'icons');

// Ensure icons directory exists
if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

/**
 * Generate a StreamWatch icon at the specified size
 * Creates a red play button icon similar to video streaming apps
 */
function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background - dark rounded square
  const radius = size * 0.15;
  ctx.fillStyle = '#141414';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, radius);
  ctx.fill();

  // Play button triangle - Netflix red
  ctx.fillStyle = '#E50914';
  const padding = size * 0.25;
  const triangleWidth = size - padding * 2;
  const triangleHeight = size - padding * 2;

  ctx.beginPath();
  ctx.moveTo(padding + triangleWidth * 0.2, padding);
  ctx.lineTo(padding + triangleWidth * 0.2, padding + triangleHeight);
  ctx.lineTo(padding + triangleWidth, padding + triangleHeight / 2);
  ctx.closePath();
  ctx.fill();

  return canvas.toBuffer('image/png');
}

// Generate icons for each required size
const sizes = [16, 32, 48, 128];

console.log('Generating StreamWatch icons...');

sizes.forEach(size => {
  const filename = `icon${size}.png`;
  const filepath = join(iconsDir, filename);
  const buffer = generateIcon(size);
  writeFileSync(filepath, buffer);
  console.log(`  Created ${filename} (${size}x${size})`);
});

console.log('\nIcons created successfully in public/icons/');
