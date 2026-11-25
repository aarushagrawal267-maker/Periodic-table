import { expect, test } from './support';

test.describe('home and navigation', { tag: '@phone' }, () => {
  test('home loads without console errors and the main nav reaches every section', async ({ page, consoleErrors }, testInfo) => {
    const phone = testInfo.project.name === 'phone';

    await page.goto('./');

    // A new visitor gets one clear first step: the first 20 elements, a lesson at a time.
    await expect(page.getByRole('heading', { level: 1, name: /^Learn the first 20 elements\./ })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Your first 20 elements' })).toHaveAttribute('aria-valuenow', '0');
    await expect(page.getByRole('link', { name: 'Start the first lesson' })).toHaveAttribute('href', '#/learn/lightest-ten');
    await expect(page.getByRole('link', { name: 'Try a quick game' })).toHaveAttribute('href', '#/match');
    await expect(page.getByRole('banner').getByRole('img', { name: 'Daily goal: 0 of 150 XP' })).toBeVisible();
    // Nothing is due for review yet.
    await expect(page.getByText(/ready for a quick review/)).toHaveCount(0);

    // Only one "Main" nav is rendered for each layout: top bar on desktop, tab bar on phones.
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');

    const sections = [
      { link: 'Learn', hash: '#/learn', heading: 'Learn it, then play it' },
      { link: 'Play', hash: '#/play', heading: 'Choose a region' },
      { link: 'Explore', hash: '#/explore', heading: 'The periodic table' },
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

test('an unknown lesson or puzzle link shows an ordinary page, with the navigation and a main landmark', async ({ page }) => {
  await page.goto('./#/learn/no-such-chapter');
  await expect(page.getByRole('heading', { level: 1, name: 'Learn it, then play it' })).toBeVisible();
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Learn' })).toHaveAttribute('aria-current', 'page');

  await page.goto('./#/play/no-such-region');
  await expect(page.getByRole('heading', { level: 1, name: /^Learn the first 20 elements\./ })).toBeVisible();
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveTitle(/^Periodic table game and quiz/);
});
