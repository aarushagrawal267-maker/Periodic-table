// Draws the app icons from the mark in src/lib/brand.ts (the periodic table's silhouette as flat squares) with the
// dark theme's colours from src/styles/index.css (:root), so the icons and the header can never drift apart:
//
//   public/icon.svg            favicon and install icon: the mark on the dark ramp, rounded corners
//   public/icon-maskable.svg   Android adaptive icon: full bleed, the mark inside the central safe zone
//   public/icon-192.png        PNG copies of icon.svg for launchers that do not take SVG
//   public/icon-512.png
//   public/apple-touch-icon.png  iOS home screen (180px, square: iOS rounds the corners itself)
//
// Run with: node scripts/brand-icons.mjs   (Node 22.18+ for type stripping; uses the Playwright Chromium the e2e suite uses)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { MARK_HEIGHT, MARK_WIDTH, markRects } from '../src/lib/brand.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/styles/index.css'), 'utf8');
// The first :root block holds the dark theme, the one the icons are printed in.
const dark = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
const token = (name) => {
  const m = dark.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  if (!m) throw new Error(`No --${name} hex value in :root of src/styles/index.css`);
  return m[1];
};
const BG = token('bg');
const fill = (category) => token(`cat-${category}`);

/** The mark centred in a 512 box, `width` units wide. */
function markGroup(width) {
  const scale = width / MARK_WIDTH;
  const x = (512 - width) / 2;
  const y = (512 - MARK_HEIGHT * scale) / 2;
  const r = (n) => Math.round(n * 1000) / 1000;
  return `<g transform="translate(${r(x)} ${r(y)}) scale(${r(scale)})">${markRects(fill)}</g>`;
}
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${body}</svg>\n`;

// Favicon: the mark spans most of the tile so it still reads at 16px.
const icon = svg(`<rect width="512" height="512" rx="112" fill="${BG}"/>${markGroup(416)}`);
// Maskable: the safe zone is a circle of 40% radius (204.8 units); the mark's corners stay inside it.
const maskWidth = 320;
const half = Math.hypot(maskWidth, (maskWidth * MARK_HEIGHT) / MARK_WIDTH) / 2;
if (half > 204.8) throw new Error('The maskable mark leaves the safe zone');
const maskable = svg(`<rect width="512" height="512" fill="${BG}"/>${markGroup(maskWidth)}`);
// iOS rounds the corners itself and shows any transparency as black, so a full-bleed square with a little more room.
const apple = svg(`<rect width="512" height="512" fill="${BG}"/>${markGroup(352)}`);

writeFileSync(join(root, 'public/icon.svg'), icon);
writeFileSync(join(root, 'public/icon-maskable.svg'), maskable);

const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM_PATH || (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
async function png(markup, size, file, transparent) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const sized = markup.replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
  await page.screenshot({ path: join(root, 'public', file), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await png(icon, 192, 'icon-192.png', true);
await png(icon, 512, 'icon-512.png', true);
await png(apple, 180, 'apple-touch-icon.png', false);
await browser.close();
console.log('Wrote public/icon.svg, icon-maskable.svg, icon-192.png, icon-512.png, apple-touch-icon.png');
