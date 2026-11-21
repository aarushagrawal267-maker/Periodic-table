// Finds a Playwright whose Chromium is actually installed. The repo's own @playwright/test may be a newer
// release than the browsers on this machine, so try each copy of the package until one launches.
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './data.mjs';

function candidates() {
  const list = [];
  if (process.env.REELS_PLAYWRIGHT) list.push(process.env.REELS_PLAYWRIGHT);
  const fromRepo = createRequire(join(REPO_ROOT, 'package.json'));
  try {
    list.push(fromRepo.resolve('playwright'));
  } catch {}
  for (const dir of [...(process.env.NODE_PATH ?? '').split(':'), '/opt/node-tools/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules', '/opt/node22/lib/node_modules']) {
    if (dir && existsSync(join(dir, 'playwright', 'package.json'))) list.push(join(dir, 'playwright', 'index.js'));
  }
  return [...new Set(list)];
}

/** Any Chromium build Playwright has downloaded, newest first, for a package whose own build is missing. */
function installedChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    .map((d) => join(root, d, 'chrome-linux64', 'chrome'))
    .filter(existsSync);
}

const ARGS = ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb', '--hide-scrollbars'];

export async function launchChromium() {
  const errors = [];
  for (const path of candidates()) {
    const req = createRequire(path);
    let pw;
    try {
      pw = req(path);
    } catch (e) {
      errors.push(`${path}: ${e.message.split('\n')[0]}`);
      continue;
    }
    try {
      return await pw.chromium.launch({ args: ARGS });
    } catch (e) {
      errors.push(`${path}: ${e.message.split('\n')[0]}`);
    }
    for (const exe of installedChromium()) {
      try {
        return await pw.chromium.launch({ args: ARGS, executablePath: exe });
      } catch (e) {
        errors.push(`${path} with ${exe}: ${e.message.split('\n')[0]}`);
      }
    }
  }
  throw new Error(`Could not launch Chromium through Playwright. Install it with \`npx playwright install chromium\`.\n${errors.join('\n')}`);
}
