import { expect, test } from './support';

test.describe('theme', { tag: '@phone' }, () => {
  test('Settings switches between System, Light and Dark, and the choice stays after a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('./');
    const html = page.locator('html');
    // System follows the device: dark here.
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('button', { name: 'Settings' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    const theme = dialog.getByRole('radiogroup', { name: 'Theme' });
    await expect(theme.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');

    await theme.getByRole('radio', { name: 'Light' }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f7f4ee');
    // The page really is light: the body background is the warm paper colour.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(247, 244, 238)');

    // Arrow keys move the choice, as in any radio group.
    await theme.getByRole('radio', { name: 'Light' }).press('ArrowRight');
    await expect(theme.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    await expect(theme.getByRole('radio', { name: 'Dark' })).toBeFocused();
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await theme.getByRole('radio', { name: 'Dark' }).press('ArrowLeft');
    await expect(html).toHaveAttribute('data-theme', 'light');

    // Saved on this device: a reload starts light, before React renders (no dark flash).
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('System follows the device colour scheme as it changes', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('the colour-blind palette still applies in the light theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('./');
    const alkali = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--cat-alkali-metal').trim());
    expect(await alkali()).toBe('#e5334f');
    await page.getByRole('button', { name: 'Settings' }).first().click();
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('switch', { name: 'Colour-blind palette' }).click();
    expect(await alkali()).toBe('#e69f00');
  });
});
