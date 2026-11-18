import { Board, element, expect, test } from './support';

test('puzzle: a wrong placement is rejected, a correct one scores', async ({ page }) => {
  await page.goto('./#/play/first-20');
  const board = new Board(page);
  await board.waitForStart();
  expect(await board.total()).toBe(20);

  const name = await board.firstTileName();
  const home = element(name);
  // Any other element of this region gives an empty cell that is definitely wrong.
  const decoy = element(name === 'Hydrogen' ? 'Calcium' : 'Hydrogen');

  await expect(board.score()).toHaveText('0');

  // Wrong cell: rejected, tile stays in the tray, nothing is placed, no points.
  await board.drop(name, decoy.row, decoy.col);
  await expect(page.getByText(`Not there. ${name} belongs somewhere else.`)).toBeAttached();
  // A teaching tip pops up on Standard, then fades by itself.
  const tip = page.getByTestId('miss-tip');
  await expect(tip).toHaveText(`${name} is number ${home.number}. Try counting along the rows.`);
  await expect(tip).toHaveCount(0, { timeout: 6_000 });
  await expect(board.tile(name)).toBeVisible();
  await expect(board.tile(name)).toHaveAttribute('aria-pressed', 'true'); // ready for another try
  await expect(board.placed).toHaveAttribute('aria-valuenow', '0');
  await expect(board.cell(decoy.row, decoy.col)).toBeVisible();
  await expect(board.score()).toHaveText('0');

  // Right cell: accepted, the cell now shows the element and the score goes up.
  await board.placeCorrectly(name);
  await expect(page.getByRole('button', { name: `${home.symbol}, ${name}, placed. Open details` })).toBeVisible();
  await expect(board.cell(home.row, home.col)).toHaveCount(0);
  await expect(board.score()).not.toHaveText('0');
  await expect.poll(async () => Number((await board.score().innerText()).replace(/,/g, ''))).toBeGreaterThan(0);
});

test('puzzle: the mistake is counted in the round result', async ({ page }) => {
  await page.goto('./#/play/first-20');
  const board = new Board(page);
  await board.waitForStart();

  const name = await board.firstTileName();
  const decoy = element(name === 'Hydrogen' ? 'Calcium' : 'Hydrogen');
  await board.drop(name, decoy.row, decoy.col);
  await expect(page.getByText(`Not there. ${name} belongs somewhere else.`)).toBeAttached();

  await board.placeAll();

  // 20 placed with 1 miss: accuracy 20/21 = 95%, and the slipped element is listed for review.
  const results = board.results();
  await expect(results).toBeVisible();
  await expect(results.getByText('20/20')).toBeVisible();
  await expect(results.getByText('95%')).toBeVisible();
  await expect(results.getByRole('heading', { name: 'Worth another look' })).toBeVisible();
  await expect(results.getByRole('button', { name: new RegExp(`${name}$`) })).toBeVisible();
});

test('puzzle: tray tiles work from the keyboard, and H announces a hint', async ({ page }) => {
  await page.goto('./#/play/first-20');
  const board = new Board(page);
  await board.waitForStart();

  // Tiles are toggle buttons; arrow keys move between them.
  const first = board.liveTiles().first();
  const second = board.liveTiles().nth(1);
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(second).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(first).toBeFocused();

  // Enter selects the focused tile.
  const name = await board.firstTileName();
  await page.keyboard.press('Enter');
  await expect(board.tile(name)).toHaveAttribute('aria-pressed', 'true');

  // H gives a spoken hint and marks the right slot.
  const home = element(name);
  await page.keyboard.press('h');
  await expect(page.getByText(`Hint: ${name} goes in period ${home.period}, group ${home.group}.`)).toBeAttached();
  await expect(board.cell(home.row, home.col)).toHaveAttribute('aria-label', /, hint\./);
});

test('puzzle: number shortcuts work on the board but not from the header', async ({ page }) => {
  await page.goto('./#/play/first-20');
  const board = new Board(page);
  await board.waitForStart();
  await expect(board.liveTiles().first()).toHaveAttribute('aria-pressed', 'false');

  // Focus outside the board and tray (the header's back button): the 1 shortcut does nothing.
  await page.getByRole('button', { name: 'Leave round' }).focus();
  await page.keyboard.press('1');
  await expect(board.tray.locator('[aria-pressed="true"]')).toHaveCount(0);

  // On the page itself it selects the first tile.
  await page.locator('main').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('1');
  await expect(board.liveTiles().first()).toHaveAttribute('aria-pressed', 'true');
});
