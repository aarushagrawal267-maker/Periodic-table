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
  await results.getByRole('button', { name: 'Back to daily' }).click();

  await expect(page.getByText('Completed today')).toBeVisible();
  await expect(start).toHaveCount(0);

  // The completed state survives a reload; the challenge cannot be started again.
  await page.reload();
  await expect(page.getByText('Completed today')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share result' })).toBeVisible();
  await expect(start).toHaveCount(0);
});

test('daily: peeking and backing out before the first move is free', async ({ page }) => {
  await page.goto('./#/daily');
  await page.getByRole('button', { name: "Start today's challenge" }).click();

  const board = new Board(page);
  await board.waitForStart();
  // No tile dropped yet: leaving needs no confirmation and does not use the attempt.
  await page.getByRole('button', { name: 'Leave round' }).click();
  await expect(page.getByRole('button', { name: "Start today's challenge" })).toBeVisible();
  await expect(page.getByText('Attempt used today')).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('button', { name: "Start today's challenge" })).toBeVisible();
});

test('daily: leaving after the first move warns, then uses the attempt with no score to share and no streak', async ({ page }) => {
  await page.goto('./#/daily');
  await page.getByRole('button', { name: "Start today's challenge" }).click();

  const board = new Board(page);
  await board.waitForStart();
  await board.placeCorrectly(await board.firstTileName());
  await page.getByRole('button', { name: 'Leave round' }).click();

  const sheet = page.getByRole('dialog', { name: 'Leave round' });
  await expect(sheet.getByText("Leaving now uses today's only try", { exact: false })).toBeVisible();
  await sheet.getByRole('button', { name: 'Leave', exact: true }).click();

  await expect(page.getByText('Attempt used today')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Practise the full table' })).toHaveAttribute('href', '#/play/full');
  await expect(page.getByRole('button', { name: 'Share result' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: "Start today's challenge" })).toHaveCount(0);
  await expect(page.getByText('0 days', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Attempt used today')).toBeVisible();

  // Home says the same thing: no score, no "keep your streak".
  await page.goto('./#/');
  const card = page.getByRole('link', { name: /Daily Challenge #\d+/ });
  await expect(card.getByText('Attempt used today')).toBeVisible();
  await expect(card.getByText('See result')).toHaveCount(0);
});
