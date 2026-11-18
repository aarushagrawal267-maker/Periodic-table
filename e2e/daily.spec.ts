import { Board, expect, test } from './support';

test('daily: complete today\'s challenge once, then the page shows it as done', async ({ page }) => {
  await page.goto('./#/daily');
  const start = page.getByRole('button', { name: "Start today's challenge" });
  await expect(start).toBeVisible();
  await expect(page.getByText('Completed today')).toHaveCount(0);
  await start.click();

  const board = new Board(page);
  await board.waitForStart();
  expect(await board.total()).toBe(12);
  await board.placeAll();

  const results = board.results();
  await expect(results).toBeVisible();
  await expect(results.getByText(/^Daily Challenge #\d+$/)).toBeVisible();
  await expect(results.getByText('12/12')).toBeVisible();
  await results.getByRole('button', { name: 'Back to home' }).click();

  await expect(page.getByText('Completed today')).toBeVisible();
  await expect(start).toHaveCount(0);

  // The completed state survives a reload; the challenge cannot be started again.
  await page.reload();
  await expect(page.getByText('Completed today')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share result' })).toBeVisible();
  await expect(start).toHaveCount(0);
});
