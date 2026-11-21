// Real screenshots of the live app for the end card. Shots are cached in social/out/.cache/app/ and the
// committed ones in social/reels/assets/ are the fallback, so a reel renders offline too.
import { existsSync, mkdirSync, statSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { REELS_DIR, REPO_ROOT } from './data.mjs';

export const APP_URL = 'https://aarushagrawal267-maker.github.io/Periodic-table/';
const CACHE = join(REPO_ROOT, 'social', 'out', '.cache', 'app');
const ASSETS = join(REELS_DIR, 'assets');
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const routeOf = (shot) => (shot.kind === 'element' ? `#/explore/${shot.symbol.toLowerCase()}` : shot.kind === 'explore' ? '#/explore' : '');
const fileOf = (shot) => (shot.kind === 'element' ? `app-element-${shot.symbol.toLowerCase()}.png` : `app-${shot.kind}.png`);

async function capture(browser, shot, path) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce', serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    await page.goto(APP_URL + routeOf(shot), { waitUntil: 'networkidle', timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    await page.screenshot({ path });
  } finally {
    await context.close();
  }
}

/**
 * Paths of the screenshots a plan asks for. `live`: false never touches the network.
 * `refresh`: true captures again even when a cached copy is fresh (and rewrites the committed assets).
 */
export async function appShots(browser, shots, { live = true, refresh = false, log = () => {} } = {}) {
  mkdirSync(CACHE, { recursive: true });
  const out = [];
  for (const shot of shots) {
    const name = fileOf(shot);
    const cached = join(CACHE, name);
    const committed = join(ASSETS, name);
    const fresh = existsSync(cached) && Date.now() - statSync(cached).mtimeMs < MAX_AGE_MS;
    if (live && (refresh || !fresh)) {
      try {
        await capture(browser, shot, cached);
        if (refresh && shot.kind !== 'element') copyFileSync(cached, committed);
        log(`captured ${APP_URL}${routeOf(shot)}`);
      } catch (e) {
        log(`could not capture ${routeOf(shot) || 'home'} (${e.message.split('\n')[0]}); using a saved shot`);
      }
    }
    if (existsSync(cached)) out.push(cached);
    else if (existsSync(committed)) out.push(committed);
    else {
      // No card for this element yet: show a committed screen the reel does not already use.
      const used = new Set(shots.map((s) => s.kind));
      out.push(join(ASSETS, shot.kind === 'element' && !used.has('explore') ? 'app-explore.png' : 'app-home.png'));
    }
  }
  return out;
}
