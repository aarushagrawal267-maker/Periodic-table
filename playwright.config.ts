import { defineConfig, devices } from '@playwright/test';

const PORT = 4180;
const BASE_URL = `http://localhost:${PORT}/`;

// The pinned @playwright/test may expect a different Chromium revision than the
// one installed on the machine. Point at the pre-installed binary when present;
// set PW_CHROMIUM_PATH="" to fall back to Playwright's own managed browser.
const executablePath = process.env.PW_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Retries hide flakes. A failure here is a real failure.
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 7_000 },
  reporter: process.env.CI ? [['list'], ['html', { outputFolder: './e2e/.report', open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    // The app is a PWA; a service worker would cache builds across runs.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Video needs Playwright's own ffmpeg build, which this machine lacks; opt in with PW_VIDEO=1.
    video: process.env.PW_VIDEO ? 'retain-on-failure' : 'off',
    launchOptions,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // Phone layout: bottom tab bar instead of the top nav.
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
      grep: /@phone/,
    },
  ],
  webServer: {
    // Builds into its own folder so it never clobbers dist/ used by other tools.
    command: `npx vite build --outDir e2e/.dist --emptyOutDir && npx vite preview --outDir e2e/.dist --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
