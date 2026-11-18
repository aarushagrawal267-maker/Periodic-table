import { useCallback, useState, type KeyboardEvent } from 'react';
import { ELEMENTS, type Element } from '../lib/elements';

const DIRS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

/** The nearest element from `from` in a direction, preferring cells in the same row or column. */
function neighbour(from: Element, [dr, dc]: [number, number]) {
  let best: Element | null = null;
  let bestScore = Infinity;
  for (const e of ELEMENTS) {
    const r = e.row - from.row;
    const c = e.col - from.col;
    const along = r * dr + c * dc;
    if (along <= 0) continue;
    const score = along + Math.abs(dr ? c : r) * 3;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

/**
 * Roving tabindex for a full periodic table of buttons: the table is one Tab stop and the arrow keys
 * move inside it (Home/End jump along the row). Give each cell `data-cell={number}` and spread `cellProps(e)`.
 */
export function useGridRoving() {
  const [active, setActive] = useState(1);

  const onKeyDown = useCallback((ev: KeyboardEvent<HTMLElement>, e: Element) => {
    let target: Element | null | undefined = null;
    if (DIRS[ev.key]) target = neighbour(e, DIRS[ev.key]);
    else if (ev.key === 'Home' || ev.key === 'End') {
      const row = ELEMENTS.filter((x) => x.row === e.row).sort((a, b) => a.col - b.col);
      target = ev.key === 'Home' ? row[0] : row[row.length - 1];
    } else return;
    ev.preventDefault();
    if (!target) return;
    const scope = ev.currentTarget.closest('[data-roving]') ?? document;
    const el = scope.querySelector<HTMLElement>(`[data-cell="${target.number}"]`);
    if (el) {
      setActive(target.number);
      el.focus();
    }
  }, []);

  const cellProps = (e: Element) => ({
    'data-cell': e.number,
    tabIndex: active === e.number ? 0 : -1,
    onKeyDown: (ev: KeyboardEvent<HTMLElement>) => onKeyDown(ev, e),
  });

  return { active, setActive, cellProps };
}
