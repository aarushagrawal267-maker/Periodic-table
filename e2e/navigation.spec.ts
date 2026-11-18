import { expect, test } from './support';

test.describe('home and navigation', { tag: '@phone' }, () => {
  test('home loads without console errors and the main nav reaches every section', async ({ page, consoleErrors }, testInfo) => {
    const phone = testInfo.project.name === 'phone';

    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Only one "Main" nav is rendered for each layout: top bar on desktop, tab bar on phones.
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');

    const sections = [
      { link: 'Learn', hash: '#/learn', heading: 'Learn it, then play it' },
      { link: 'Play', hash: '#/play', heading: 'Choose a region' },
      { link: 'Explore', hash: '#/explore', heading: 'The living table' },
      ...(phone ? [] : [{ link: 'Progress', hash: '#/progress', heading: 'Your progress' }]),
      { link: 'Home', hash: '#/', heading: undefined },
    ];

    for (const s of sections) {
      await nav.getByRole('link', { name: s.link }).click();
      await expect(page).toHaveURL(new RegExp(`${s.hash.replace('/', '\\/')}$`));
      await expect(nav.getByRole('link', { name: s.link })).toHaveAttribute('aria-current', 'page');
      if (s.heading) await expect(page.getByRole('heading', { level: 1, name: s.heading })).toBeVisible();
    }

    // Daily is an immersive screen without the nav; it has its own way back.
    await nav.getByRole('link', { name: 'Daily' }).click();
    await expect(page).toHaveURL(/#\/daily$/);
    await expect(page.getByRole('heading', { level: 1, name: /^Daily #\d+$/ })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to home' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(nav).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });
});
