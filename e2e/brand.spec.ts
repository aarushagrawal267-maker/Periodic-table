import { expect, test } from './support';

/** Computed fills of the header mark's squares, in drawing order. */
async function markFills(page: import('@playwright/test').Page) {
  const link = page.getByRole('banner').getByRole('link', { name: 'Periodica home' });
  await expect(link).toBeVisible();
  return link.locator('svg rect').evaluateAll((rects) => rects.map((r) => getComputedStyle(r).fill));
}

async function setSettings(page: import('@playwright/test').Page, state: Record<string, unknown>) {
  await page.addInitScript((s) => localStorage.setItem('periodica-settings', JSON.stringify({ version: 4, state: s })), state);
}

test.describe('brand', { tag: '@phone' }, () => {
  test('the header mark is the table silhouette in the theme’s category colours', async ({ page }) => {
    await setSettings(page, { theme: 'dark' });
    await page.goto('./');
    const fills = await markFills(page);
    expect(fills).toHaveLength(11);
    // Hydrogen (nonmetal) first, helium (noble gas) second, as src/lib/brand.ts lists them: dark theme hex values.
    expect(fills.slice(0, 3)).toEqual(['rgb(96, 165, 250)', 'rgb(232, 121, 249)', 'rgb(255, 93, 115)']);
    // The wordmark and the accessible name stay.
    await expect(page.getByRole('banner').getByRole('link', { name: 'Periodica home' })).toContainText('Periodica');
  });

  test('the mark follows the light theme and the colour-blind palette', async ({ page }) => {
    await setSettings(page, { theme: 'light' });
    await page.goto('./');
    expect((await markFills(page)).slice(0, 3)).toEqual(['rgb(47, 125, 225)', 'rgb(194, 61, 214)', 'rgb(229, 51, 79)']);

    await setSettings(page, { theme: 'dark', colorblind: true });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-colorblind', 'true');
    expect((await markFills(page)).slice(0, 3)).toEqual(['rgb(0, 114, 178)', 'rgb(187, 187, 187)', 'rgb(230, 159, 0)']);
  });

  test('the app icons are served', async ({ page, request }) => {
    await page.goto('./');
    for (const sel of ['link[rel="icon"]', 'link[rel="apple-touch-icon"]']) {
      const href = await page.locator(sel).getAttribute('href');
      expect(href, sel).toBeTruthy();
      const res = await request.get(new URL(href!, page.url()).href);
      expect(res.status(), sel).toBe(200);
    }
  });
});

test('the current section in the top nav carries a cobalt marker on the header edge', async ({ page }) => {
  await setSettings(page, { theme: 'light' });
  await page.goto('./#/learn');
  const nav = page.getByRole('navigation', { name: 'Main' });
  const current = nav.getByRole('link', { name: 'Learn' });
  await expect(current).toHaveAttribute('aria-current', 'page');
  const mark = current.locator('.nav-mark');
  await expect(mark).toHaveCount(1);
  // Only the current item has one.
  await expect(nav.locator('.nav-mark')).toHaveCount(1);
  const accent = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.color = 'var(--accent)';
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  expect(await mark.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(accent);
  // It sits on the header's bottom edge.
  const [markBox, header] = await Promise.all([mark.boundingBox(), page.getByRole('banner').boundingBox()]);
  expect(Math.abs(markBox!.y + markBox!.height - (header!.y + header!.height - 1))).toBeLessThanOrEqual(1);

  await nav.getByRole('link', { name: 'Explore' }).click();
  await expect(nav.getByRole('link', { name: 'Explore' }).locator('.nav-mark')).toHaveCount(1);
  await expect(nav.locator('.nav-mark')).toHaveCount(1);
});
