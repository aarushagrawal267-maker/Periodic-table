import { byNumber } from './elements';

export interface Track {
  index: number;
  start: number;
  size: number;
  active: boolean;
}

export interface TableLayout {
  cell: number;
  gap: number;
  width: number;
  height: number;
  cols: Map<number, Track>;
  rows: Map<number, Track>;
}

const COLLAPSED = 0.6;

/**
 * Lays out the subset of the table needed to show `numbers`.
 * Columns/rows that hold none of the elements but sit between ones that do are
 * collapsed to a thin gap, so the real shape of the table is kept while
 * unused space shrinks. Row 8 (the gap above the f-block) is always collapsed.
 */
export function computeLayout(
  numbers: number[],
  available: number,
  opts: { min?: number; max?: number; gap?: number } = {},
): TableLayout {
  const { min = 30, max = 64, gap = 4 } = opts;
  const usedCols = new Set<number>();
  const usedRows = new Set<number>();
  for (const n of numbers) {
    const e = byNumber(n);
    usedCols.add(e.col);
    usedRows.add(e.row);
  }
  const colRange = range(Math.min(...usedCols), Math.max(...usedCols));
  const rowRange = range(Math.min(...usedRows), Math.max(...usedRows));

  // A run of unused tracks collapses into a single thin gap.
  const isActive = (i: number, used: Set<number>, gapRow?: number) => used.has(i) && i !== gapRow;
  const units = (list: number[], used: Set<number>, gapRow?: number) => {
    let u = 0;
    let gaps = 0;
    list.forEach((i, k) => {
      const a = isActive(i, used, gapRow);
      if (a) {
        u += 1;
        gaps++;
      } else if (k === 0 || isActive(list[k - 1], used, gapRow)) {
        u += COLLAPSED;
        gaps++;
      }
    });
    return { u, gaps };
  };

  const cu = units(colRange, usedCols);
  const raw = (available - gap * (cu.gaps - 1)) / cu.u;
  const cell = Math.floor(Math.max(min, Math.min(max, raw)));

  const build = (list: number[], used: Set<number>, gapRow?: number) => {
    const map = new Map<number, Track>();
    let cursor = 0;
    list.forEach((i, k) => {
      const active = isActive(i, used, gapRow);
      const startsRun = active || k === 0 || isActive(list[k - 1], used, gapRow);
      const size = active ? cell : startsRun ? Math.round(cell * COLLAPSED) : 0;
      map.set(i, { index: i, start: startsRun ? cursor : cursor - gap, size, active });
      if (startsRun) cursor += size + gap;
    });
    return { map, total: cursor - gap };
  };
  const cols = build(colRange, usedCols);
  const rows = build(rowRange, usedRows, 8);
  return { cell, gap, width: cols.total, height: rows.total, cols: cols.map, rows: rows.map };
}

function range(a: number, b: number) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}
