// Renders the Open Graph / Twitter card image public/og.png (1200x630) from scripts/og-image.html:
// the first three periods of the table as the app prints them, Periodica in the gap where a wall chart
// puts its title beside the mark, and chlorine's place left empty as the puzzle's hint target.
//
// Run with: node scripts/og-image.mjs   (after npm install; Node 22.18+ for type stripping; uses the Playwright Chromium the e2e suite uses)
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';
import { MARK_HEIGHT, MARK_WIDTH, markRects } from '../src/lib/brand.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM_PATH || (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(root, 'scripts/og-image.html')).href);
// The mark, from the same geometry as the header and the app icons, beside the 64px wordmark.
const MARK_PX = 46;
await page.evaluate(
  ({ w, h, px, rects }) => {
    const svg = document.getElementById('mark');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('height', String(px));
    svg.setAttribute('width', String(Math.round((px * w) / h)));
    svg.innerHTML = rects;
  },
  { w: MARK_WIDTH, h: MARK_HEIGHT, px: MARK_PX, rects: markRects((c) => `var(--cat-${c})`) },
);
await page.evaluate(() => document.fonts.ready);
const missing = await page.evaluate(() => [...document.fonts].filter((f) => f.status !== 'loaded').map((f) => f.family));
if (missing.length) throw new Error(`Fonts did not load: ${missing.join(', ')}. Run npm install first.`);
await page.screenshot({ path: join(root, 'public/og.png') });
await browser.close();
console.log('Wrote public/og.png');
