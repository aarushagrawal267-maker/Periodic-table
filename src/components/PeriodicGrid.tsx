import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ELEMENTS, F_BLOCK_MARKERS, byNumber, catVar, type Element } from '../lib/elements';
import { computeLayout } from '../lib/layout';

export interface CellRect {
  x: number;
  y: number;
  size: number;
}

interface Props {
  /** Elements that define the visible area. Defaults to the full table. */
  numbers?: number[];
  renderCell: (e: Element, rect: CellRect, inRegion: boolean) => ReactNode;
  /** Render elements that fall in the visible area but are not in `numbers`. */
  showContext?: boolean;
  minCell?: number;
  maxCell?: number;
  gap?: number;
  showMarkers?: boolean;
  /** Group and period labels around the table. */
  showAxes?: boolean;
  className?: string;
  overlay?: ReactNode;
  onLayout?: (cell: number) => void;
}

const AXIS = 18;

/**
 * Responsive periodic table. Measures its container and sizes cells to fit,
 * falling back to horizontal scrolling when cells would get smaller than `minCell`.
 */
export function PeriodicGrid({
  numbers,
  renderCell,
  showContext = true,
  minCell = 30,
  maxCell = 64,
  gap = 4,
  showMarkers = true,
  showAxes = false,
  className = '',
  overlay,
  onLayout,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const nums = useMemo(() => numbers ?? ELEMENTS.map((e) => e.number), [numbers]);
  const inRegion = useMemo(() => new Set(nums), [nums]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const axis = showAxes ? AXIS : 0;
  const layout = useMemo(
    () => (width ? computeLayout(nums, width - axis, { min: minCell, max: maxCell, gap }) : null),
    [nums, width, minCell, maxCell, gap, axis],
  );

  useLayoutEffect(() => {
    if (layout) onLayout?.(layout.cell);
  }, [layout, onLayout]);

  const visible = useMemo(() => {
    if (!layout) return [];
    return ELEMENTS.filter((e) => {
      const c = layout.cols.get(e.col);
      const r = layout.rows.get(e.row);
      if (!c?.active || !r?.active) return false;
      return inRegion.has(e.number) || showContext;
    });
  }, [layout, inRegion, showContext]);

  return (
    <div ref={ref} className={`thin-scroll w-full overflow-x-auto overflow-y-hidden ${className}`}>
      {layout && (
        <div className="relative mx-auto" style={{ width: layout.width + axis, height: layout.height + axis }}>
          {showAxes && <Axes layout={layout} />}
          <div className="absolute" style={{ left: axis, top: axis, width: layout.width, height: layout.height }}>
            {showMarkers &&
              F_BLOCK_MARKERS.map((m) => {
                const c = layout.cols.get(m.col);
                const r = layout.rows.get(m.row);
                const fRow = layout.rows.get(m.row === 6 ? 9 : 10);
                if (!c?.active || !r?.active || !fRow?.active) return null;
                return (
                  <div
                    key={m.label}
                    className="absolute flex items-center justify-center rounded-md border border-dashed text-center font-medium leading-tight"
                    style={{
                      left: c.start,
                      top: r.start,
                      width: layout.cell,
                      height: layout.cell,
                      borderColor: `color-mix(in oklab, ${catVar(m.category)} 50%, transparent)`,
                      color: catVar(m.category),
                      fontSize: Math.max(7, layout.cell * 0.17),
                    }}
                    aria-hidden
                  >
                    {m.label}
                  </div>
                );
              })}
            {visible.map((e) => {
              const c = layout.cols.get(e.col)!;
              const r = layout.rows.get(e.row)!;
              return (
                <div key={e.number} className="absolute" style={{ left: c.start, top: r.start, width: layout.cell, height: layout.cell }}>
                  {renderCell(e, { x: c.start, y: r.start, size: layout.cell }, inRegion.has(e.number))}
                </div>
              );
            })}
            {overlay}
          </div>
        </div>
      )}
    </div>
  );
}

function Axes({ layout }: { layout: NonNullable<ReturnType<typeof computeLayout>> }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 text-[11px] font-medium text-ink-3 tabular-nums">
      {[...layout.cols.values()]
        .filter((c) => c.active)
        .map((c) => {
          // Only label the group when a main-table element sits in this column.
          const hasGroup = ELEMENTS.some((e) => e.col === c.index && e.group !== null);
          return hasGroup ? (
            <span key={c.index} className="absolute top-0 text-center" style={{ left: AXIS + c.start, width: c.size }}>
              {c.index}
            </span>
          ) : null;
        })}
      {[...layout.rows.values()]
        .filter((r) => r.active && r.index <= 7)
        .map((r) => (
          <span key={r.index} className="absolute left-0 flex items-center" style={{ top: AXIS + r.start, height: r.size }}>
            {r.index}
          </span>
        ))}
    </div>
  );
}

export const elementAt = (row: number, col: number) => ELEMENTS.find((e) => e.row === row && e.col === col);
export { byNumber };
