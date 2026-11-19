import { elementByNameOrSymbol, expect, test } from './support';

test('match: the board loads face down, and pairing every symbol with its name finishes the round', async ({ page, consoleErrors }) => {
  await page.goto('./#/match');
  await expect(page.getByRole('heading', { level: 1, name: 'Match pairs' })).toBeVisible();

  const board = page.getByRole('group', { name: /^\d+ cards$/ });
  const cards = board.getByRole('button');
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(6);
  expect(count % 2).toBe(0);
  for (let i = 0; i < count; i++) await expect(cards.nth(i)).toHaveAttribute('aria-label', `Card ${i + 1}, face down`);

  // Look at the cards two at a time. Pairs found by luck stay matched; the rest flip back.
  const elementAt: number[] = [];
  const reveal = async (i: number) => {
    await cards.nth(i).click();
    await expect(cards.nth(i)).not.toHaveAttribute('aria-label', /face down$/);
    const label = (await cards.nth(i).getAttribute('aria-label'))!.replace(/, matched$/, '');
    elementAt[i] = elementByNameOrSymbol(label).number;
  };
  for (let i = 0; i < count; i += 2) {
    await reveal(i);
    await reveal(i + 1);
    if (elementAt[i] !== elementAt[i + 1]) {
      await expect(cards.nth(i)).toHaveAttribute('aria-label', `Card ${i + 1}, face down`);
      await expect(cards.nth(i + 1)).toHaveAttribute('aria-label', `Card ${i + 2}, face down`);
    }
  }

  // Now every card is known: match the remaining pairs.
  for (let i = 0; i < count; i++) {
    if (await cards.nth(i).isDisabled()) continue;
    const j = elementAt.findIndex((n, k) => k !== i && n === elementAt[i]);
    await cards.nth(i).click();
    await cards.nth(j).click();
    await expect(cards.nth(i)).toHaveAttribute('aria-label', /, matched$/);
    await expect(cards.nth(j)).toBeDisabled();
  }

  const results = page.getByRole('dialog').filter({ has: page.locator('#results-title') });
  await expect(results).toBeVisible();
  await expect(results.getByText(`${count / 2}/${count / 2}`)).toBeVisible();
  await results.getByRole('button', { name: 'Home' }).click();
  await expect(page).toHaveURL(/#\/$/);
  expect(consoleErrors).toEqual([]);
});
