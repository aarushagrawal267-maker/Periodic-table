import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Account flows in a real browser against the auth and Firestore emulators (docs/ACCOUNTS.md 6.6): several
 * tabs of one browser, a browser closed and reopened, the cached copy in IndexedDB. Run with
 * `npm run test:accounts:e2e` (or `npm run test:accounts`, which also runs the emulator suites), which
 * starts the emulators. The dev server runs in mode `emulators` (.env.emulators, demo-periodica).
 */
const PORT = 5197;
const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM_PATH || (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

export default defineConfig({
  testDir: './e2e-accounts',
  outputDir: './e2e-accounts/.results',
  // The tests share the emulators and use several tabs each: one at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [['list'], ['html', { outputFolder: './e2e-accounts/.report', open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `npx vite --mode emulators --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/e2e-accounts/harness.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
