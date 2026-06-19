// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Vorion LLC

/**
 * One-off PWA icon generator. Renders the RAINBOW mark (the favicon arcs) to the
 * PNG sizes the manifest + iOS need, and writes them to public/icons/. Run once
 * locally and COMMIT the resulting PNGs — this is intentionally NOT wired into
 * `next build` (keeps `sharp`'s native binary off the Vercel build path).
 *
 *   npm run gen:icons
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

// The mark, in a 32-unit canvas (arcs sit on the y=24 baseline + a dot).
const ART = `
  <g fill="none" stroke-linecap="round">
    <path d="M5 24a11 11 0 0 1 22 0" stroke="#ef4444" stroke-width="2.4"/>
    <path d="M8.5 24a8.5 8.5 0 0 1 15 0" stroke="#eab308" stroke-width="2.4"/>
    <path d="M12 24a5.5 5.5 0 0 1 8 0" stroke="#22c55e" stroke-width="2.4"/>
  </g>
  <circle cx="16" cy="24" r="1.6" fill="#a855f7"/>`;

// "any": rounded-rect tile (shown as-is).
const anySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#05050a"/>${ART}</svg>`;
// "maskable": full-bleed bg (the OS applies its own shape) + art pulled into the
// ~80% safe zone so adaptive masks never clip the arcs.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#05050a"/><g transform="translate(16 16) scale(0.76) translate(-16 -17.5)">${ART}</g></svg>`;
// iOS apple-touch-icon: full-bleed square (iOS rounds it), art at normal size.
const appleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#05050a"/>${ART}</svg>`;

const TARGETS = [
  { svg: anySvg, size: 192, file: 'icon-192.png' },
  { svg: anySvg, size: 512, file: 'icon-512.png' },
  { svg: maskableSvg, size: 192, file: 'icon-192-maskable.png' },
  { svg: maskableSvg, size: 512, file: 'icon-512-maskable.png' },
  { svg: appleSvg, size: 180, file: 'apple-touch-icon.png' },
];

await mkdir(OUT, { recursive: true });
for (const { svg, size, file } of TARGETS) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(OUT, file));
  console.log(`✓ ${file} (${size}×${size})`);
}
console.log(`Done → ${OUT}`);
