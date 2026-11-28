import type { Element } from '../lib/elements';

/**
 * The Home table prints itself once, like a wall chart coming off the press: a sweep from the top-left
 * corner across the groups and down the periods. Pure numbers, so the timing can be tested.
 */

/** One tile's own fade and rise, in ms (DUR.enter). */
export const PRINT_DURATION = 360;
/** Added per group (column) and per period (row), in ms. */
export const PRINT_STEP_COL = 18;
export const PRINT_STEP_ROW = 12;

/** When a tile starts printing, in ms after the table appears. */
export function printDelay(e: Pick<Element, 'row' | 'col'>) {
  return (e.col - 1) * PRINT_STEP_COL + (e.row - 1) * PRINT_STEP_ROW;
}
