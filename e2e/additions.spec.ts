import { Board, expect, test } from './support';

const timeLeft = (page: import('@playwright/test').Page) => page.getByTestId('time-left').locator('span[aria-label$="seconds left"]');
const seconds = async (page: import('@playwright/test').Page) => Number((await timeLeft(page).getAttribute('aria-label'))!.split(' ')[0]);

test('timed challenge: level 1 counts down, can be paused, and clearing it unlocks level 2 @phone', async ({ page, consoleErrors }) => {
  await page.goto('./#/play');
  await page.getByRole('link', { name: /Timed Challenge/ }).click();
  await expect(page.getByRole('heading', { name: 'Beat the clock' })).toBeVisible();
  await expect(page.getByText('Clear level 1 to unlock')).toBeVisible();

  await page.locator('a[href="#/challenge/level-1"]').click();
  const board = new Board(page);
  await board.waitForStart();
  expect(await board.total()).toBe(10);
  // 10 elements × 30 s = 5:00 on the clock, counting down.
  await expect(timeLeft(page)).toBeVisible();
  expect(await seconds(page)).toBeLessThanOrEqual(300);
  await expect.poll(() => seconds(page)).toBeLessThan(300);

  // Pause: the board is hidden behind the pause screen and the clock stops.
  await page.getByRole('button', { name: 'Pause (P)' }).click();
  const pauseScreen = page.getByRole('dialog', { name: 'Paused' });
  await expect(pauseScreen).toBeVisible();
  const frozen = await seconds(page);
  await page.waitForTimeout(2200);
  expect(await seconds(page)).toBe(frozen);
  await pauseScreen.getByRole('button', { name: 'Resume' }).click();
  await expect(pauseScreen).toHaveCount(0);
  await board.waitForStart();

  await board.placeAll();
  const results = board.results();
  await expect(results.getByRole('heading', { name: 'Level 1 complete!' })).toBeVisible({ timeout: 10_000 });
  await expect(results.getByRole('button', { name: /Next: Level 2/ })).toBeVisible();

  await page.goto('./#/challenge');
  await expect(page.locator('a[href="#/challenge/level-2"]')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("timed challenge: when the clock runs out it is Time's up", async ({ page }) => {
  await page.clock.install();
  await page.goto('./#/challenge/level-1');
  const board = new Board(page);
  await board.waitForStart();
  await page.clock.fastForward('05:05');
  const results = board.results();
  await expect(results.getByRole('heading', { name: "Time's up!" })).toBeVisible({ timeout: 10_000 });
  await expect(results.getByText(/The clock ran out with 10 still to place/)).toBeVisible();
});

test('locked challenge levels cannot be opened by URL', async ({ page }) => {
  await page.goto('./#/challenge/level-3');
  await expect(page.getByRole('heading', { name: 'Beat the clock' })).toBeVisible();
});

test('puzzle: shuffle deals a new tray, pause hides the board, zoom keeps placed elements', async ({ page }) => {
  await page.goto('./#/play/first-20');
  const board = new Board(page);
  await board.waitForStart();

  // No time limit in normal regions: the regular clock is shown, not a countdown.
  await expect(page.getByTestId('time-left')).toHaveCount(0);

  const order = async () => (await board.tray.getByRole('option').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).join('|');
  const before = await order();
  await page.getByRole('button', { name: 'Shuffle the tiles (S)' }).click();
  await expect.poll(order).not.toBe(before);
  await expect(board.tray.getByRole('option')).toHaveCount(5);

  await board.placeCorrectly(await board.firstTileName());
  const slot = board.page.locator('button[data-slot]').first();
  const w1 = (await slot.boundingBox())!.width;
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByRole('button', { name: /Zoom 130 percent/ })).toBeVisible();
  await expect.poll(async () => (await slot.boundingBox())!.width).toBeGreaterThan(w1);
  expect(await board.placedCount()).toBe(1); // zooming never resets the round
  await page.getByRole('button', { name: /Reset to 100 percent/ }).click();
  await expect(page.getByRole('button', { name: /Zoom 100 percent/ })).toBeVisible();

  // Keyboard: P pauses and resumes.
  await page.keyboard.press('p');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await page.keyboard.press('p');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toHaveCount(0);
});

test('daily challenge keeps its fixed tile order: no shuffle button', async ({ page }) => {
  await page.goto('./#/daily');
  const start = page.getByRole('button', { name: /Start/ });
  if (await start.count()) await start.first().click();
  const board = new Board(page);
  await board.waitForStart();
  await expect(page.getByRole('button', { name: 'Shuffle the tiles (S)' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause (P)' })).toBeVisible();
});

test('element card shows who discovered it and its stable isotopes', async ({ page }) => {
  await page.goto('./#/explore');
  await page.getByRole('button', { name: /Tin/ }).first().click();
  const card = page.getByRole('dialog', { name: 'Tin details' });
  await expect(card.getByText('Discovered by')).toBeVisible();
  await expect(card.getByText('Known since ancient times')).toBeVisible();
  await expect(card.getByText('Stable isotopes')).toBeVisible();
  await expect(card.getByText('Metallic character')).toBeVisible();
  await page.keyboard.press('ArrowLeft'); // Indium
  await page.keyboard.press('ArrowLeft'); // Cadmium
  await page.keyboard.press('ArrowLeft'); // Silver
  await page.keyboard.press('ArrowLeft'); // Palladium
  await page.keyboard.press('ArrowLeft'); // Rhodium
  await page.keyboard.press('ArrowLeft'); // Ruthenium
  await page.keyboard.press('ArrowLeft'); // Technetium
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
