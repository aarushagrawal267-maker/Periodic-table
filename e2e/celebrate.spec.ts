import type { Page } from '@playwright/test';
import { Board, element, expect, test } from './support';

/** Turns the app's Reduce motion setting on before the app loads. */
async function reduceMotion(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('periodica-settings', JSON.stringify({ version: 4, state: { reduceMotion: true } }));
  });
}

/** A wrong drop of the first tray tile, on a cell of this region that is certainly not its own. */
async function dropWrong(board: Board) {
  const name = await board.firstTileName();
  const decoy = element(name === 'Hydrogen' ? 'Calcium' : 'Hydrogen');
  await board.drop(name, decoy.row, decoy.col);
  return { name, decoy };
}

test('a correct drop snaps with a burst in the category colour, a wrong one marks the cell @phone', async ({ page, consoleErrors }) => {
  await page.goto('./#/play/first-20');
  const board = new Board(page);
  await board.waitForStart();

  // The empty board is a printed chart sheet with no numbers or symbols in its empty places.
  await expect(page.locator('.chart-sheet')).toBeVisible();
  await expect(page.locator('button[data-slot]').first()).toHaveText('');

  const { decoy } = await dropWrong(board);
  const cell = board.cell(decoy.row, decoy.col);
  await expect(cell).toHaveClass(/miss-flash/);
  await expect(cell.locator('.miss-mark')).toHaveCount(1);
  await expect(cell.locator('.miss-mark')).toHaveAttribute('aria-hidden', 'true');
  await expect(board.tray.locator('.tray-miss')).toHaveCount(1);

  const name = await board.firstTileName();
  const { row, col } = element(name);
  await board.drop(name, row, col);
  const burst = page.locator('.snap-burst');
  await expect(burst).toHaveCount(1);
  await expect(burst).toHaveAttribute('aria-hidden', 'true');
  await expect(burst).toHaveCSS('pointer-events', 'none');
  await expect(burst.locator('.snap-bit')).toHaveCount(8);
  expect(consoleErrors).toEqual([]);
});

test('the combo badge takes the accent from 5 in a row and pulses once per step', async ({ page }) => {
  await page.goto('./#/play/first-20');
  const board = new Board(page);
  await board.waitForStart();
  const badge = page.getByTestId('combo').locator('.combo-badge');
  for (let i = 0; i < 4; i++) await board.placeCorrectly(await board.firstTileName());
  await expect(badge).toHaveAttribute('data-tier', 'base');
  await board.placeCorrectly(await board.firstTileName());
  await expect(badge).toHaveAttribute('data-tier', 'combo-hot');
  await expect(badge).toHaveClass(/combo-pulse/);
  await board.placeCorrectly(await board.firstTileName());
  // 6 in a row is the x2 step: the bigger pulse and its ring.
  await expect(badge).toHaveAttribute('data-tier', 'combo-high');
  await expect(badge).toHaveClass(/combo-pulse-step/);
});

test('reduce motion: no burst, pulse or shake; a wrong cell keeps a still red edge for a moment', async ({ page }) => {
  await reduceMotion(page);
  await page.goto('./#/play/first-20');
  const board = new Board(page);
  await board.waitForStart();

  const { decoy } = await dropWrong(board);
  const cell = board.cell(decoy.row, decoy.col);
  await expect(cell).toHaveClass(/miss-static/);
  await expect(cell).not.toHaveClass(/miss-flash/);
  await expect(cell.locator('.miss-mark-still')).toHaveCount(1);
  await expect(board.tray.locator('.tray-miss')).toHaveCount(0);
  // The still marker clears by itself.
  await expect(cell).not.toHaveClass(/miss-static/, { timeout: 4_000 });

  for (let i = 0; i < 5; i++) {
    await board.placeCorrectly(await board.firstTileName());
    await expect(page.locator('.snap-burst, .snap-pop')).toHaveCount(0);
  }
  const badge = page.getByTestId('combo').locator('.combo-badge');
  await expect(badge).toHaveAttribute('data-tier', 'combo-hot');
  await expect(badge).not.toHaveClass(/combo-pulse/);
});

test('three stars: confetti made of element squares plays once, behind the actions', async ({ page }) => {
  await page.goto('./#/play/first-20');
  const board = new Board(page);
  await board.waitForStart();
  await board.placeAll();
  const results = board.results();
  await expect(results.getByRole('img', { name: '3 of 3 stars' })).toBeVisible({ timeout: 10_000 });
  const confetti = page.getByTestId('confetti');
  await expect(confetti).toHaveCount(1);
  await expect(confetti).toHaveAttribute('aria-hidden', 'true');
  await expect(confetti).toHaveCSS('pointer-events', 'none');
  expect(await confetti.locator('.confetti-piece').count()).toBeGreaterThanOrEqual(40);
  // The actions still take clicks while it plays.
  await expect(results.getByRole('button', { name: /Play again/ })).toBeEnabled();
  // Removed once it has landed.
  await expect(confetti).toHaveCount(0, { timeout: 6_000 });
});

test('reduce motion: a three-star result renders no confetti at all', async ({ page }) => {
  await reduceMotion(page);
  await page.goto('./#/play/first-20');
  const board = new Board(page);
  await board.waitForStart();
  await board.placeAll();
  const results = board.results();
  await expect(results.getByRole('img', { name: '3 of 3 stars' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('confetti')).toHaveCount(0);
  await expect(page.locator('.confetti-piece')).toHaveCount(0);
});

test("no confetti when the clock runs out (Time's up)", async ({ page }) => {
  await page.clock.install();
  await page.goto('./#/challenge/level-1');
  const board = new Board(page);
  await board.waitForStart();
  await page.clock.fastForward('05:05');
  const results = board.results();
  await expect(results.getByRole('heading', { name: "Time's up" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('confetti')).toHaveCount(0);
  await expect(page.getByTestId('trophy')).toHaveCount(0);
});

test('timed challenge: clearing a level throws confetti; no trophy before the master finish', async ({ page }) => {
  await page.goto('./#/challenge/level-1');
  const board = new Board(page);
  await board.waitForStart();
  await board.placeAll();
  const results = board.results();
  await expect(results.getByRole('heading', { name: 'Level 1 complete' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('confetti')).toHaveCount(1);
  await expect(page.getByTestId('trophy')).toHaveCount(0);
});
