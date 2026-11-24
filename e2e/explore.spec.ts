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
