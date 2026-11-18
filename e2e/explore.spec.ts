import { expect, test } from './support';

test('explore: search for gold opens its detail dialog, Escape closes it', async ({ page }) => {
  await page.goto('./#/explore');
  await expect(page.getByRole('heading', { level: 1, name: 'The living table' })).toBeVisible();

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
