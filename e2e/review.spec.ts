import { expect, test } from './support';

test('review: a new player has nothing due and is pointed to the first chapter', async ({ page, consoleErrors }) => {
  await page.goto('./#/learn');
  await expect(page.getByRole('heading', { level: 1, name: 'Learn it, then play it' })).toBeVisible();
  await expect(page.getByRole('link', { name: /ready for a quick review/ })).toHaveCount(0);

  await page.goto('./#/learn/review');
  await expect(page.getByRole('heading', { level: 1, name: 'Quick review' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'All caught up' })).toBeVisible();
  // No flashcards and no game for an empty deck.
  await expect(page.getByRole('progressbar', { name: 'Cards learned' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Skip to game' })).toHaveCount(0);

  const next = page.getByRole('link', { name: 'The lightest ten' });
  await expect(next).toHaveAttribute('href', '#/learn/lightest-ten');
  await expect(page.getByRole('link', { name: 'Back to the learning path' })).toHaveAttribute('href', '#/learn');

  await next.click();
  await expect(page.getByRole('heading', { level: 1, name: 'The lightest ten' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
