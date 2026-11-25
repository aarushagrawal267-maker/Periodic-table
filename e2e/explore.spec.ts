import { expect, test } from './support';

test('explore: search for gold opens its detail dialog, Escape closes it', async ({ page }) => {
  await page.goto('./#/explore');
  await expect(page.getByRole('heading', { level: 1, name: 'The periodic table' })).toBeVisible();

  const search = page.getByRole('textbox', { name: 'Search elements' });
  await search.fill('gold');
  await search.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Gold details' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { level: 2, name: 'Gold' })).toBeVisible();
  await expect(dialog.getByText('Element 79', { exact: false })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(search).toHaveValue('gold');
});

test('explore: an element link opens its card, and going back closes it with the screen', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('./#/explore/Au');
  const dialog = page.getByRole('dialog', { name: 'Gold details' });
  await expect(dialog).toBeVisible();

  // The card belongs to Explore: back to Home must not leave it open over the home screen.
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: /Learn the first 20 elements/ })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  // Once the card has faded out, focus goes to the new screen's heading, as after any other screen change.
  await expect(page.locator('#main h1')).toBeFocused();
});

test('explore: leaving for a full-screen game with the card open closes it and focuses the game heading', async ({ page }) => {
  await page.goto('./#/explore/Au');
  await expect(page.getByRole('dialog', { name: 'Gold details' })).toBeVisible();
  await page.goto('./#/quiz');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Quick quiz' })).toBeFocused();
});

test('explore: the lens tabs are one Tab stop, and the arrow keys, Home and End choose a lens', async ({ page }) => {
  await page.goto('./#/explore');
  const tabs = page.getByRole('tablist', { name: 'Colour the table by' });
  const category = tabs.getByRole('tab', { name: 'Category' });
  await expect(category).toHaveAttribute('aria-selected', 'true');
  await expect(category).toHaveAttribute('aria-controls', 'explore-table');

  await page.getByRole('textbox', { name: 'Search elements' }).focus();
  await page.keyboard.press('Tab');
  await expect(category).toBeFocused();

  // Browser shortcuts (Alt+Left is Back) are not lens keys.
  await page.keyboard.press('Alt+ArrowRight');
  await expect(category).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('ArrowRight');
  const state = tabs.getByRole('tab', { name: 'State' });
  await expect(state).toBeFocused();
  await expect(state).toHaveAttribute('aria-selected', 'true');
  await expect(category).toHaveAttribute('aria-selected', 'false');

  await page.keyboard.press('End');
  await expect(tabs.getByRole('tab', { name: 'My mastery' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(category).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.getByRole('tab', { name: 'My mastery' })).toHaveAttribute('aria-selected', 'true');

  // Only the chosen lens is in the Tab order, so the next Tab goes into the table.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'H, Hydrogen, 1' })).toBeFocused();
});
