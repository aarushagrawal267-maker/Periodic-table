import { ChevronRight } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ELEMENTS, F_BLOCK_MARKERS, byNumber, catVar, type Element } from '../lib/elements';
import { computeLayout } from '../lib/layout';
import { useSettings } from '../store/settings';
import { tileRadius } from './ElementTile';
import { DUR, EASE } from './motion';

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
  /** Scales the cells; above 1 the table scrolls sideways. Defaults to 1 (fit). */
  zoom?: number;
}

const AXIS = 18;
/** Width of the soft fade on an edge that has more table behind it. */
const FADE = 32;

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
  zoom = 1,
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
    () => (width ? computeLayout(nums, (width - axis) * zoom, { min: minCell * zoom, max: maxCell * zoom, gap }) : null),
    [nums, width, minCell, maxCell, gap, axis, zoom],
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

  // ---- Sideways-scroll cue: fade the edge with more table, and a "Swipe for more" chip until the user scrolls. ----
  const [edges, setEdges] = useState({ left: false, right: false });
  const [scrolled, setScrolled] = useState(false);
  const reduceSetting = useSettings((s) => s.reduceMotion);
  const reduceMotion = useReducedMotion() || reduceSetting;

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 2;
    const right = max > 2 && el.scrollLeft < max - 2;
    setEdges((p) => (p.left === left && p.right === right ? p : { left, right }));
    if (el.scrollLeft > 12) setScrolled(true);
  }, []);

  useLayoutEffect(measure, [measure, layout]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('scroll', measure, { passive: true });
    return () => el.removeEventListener('scroll', measure);
  }, [measure]);

  // The chip sits in the empty band above the f-block (row 8), so it never covers a tile; centred when there is no band or axis.
  const innerRef = useRef<HTMLDivElement>(null);
  const [bandTop, setBandTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const band = layout?.rows.get(8);
    const inner = innerRef.current;
    // No band (a region above the f-block): the group-number row, so the chip covers labels rather than tiles.
    setBandTop(!inner ? null : band ? inner.offsetTop + axis + band.start + band.size / 2 : axis ? inner.offsetTop + axis / 2 : null);
  }, [layout, axis]);

  const overflows = edges.left || edges.right;
  const fadeL = edges.left ? FADE : 0;
  const fadeR = edges.right ? FADE : 0;
  const mask = overflows ? `linear-gradient(to right, transparent 0, #000 ${fadeL}px, #000 calc(100% - ${fadeR}px), transparent 100%)` : undefined;

  return (
    <div className="relative w-full">
      <div
        ref={ref}
        className={`thin-scroll w-full overflow-x-auto overflow-y-hidden ${className}`}
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      >
      {layout && (
        <div ref={innerRef} className="relative mx-auto" style={{ width: layout.width + axis, height: layout.height + axis }}>
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
                    className="mono absolute flex items-center justify-center whitespace-nowrap border border-dashed text-center leading-tight"
                    style={{
                      left: c.start,
                      top: r.start,
                      width: layout.cell,
                      height: layout.cell,
                      borderRadius: tileRadius(layout.cell),
                      borderColor: `color-mix(in oklab, ${catVar(m.category)} 50%, transparent)`,
                      // Text needs 4.5:1 in every palette, so lean the category colour towards ink, like tile text.
                      color: `color-mix(in oklab, ${catVar(m.category)} var(--cell-ink-mix), var(--ink))`,
                      fontSize: Math.max(9, Math.round(layout.cell * 0.16)),
                    }}
                    aria-hidden
                  >
                    {/* The range is printed on one line where it fits at 9px or more, else on two ("89–" over "103"), so both markers read alike. */}
                    {layout.cell - 4 >= m.label.length * 0.6 * Math.max(9, Math.round(layout.cell * 0.16)) ? (
                      m.label
                    ) : layout.cell >= 24 ? (
                      <span className="flex flex-col leading-none">
                        <span>{m.label.split('–')[0]}–</span>
                        <span>{m.label.split('–')[1]}</span>
                      </span>
                    ) : null}
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
      <AnimatePresence>
        {edges.right && !scrolled && (
          <motion.div
            key="swipe"
            aria-hidden
            // With no empty band (a board without the f-block), the chip sits just above the table, clear of tiles and labels.
            className={`pointer-events-none absolute right-4 z-20 ${bandTop === null ? 'top-0 -translate-y-full pb-1' : '-translate-y-1/2'}`}
            style={bandTop === null ? undefined : { top: bandTop }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : DUR.menu, ease: EASE }}
          >
            <div className="flex h-7 items-center gap-1 rounded-control border border-line-strong bg-surface pl-3 pr-2 text-[13px] font-medium text-ink" style={{ boxShadow: 'var(--shadow-md)' }}>
              Swipe for more
              <motion.span
                className="grid place-items-center text-ink-2"
                animate={reduceMotion ? undefined : { x: [0, 3, 0] }}
                transition={reduceMotion ? undefined : { duration: 0.9, repeat: 2, repeatDelay: 0.6, ease: EASE, delay: 0.4 }}
              >
                <ChevronRight size={16} strokeWidth={1.5} />
              </motion.span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Axes({ layout }: { layout: NonNullable<ReturnType<typeof computeLayout>> }) {
  return (
    <div aria-hidden className="mono pointer-events-none absolute inset-0 text-[11px] leading-none text-ink-3">
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
