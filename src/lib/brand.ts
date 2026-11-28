import type { Category } from './elements';

/*
 * The Periodica mark: the periodic table's own silhouette as eleven flat squares, tall at both ends and low in the
 * middle, each in the category colour the wall chart prints there. Hydrogen sits alone at the top left in the nonmetal
 * colour, helium at the top right; then the alkali and alkaline earth metals, one transition metal for the low d-block,
 * the halogens and the noble gases.
 *
 * This module has no runtime imports, so scripts/brand-icons.mjs can import it with Node's type stripping and draw the
 * static app icons from the same geometry as the header.
 */

/** Grid of the mark, in viewBox units. */
export const MARK = { cols: 5, rows: 3, cell: 8, gap: 2, radius: 1.75 } as const;
export const MARK_WIDTH = MARK.cols * MARK.cell + (MARK.cols - 1) * MARK.gap;
export const MARK_HEIGHT = MARK.rows * MARK.cell + (MARK.rows - 1) * MARK.gap;

export interface MarkSquare {
  col: number;
  row: number;
  category: Category;
  /** The element the square stands for (its place on the real chart). */
  z: number;
}

export const MARK_SQUARES: readonly MarkSquare[] = [
  { col: 0, row: 0, category: 'nonmetal', z: 1 },
  { col: 4, row: 0, category: 'noble-gas', z: 2 },
  { col: 0, row: 1, category: 'alkali-metal', z: 3 },
  { col: 1, row: 1, category: 'alkaline-earth-metal', z: 4 },
  { col: 3, row: 1, category: 'halogen', z: 9 },
  { col: 4, row: 1, category: 'noble-gas', z: 10 },
  { col: 0, row: 2, category: 'alkali-metal', z: 11 },
  { col: 1, row: 2, category: 'alkaline-earth-metal', z: 12 },
  { col: 2, row: 2, category: 'transition-metal', z: 26 },
  { col: 3, row: 2, category: 'halogen', z: 17 },
  { col: 4, row: 2, category: 'noble-gas', z: 18 },
];

/** One square's rectangle in viewBox units. */
export function markRect(s: Pick<MarkSquare, 'col' | 'row'>) {
  return { x: s.col * (MARK.cell + MARK.gap), y: s.row * (MARK.cell + MARK.gap), size: MARK.cell, radius: MARK.radius };
}

/** The squares as SVG markup, filled by `fill(category)` (CSS variables in the app, hex values in static icons). */
export function markRects(fill: (c: Category) => string) {
  return MARK_SQUARES.map((s) => {
    const r = markRect(s);
    return `<rect x="${r.x}" y="${r.y}" width="${r.size}" height="${r.size}" rx="${r.radius}" fill="${fill(s.category)}"/>`;
  }).join('');
}
