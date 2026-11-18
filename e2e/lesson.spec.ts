import { Board, expect, test } from './support';

test('lesson: flashcards, place all ten, and the chapter is marked complete', async ({ page }) => {
  await page.goto('./#/learn/lightest-ten');
  await expect(page.getByRole('heading', { level: 1, name: 'The Lightest Ten' })).toBeVisible();

  // Mnemonic card + 10 element cards.
  const learned = page.getByRole('progressbar', { name: 'Cards learned' });
  await expect(learned).toHaveAttribute('aria-valuemax', '11');
  await page.getByRole('button', { name: 'Got the trick' }).click();
  await expect(learned).toHaveAttribute('aria-valuenow', '1');

  // The front asks the question without giving the name away; the flip button reveals it.
  const flip = page.getByRole('button', { name: 'Show answer' });
  await expect(page.getByRole('heading', { name: "What's this element called?" })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hydrogen' })).toHaveCount(0);
  await expect(flip).toHaveAttribute('aria-pressed', 'false');
  await flip.click();
  await expect(flip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Hydrogen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: "What's this element called?" })).toHaveCount(0);

  // "Still learning" sends the card back into the deck; it does not count as learned.
  await page.getByRole('button', { name: 'Still learning' }).click();
  await expect(learned).toHaveAttribute('aria-valuenow', '1');
  // Focus moves to the next card's flip button, which is back on the question side.
  await expect(flip).toBeFocused();
  await expect(flip).toHaveAttribute('aria-pressed', 'false');

  // Answer every remaining card (including Hydrogen's second showing) with "Got it".
  for (let i = 2; i <= 11; i++) {
    await page.getByRole('button', { name: 'Got it', exact: true }).click();
    if (i < 11) await expect(learned).toHaveAttribute('aria-valuenow', String(i));
  }

  await expect(page.getByRole('heading', { name: 'Now put them on the table' })).toBeVisible();
  const go = page.getByRole('button', { name: "Let's go" });
  await expect(go).toBeFocused();
  await go.click();

  const board = new Board(page);
  await board.waitForStart();
  expect(await board.total()).toBe(10);
  await board.placeAll();

  const results = board.results();
  await expect(results).toBeVisible();
  await expect(results.getByRole('heading', { name: 'Flawless' })).toBeVisible();
  await expect(results.getByRole('img', { name: '3 of 3 stars' })).toBeVisible();
  await expect(results.getByText('10/10')).toBeVisible();
  await expect(results.getByRole('button', { name: 'Next chapter: The Next Ten' })).toBeVisible();

  // The results exit button returns a lesson to the learning path.
  await results.getByRole('button', { name: 'Back to path' }).click();
  await expect(page).toHaveURL(/#\/learn$/);
  const chapter = page.getByRole('link', { name: 'Chapter 1: The Lightest Ten, completed with 3 stars' });
  await expect(chapter).toBeVisible();
  await expect(page.getByRole('link', { name: 'Chapter 2: The Next Ten, up next' })).toBeVisible();

  // Completion is persisted, not just held in memory.
  await page.reload();
  await expect(chapter).toBeVisible();

  // Home now shows ten of the first twenty met, and points to the next chapter.
  await page.goto('./#/');
  await expect(page.getByRole('progressbar', { name: 'Your first 20 elements' })).toHaveAttribute('aria-valuenow', '10');
  await expect(page.getByRole('link', { name: 'Continue: The Next Ten' })).toHaveAttribute('href', '#/learn/next-ten');
});
