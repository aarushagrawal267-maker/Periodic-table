import { Board, expect, test } from './support';

test('lesson: flashcards, place all ten, and the chapter is marked complete', async ({ page }) => {
  await page.goto('./#/learn/lightest-ten');
  await expect(page.getByRole('heading', { level: 1, name: 'The Lightest Ten' })).toBeVisible();

  // Mnemonic card + 10 element cards, every one answered "I knew it".
  const learned = page.getByRole('progressbar', { name: 'Cards learned' });
  await expect(learned).toHaveAttribute('aria-valuemax', '11');
  await page.getByRole('button', { name: 'Got the trick' }).click();
  await expect(learned).toHaveAttribute('aria-valuenow', '1');
  for (let i = 2; i <= 11; i++) {
    await page.getByRole('button', { name: 'Got it', exact: true }).click();
    if (i < 11) await expect(learned).toHaveAttribute('aria-valuenow', String(i));
  }

  await expect(page.getByRole('heading', { name: 'Now put them on the table' })).toBeVisible();
  await page.getByRole('button', { name: "Let's go" }).click();

  const board = new Board(page);
  await board.waitForStart();
  expect(await board.total()).toBe(10);
  await board.placeAll();

  const results = board.results();
  await expect(results).toBeVisible();
  await expect(results.getByRole('heading', { name: 'Flawless' })).toBeVisible();
  await expect(results.getByLabel('3 of 3 stars')).toBeVisible();
  await expect(results.getByText('10/10')).toBeVisible();

  // The results exit button returns a lesson to the learning path.
  await results.getByRole('button', { name: 'Back to home' }).click();
  await expect(page).toHaveURL(/#\/learn$/);
  const chapter = page.getByRole('link', { name: 'Chapter 1: The Lightest Ten, completed with 3 stars' });
  await expect(chapter).toBeVisible();
  await expect(page.getByRole('link', { name: 'Chapter 2: The Next Ten, up next' })).toBeVisible();

  // Completion is persisted, not just held in memory.
  await page.reload();
  await expect(chapter).toBeVisible();
});
