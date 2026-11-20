import { expect, test } from './support';

/**
 * The default build has no Firebase config, so accounts are off and the app makes no request to
 * Firebase or Google and never loads the SDK chunk (docs/ACCOUNTS.md 6.7 and 8.2).
 */
const FIREBASE_HOSTS = /googleapis\.com|firebaseapp\.com|firebaseio\.com|gstatic\.com|127\.0\.0\.1:(9099|8080)\b|localhost:(9099|8080)\b/;

test('an unconfigured build makes no Firebase requests', async ({ page, consoleErrors }) => {
  const offending: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (FIREBASE_HOSTS.test(url) || /firebase-sdk|\/sync-[^/]*\.js/.test(url)) offending.push(url);
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // No account entry in the header: no "Sign in" and no avatar.
  const banner = page.getByRole('banner');
  await expect(banner.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
  await expect(banner.getByRole('link', { name: /^Your account/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings' }).first().click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await expect(settings.getByText('Progress is saved on this device only. Nothing is sent anywhere.')).toBeVisible();
  await expect(settings.getByRole('link', { name: /Sign in|Manage account/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.goto('./#/progress');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // The account screen exists, but says accounts are off.
  await page.goto('./#/account');
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts are not set up yet' })).toBeVisible();
  await expect(page).toHaveTitle('Your account · Periodica');
  await expect(page.getByText('Your progress is saved in this browser, on this device. You can keep playing as you are.')).toBeVisible();
  await page.waitForLoadState('networkidle');

  expect(offending).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('periodica-sync'))).toBeNull();
  expect(consoleErrors).toEqual([]);
});

test('the account screen is reachable on phones and keeps the header and tab bar @phone', async ({ page, consoleErrors }) => {
  const offending: string[] = [];
  page.on('request', (req) => {
    if (FIREBASE_HOSTS.test(req.url()) || /firebase-sdk/.test(req.url())) offending.push(req.url());
  });
  await page.goto('./#/account');
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts are not set up yet' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to home' }).click();
  await expect(page).toHaveURL(/#\/$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.waitForLoadState('networkidle');
  expect(offending).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
