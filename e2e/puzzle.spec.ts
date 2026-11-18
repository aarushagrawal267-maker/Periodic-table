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
  await expect(board.tile(name)).toBeVisible();
  await expect(board.tile(name)).toHaveAttribute('aria-selected', 'true'); // ready for another try
  await expect(board.placed).toHaveAttribute('aria-valuenow', '0');
  await expect(board.cell(decoy.row, decoy.col)).toBeVisible();
  await expect(board.score()).toHaveText('0');

  // Right cell: accepted, the cell now shows the element and the score goes up.
  await board.placeCorrectly(name);
  await expect(page.getByRole('button', { name: `${name}, placed. Open details` })).toBeVisible();
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
