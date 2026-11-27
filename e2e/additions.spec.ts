import type { Page } from '@playwright/test';
import { Board, expect, test } from './support';

const timeLeft = (page: Page) => page.getByTestId('time-left').locator('span[aria-label$="seconds left"]');
const seconds = async (page: Page) => Number((await timeLeft(page).getAttribute('aria-label'))!.split(' ')[0]);
const trayOrder = async (board: Board) => (await board.liveTiles().evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).join('|');

test('timed challenge: level 1 counts down, pauses, and clearing it opens level 2 @phone', async ({ page, consoleErrors }) => {
  await page.goto('./#/play');
  await page.getByRole('link', { name: /Timed challenge/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Beat the clock' })).toBeVisible();
  await expect(page.getByText('Clear level 1 to unlock')).toBeVisible();
  await expect(page.locator('a[href="#/challenge/level-2"]')).toHaveCount(0);

  await page.locator('a[href="#/challenge/level-1"]').click();
  const board = new Board(page);
  await board.waitForStart();
  expect(await board.total()).toBe(10);
  // 10 elements × 30 s = 5:00, counting down.
  await expect(timeLeft(page)).toBeVisible();
  expect(await seconds(page)).toBeLessThanOrEqual(300);
  await expect.poll(() => seconds(page)).toBeLessThan(300);

  // Pause covers the board, stops the clock, and Resume picks up where it left off.
  await page.getByRole('button', { name: 'Pause (P)' }).click();
  const pause = page.getByRole('dialog', { name: 'Paused' });
  await expect(pause).toBeVisible();
  await expect(pause.getByRole('button', { name: 'Resume' })).toBeFocused();
  const frozen = await seconds(page);
  await page.waitForTimeout(2200);
  expect(await seconds(page)).toBe(frozen);
  await pause.getByRole('button', { name: 'Resume' }).click();
  await expect(pause).toHaveCount(0);
  await board.waitForStart();

  await board.placeAll();
  const results = board.results();
  await expect(results.getByRole('heading', { name: 'Level 1 complete' })).toBeVisible({ timeout: 10_000 });
  await expect(results.getByRole('button', { name: /Next: level 2/ })).toBeVisible();

  await page.goto('./#/challenge');
  await expect(page.locator('a[href="#/challenge/level-2"]')).toBeVisible();
  await page.goto('./#/play');
  await expect(page.getByText('1/6 levels cleared')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("timed challenge: when the clock runs out it is Time's up", async ({ page }) => {
  await page.clock.install();
  await page.goto('./#/challenge/level-1');
  const board = new Board(page);
  await board.waitForStart();
  await page.clock.fastForward('05:05');
  const results = board.results();
  await expect(results.getByRole('heading', { name: "Time's up" })).toBeVisible({ timeout: 10_000 });
  await expect(results.getByText(/The clock ran out with 10 still to place/)).toBeVisible();
});

test('a locked challenge level shows the level list instead, with the header', async ({ page }) => {
  await page.goto('./#/challenge/level-3');
  await expect(page.getByRole('heading', { level: 1, name: 'Beat the clock' })).toBeVisible();
  await expect(page).toHaveTitle(/^Timed challenge · Periodica$/);
});

test('puzzle: shuffle deals a new tray, P pauses, zoom keeps placed elements', async ({ page }) => {
  await page.goto('./#/play/first-20');
  const board = new Board(page);
  await board.waitForStart();

  // Regions have no time limit: the normal clock, not a countdown.
  await expect(page.getByTestId('time-left')).toHaveCount(0);

  const before = await trayOrder(board);
  await page.getByRole('button', { name: 'Shuffle the tiles (S)' }).click();
  await expect.poll(() => trayOrder(board)).not.toBe(before);
  await expect(board.liveTiles()).toHaveCount(5);

  await board.placeCorrectly(await board.firstTileName());
  const slot = page.locator('button[data-slot]').first();
  const w1 = (await slot.boundingBox())!.width;
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByRole('button', { name: /Zoom 130 percent/ })).toBeVisible();
  await expect.poll(async () => (await slot.boundingBox())!.width).toBeGreaterThan(w1);
  expect(await board.placedCount()).toBe(1); // zooming never resets the round
  await page.getByRole('button', { name: /Reset to 100 percent/ }).click();
  await expect(page.getByRole('button', { name: /Zoom 100 percent/ })).toBeVisible();

  // Keyboard: P pauses (nothing interactive focused), Escape resumes.
  await page.locator('h1').first().click();
  await page.keyboard.press('p');
  const pause = page.getByRole('dialog', { name: 'Paused' });
  await expect(pause).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pause).toHaveCount(0);
  // Focus comes back to the page, not to <body>.
  await expect.poll(() => page.evaluate(() => document.activeElement !== document.body && !!document.activeElement)).toBe(true);

  // Leaving from the pause screen asks first, because the round has a move in it.
  await page.getByRole('button', { name: 'Pause (P)' }).click();
  await pause.getByRole('button', { name: 'Leave round' }).click();
  await expect(page.getByRole('dialog', { name: 'Leave round' })).toBeVisible();
});

test('daily challenge keeps its fixed tile order: pause yes, shuffle no', async ({ page }) => {
  await page.goto('./#/daily');
  await page.getByRole('button', { name: "Start today's challenge" }).click();
  const board = new Board(page);
  await board.waitForStart();
  await expect(page.getByRole('button', { name: 'Shuffle the tiles (S)' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause (P)' })).toBeVisible();
});

test('element card shows who discovered it, metallic character and stable isotopes', async ({ page }) => {
  await page.goto('./#/explore/Sn');
  const tin = page.getByRole('dialog', { name: 'Tin details' });
  await expect(tin.getByText('Discovered by')).toBeVisible();
  await expect(tin.getByText('Known since ancient times')).toBeVisible();
  await expect(tin.getByText('Metallic character')).toBeVisible();
  await expect(tin.getByText('Stable isotopes')).toBeVisible();

  await page.goto('./#/explore/Tc');
  const tc = page.getByRole('dialog', { name: 'Technetium details' });
  await expect(tc.getByText('all radioactive')).toBeVisible();
  await expect(tc.getByText('Carlo Perrier & Emilio Segrè')).toBeVisible();
});

test('learning path tells the story of the periodic table', async ({ page }) => {
  await page.goto('./#/learn');
  const story = page.getByRole('region', { name: 'The periodic table' });
  await story.scrollIntoViewIfNeeded();
  await expect(story.getByText(/Dmitri Mendeleev's 1869/)).toBeVisible();
  await expect(story.getByRole('img', { name: /full periodic table/ })).toBeVisible();
});

test('phones: zoom keys sit in the tray row and add no height above the board @phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'phone layout only');
  await page.goto('./#/play/full');
  const board = new Board(page);
  await board.waitForStart();
  const tray = page.locator('footer');
  const zoomIn = tray.getByRole('button', { name: 'Zoom in' });
  await expect(zoomIn).toBeVisible();
  const box = (await zoomIn.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  // The phone tray still fits five tiles side by side with nothing pushed off-screen.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await zoomIn.click();
  await expect(tray.getByRole('group', { name: /Board zoom, 115 percent/ })).toBeVisible();
});
