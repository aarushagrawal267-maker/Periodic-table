import { expect, test } from './support';

test.describe('home hero table', { tag: '@phone' }, () => {
  test('selecting a tile opens its card, and closing it hands focus back to the tile', async ({ page, consoleErrors }) => {
    await page.goto('./');
    const table = page.getByRole('group', { name: /^Periodic table\./ });
    await expect(table.getByRole('button')).toHaveCount(118);

    const iron = table.getByRole('button', { name: 'Fe, Iron, 26' });
    await iron.click();
    const dialog = page.getByRole('dialog', { name: 'Iron details' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 2, name: 'Iron' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(iron).toBeFocused();
    expect(consoleErrors).toEqual([]);
  });

  test('the table is one Tab stop and the arrow keys move between tiles', async ({ page }) => {
    await page.goto('./');
    const table = page.getByRole('group', { name: /^Periodic table\./ });
    await page.getByRole('link', { name: 'Try a quick game' }).focus();
    await page.keyboard.press('Tab');
    await expect(table.getByRole('button', { name: 'H, Hydrogen, 1' })).toBeFocused();
    // Only one tile is in the Tab order.
    await expect(table.locator('button[tabindex="0"]')).toHaveCount(1);

    await page.keyboard.press('ArrowDown');
    await expect(table.getByRole('button', { name: 'Li, Lithium, 3' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    const beryllium = table.getByRole('button', { name: 'Be, Beryllium, 4' });
    await expect(beryllium).toBeFocused();
    await expect(table.locator('button[tabindex="0"]')).toHaveAttribute('aria-label', 'Be, Beryllium, 4');

    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Beryllium details' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(beryllium).toBeFocused();

    // Tab leaves the table in one step.
    await page.keyboard.press('Tab');
    await expect(table.locator(':focus')).toHaveCount(0);
  });
});

test('a returning student sees the elements they have met in colour on the hero table', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => {
    const mastery: Record<number, { s: number; c: number; w: number; t: number }> = {};
    for (let n = 1; n <= 20; n++) mastery[n] = { s: 2, c: 2, w: 0, t: Date.now() };
    localStorage.setItem(
      'periodica-progress',
      JSON.stringify({ version: 2, state: { xp: 400, mastery, chapters: { 'lightest-ten': 3, 'next-ten': 3 }, stats: { rounds: 2, placements: 20, mistakes: 0, quizzes: 0, bestCombo: 5, playMs: 1000 } } }),
    );
  });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /^Next: / })).toBeVisible();
  await expect(page.getByText('In colour: the 20 of 118 you have met')).toBeVisible();
  const table = page.getByRole('group', { name: /^Periodic table\./ });
  await expect(table.getByRole('button', { name: 'Ca, Calcium, 20' })).toBeVisible();
  await expect(table.getByRole('button', { name: 'Sc, Scandium, 21, not met yet' })).toBeVisible();
  // One table on the page: the hero's.
  await expect(page.getByRole('group', { name: /^Periodic table\./ })).toHaveCount(1);
  await expect(page.getByRole('link', { name: /XP to next level/ })).toBeVisible();
});

test('the hero table prints in on the first visit, and not at all with Reduce motion', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.hero-cell')).toHaveCount(118);
  await expect(page.locator('.hero-cell.hero-print')).toHaveCount(118);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('.hero-cell')).toHaveCount(118);
  await expect(page.locator('.hero-cell.hero-print')).toHaveCount(0);

  // The app's own Reduce motion setting does the same, whatever the system says.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => localStorage.setItem('periodica-settings', JSON.stringify({ version: 4, state: { reduceMotion: true } })));
  await page.reload();
  await expect(page.locator('.hero-cell')).toHaveCount(118);
  await expect(page.locator('.hero-cell.hero-print')).toHaveCount(0);
});
