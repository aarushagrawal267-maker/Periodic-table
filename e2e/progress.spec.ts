import { expect, test, type Page } from './support';

/** A student who mastered hydrogen, is halfway on lithium and has started helium. */
async function seed(page: Page, opts: { seen?: Record<number, number>; reduceMotion?: boolean } = {}) {
  // Before the app loads (once per tab, so a reload shows what the app itself saved).
  await page.addInitScript(({ seen, reduceMotion }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const mastery = { 1: { s: 4, c: 4, w: 0, t: 1 }, 2: { s: 1, c: 1, w: 0, t: 1 }, 3: { s: 2, c: 2, w: 0, t: 1 } };
    localStorage.setItem('periodica-progress', JSON.stringify({ version: 2, state: { mastery } }));
    if (seen) localStorage.setItem('periodica-map-seen', JSON.stringify({ v: 1, s: seen }));
    if (reduceMotion) localStorage.setItem('periodica-settings', JSON.stringify({ version: 4, state: { reduceMotion: true } }));
  }, opts);
  await page.goto('./#/progress');
  await expect(page.getByRole('heading', { level: 1, name: 'Your progress' })).toBeVisible();
}

const map = (page: Page) => page.getByRole('group', { name: /^Mastery map/ });

test('progress: the mastery map shows each element’s step, the key counts them and a tile opens its card @phone', async ({ page, consoleErrors }) => {
  await seed(page);
  const grid = map(page);
  await expect(grid.getByRole('button', { name: 'H, Hydrogen, 1: mastered' })).toBeVisible();
  await expect(grid.getByRole('button', { name: 'Li, Lithium, 3: learning, 2 of 4' })).toBeVisible();
  await expect(grid.getByRole('button', { name: /^He, Helium, 2: learning, 1 of 4/ })).toBeVisible();
  await expect(grid.getByRole('button', { name: /^Fe, Iron, 26: not started yet$/ })).toBeAttached();
  // The three coloured tiles fill in with the opening sweep; empty slots have nothing to fill.
  await expect(grid.locator('.pm-sweep')).toHaveCount(3);

  const key = page.getByRole('list', { name: 'Key' });
  await expect(key.getByRole('listitem').filter({ hasText: 'Mastered' })).toContainText('1');
  await expect(key.getByRole('listitem').filter({ hasText: 'Learning' })).toContainText('2');
  await expect(key.getByRole('listitem').filter({ hasText: 'Not started' })).toContainText('115');

  // Per family: lithium is learning, hydrogen (a nonmetal) is mastered.
  await expect(page.getByText('Alkali metals: 0 of 6 mastered, 1 learning')).toBeAttached();
  await expect(page.getByText('Nonmetals: 1 of 7 mastered')).toBeAttached();

  await grid.getByRole('button', { name: 'H, Hydrogen, 1: mastered' }).click();
  await expect(page.getByRole('dialog', { name: 'Hydrogen details' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('progress: the map is one Tab stop and the arrow keys move between elements', async ({ page }) => {
  await seed(page);
  const h = map(page).getByRole('button', { name: 'H, Hydrogen, 1: mastered' });
  await h.focus();
  await page.keyboard.press('ArrowDown');
  await expect(map(page).getByRole('button', { name: 'Li, Lithium, 3: learning, 2 of 4' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Lithium details' })).toBeVisible();
});

test('progress: elements that moved up since the last visit are named once, and the snapshot stays out of saved progress', async ({ page }) => {
  await seed(page, { seen: { 1: 3, 3: 2 } });
  await expect(page.getByText('Since your last visit, 2 elements moved up:')).toContainText('H, He');
  await expect(map(page).getByRole('button', { name: 'H, Hydrogen, 1: mastered, moved up since your last visit' })).toBeVisible();
  await expect(map(page).getByRole('button', { name: 'Li, Lithium, 3: learning, 2 of 4' })).toBeVisible();

  const stored = await page.evaluate(() => ({ seen: localStorage.getItem('periodica-map-seen'), progress: localStorage.getItem('periodica-progress') }));
  expect(JSON.parse(stored.seen!)).toEqual({ v: 1, s: { 1: 4, 2: 1, 3: 2 } });
  expect(stored.progress).not.toContain('seen');

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Your progress' })).toBeVisible();
  await expect(map(page).getByRole('button', { name: 'H, Hydrogen, 1: mastered' })).toBeVisible();
  await expect(page.getByText(/Since your last visit/)).toHaveCount(0);
});

test('progress: an empty map points to the first lesson and outlines its elements @phone', async ({ page }) => {
  await page.goto('./#/progress');
  const start = page.getByRole('link', { name: /Your map is empty/ });
  await expect(start).toHaveAttribute('href', '#/learn/lightest-ten');
  await expect(map(page).getByRole('button', { name: 'H, Hydrogen, 1: not started yet, in your next lesson' })).toBeAttached();
  await expect(map(page).getByRole('button', { name: 'Na, Sodium, 11: not started yet' })).toBeAttached();
  const fit = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(fit).toBe(true);
});

test('progress: with Reduce motion on, the map neither sweeps nor rings', async ({ page }) => {
  await seed(page, { seen: { 1: 3, 3: 2 }, reduceMotion: true });
  await expect(map(page).getByRole('button', { name: /moved up since your last visit/ })).toHaveCount(2);
  await expect(map(page).locator('.pm-fill')).toHaveCount(3);
  await expect(page.locator('.pm-sweep')).toHaveCount(0);
  await expect(page.locator('.pm-up')).toHaveCount(0);
});
