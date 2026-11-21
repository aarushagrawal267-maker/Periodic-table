// Renders the Open Graph / Twitter card image public/og.png (1200x630) from scripts/og-image.html:
// the first three periods of the table as the app prints them, Periodica in the gap where a wall chart
// puts its title, and chlorine's place left empty as the puzzle's hint target.
//
// Run with: node scripts/og-image.mjs   (after npm install; uses the Playwright Chromium the e2e suite uses)
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM_PATH || (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(root, 'scripts/og-image.html')).href);
await page.evaluate(() => document.fonts.ready);
const missing = await page.evaluate(() => [...document.fonts].filter((f) => f.status !== 'loaded').map((f) => f.family));
if (missing.length) throw new Error(`Fonts did not load: ${missing.join(', ')}. Run npm install first.`);
await page.screenshot({ path: join(root, 'public/og.png') });
await browser.close();
console.log('Wrote public/og.png');
