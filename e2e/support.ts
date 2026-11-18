import { readFileSync } from 'node:fs';
import { test as base, expect, type Locator, type Page } from '@playwright/test';

type ElementPos = { number: number; name: string; row: number; col: number };

const ELEMENTS: ElementPos[] = JSON.parse(readFileSync(new URL('../src/data/elements.json', import.meta.url), 'utf8'));
const BY_NAME = new Map(ELEMENTS.map((e) => [e.name, e]));

export function element(name: string): ElementPos {
  const e = BY_NAME.get(name);
  if (!e) throw new Error(`Unknown element "${name}"`);
  return e;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every test gets a fresh browser context, so localStorage starts empty.
 * The `consoleErrors` fixture collects console errors and uncaught page errors
 * for any test that wants to assert on them.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    await use(errors);
  },
});

export { expect };

/** Puzzle screen helpers. All waits are on UI state, never on wall-clock time. */
export class Board {
  readonly tray: Locator;
  readonly placed: Locator;
  readonly hint: Locator;

  constructor(readonly page: Page) {
    this.tray = page.getByRole('listbox', { name: 'Elements to place' });
    this.placed = page.getByRole('progressbar', { name: 'Elements placed' });
    this.hint = page.getByRole('button', { name: /^Hint/ });
  }

  /** The countdown overlay blocks input; the hint button enables when play starts. */
  async waitForStart() {
    await expect(this.hint).toBeEnabled({ timeout: 10_000 });
  }

  tile(name: string) {
    return this.tray.getByRole('option', { name: new RegExp(`^${escape(name)}(,|$)`) });
  }

  cell(row: number, col: number) {
    return this.page.locator(`button[data-slot][data-row="${row}"][data-col="${col}"]`);
  }

  async total() {
    return Number(await this.placed.getAttribute('aria-valuemax'));
  }

  async placedCount() {
    return Number(await this.placed.getAttribute('aria-valuenow'));
  }

  /** Name of the first tile in the tray that is not on its way out. */
  async firstTileName() {
    const label = await this.tray.getByRole('option').first().getAttribute('aria-label');
    return label!.split(',')[0];
  }

  async select(name: string) {
    const tile = this.tile(name);
    // Tapping a selected tile deselects it, and a missed tile stays selected.
    if ((await tile.getAttribute('aria-selected')) !== 'true') await tile.click();
    await expect(tile).toHaveAttribute('aria-selected', 'true');
  }

  /** Tap a tile, then tap a cell. Does not assert the outcome. */
  async drop(name: string, row: number, col: number) {
    await this.select(name);
    await this.cell(row, col).click();
  }

  /** Place an element on its correct cell and wait until the board reflects it. */
  async placeCorrectly(name: string) {
    const before = await this.placedCount();
    const { row, col } = element(name);
    await this.drop(name, row, col);
    await expect(this.placed).toHaveAttribute('aria-valuenow', String(before + 1));
    // Wait for the exit animation so the next lookup never sees this tile.
    await expect(this.tile(name)).toHaveCount(0);
  }

  /** Clear the whole board by placing whatever the tray offers, in tray order. */
  async placeAll() {
    const total = await this.total();
    for (let i = await this.placedCount(); i < total; i++) {
      await this.placeCorrectly(await this.firstTileName());
    }
  }

  /** Current HUD score, as displayed. */
  score() {
    return this.page
      .getByRole('banner')
      .getByText('Score', { exact: true })
      .locator('xpath=following-sibling::div[1]');
  }

  results() {
    return this.page.getByRole('dialog').filter({ has: this.page.locator('#results-title') });
  }
}
