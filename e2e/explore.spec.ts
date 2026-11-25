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
