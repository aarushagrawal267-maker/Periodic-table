import { ArrowRight } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { memo, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { byNumber, catVar, categoryLabel, formatNumber, type Element } from '../lib/elements';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { ElementTile, tileRadius } from './ElementTile';
import { PeriodicGrid, type CellRect } from './PeriodicGrid';
import { printDelay } from './heroPrint';
import { useGridRoving } from './useGridRoving';
import '../styles/hero.css';

/** The table prints itself once per visit to the site, not every time Home is opened again. */
let printed = false;

const GAP = 4;
/** The key needs room for a tile and two lines of text beside it. */
const KEY_MIN_CELL = 34;
/** The width from which the whole table fits without scrolling (see the comment where it is read). */
const WIDE_QUERY = '(min-width: 656px)';

/** A tiny store for the element under the pointer or focus, so a hover re-renders the key and not 118 cells. */
function createPointed() {
  let value: number | null = null;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (n: number | null) => {
      if (value === n) return;
      value = n;
      subs.forEach((f) => f());
    },
    subscribe: (f: () => void) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
  };
}
type Pointed = ReturnType<typeof createPointed>;

const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

interface Props {
  /** Progress mode: elements you have met print in full colour, the rest softly. Omit to print all 118 in colour. */
  met?: (n: number) => boolean;
  /** The line under the table, left of the Explore link. */
  caption: ReactNode;
}

/**
 * The Home hero's visual: the whole wall chart, 118 tiles in their category colours with the atomic number in each corner.
 * It prints itself in a short sweep when the site opens, a tile lifts and lights up under the pointer or focus,
 * and selecting one opens its card. One Tab stop; the arrow keys move along the table (useGridRoving).
 */
export function HeroTable({ met, caption }: Props) {
  const openDetail = useUi((s) => s.openDetail);
  const roving = useGridRoving();
  const { setActive } = roving;
  const reduceSetting = useSettings((s) => s.reduceMotion);
  const reduceMotion = !!useReducedMotion() || reduceSetting;
  // Decided once, on the first render: a later change of the setting never replays the sweep.
  const [print] = useState(() => !printed && !reduceMotion);
  useEffect(() => {
    printed = true;
  }, []);
  // Phones keep tiles of 44px (a full tap target) and scroll sideways. From 656px the table fits the width with 30px
  // cells: 18 x 30 + 17 gaps of 4 = 608px, plus 48px of page padding.
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);
  const pointed = useMemo(createPointed, []);
  const [cell, setCell] = useState(0);

  const onPoint = useCallback(
    (e: Element) => {
      pointed.set(e.number);
      setActive(e.number);
    },
    [pointed, setActive],
  );

  const renderCell = (e: Element, rect: CellRect) => {
    const soft = met ? !met(e.number) : false;
    return (
      <button
        type="button"
        {...roving.cellProps(e)}
        onClick={() => openDetail(e.number)}
        onPointerEnter={() => pointed.set(e.number)}
        onFocus={() => onPoint(e)}
        className={`hero-cell${print ? ' hero-print' : ''}${soft ? ' hero-soft' : ''}`}
        style={{ '--d': `${printDelay(e)}ms`, borderRadius: tileRadius(rect.size) } as CSSProperties}
        aria-label={`${e.symbol}, ${e.name}, ${e.number}${soft ? ', not met yet' : ''}`}
      >
        <ElementTile element={e} size={rect.size} quietNumber showName={false} />
      </button>
    );
  };

  return (
    <div>
      <div
        className={`hero-table relative -mx-4 sm:-mx-2${reduceMotion ? ' hero-still' : ''}${print ? ' hero-printing' : ''}`}
        data-roving
        role="group"
        aria-label="Periodic table. Use the arrow keys to move between elements, and Enter to open one."
        onPointerLeave={() => pointed.set(null)}
        onBlur={(ev) => {
          if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) pointed.set(null);
        }}
      >
        <PeriodicGrid
          minCell={wide ? 30 : 44}
          maxCell={54}
          gap={GAP}
          onLayout={setCell}
          // 8px of room on every side inside the scroll box, so a lifted tile and its focus ring are never clipped;
          // the wrapper reaches 8px past the page edge, so the tiles still line up with the text.
          className="px-4 pb-2 pt-2 sm:px-2"
          renderCell={renderCell}
          // Phones have no pointer to follow and scroll the table sideways, so the key would sit half off screen: they get a line under the table instead.
          overlay={wide && cell >= KEY_MIN_CELL ? <HeroKey pointed={pointed} cell={cell} progress={!!met} met={met} /> : null}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-ink-2">
          {caption}
          {!wide && <span className="block">Tap any element to open its card</span>}
        </p>
        <a href="#/explore" className="-my-2 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink transition-colors hover:text-ink-2">
          Explore the full periodic table <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
        </a>
      </div>
    </div>
  );
}

/**
 * The key, printed in the empty space above the transition metals as a wall chart prints its own:
 * the element under the pointer or focus, large, with its name, family and two figures.
 * Decorative: each tile's accessible name already says what it is.
 */
const HeroKey = memo(function HeroKey({ pointed, cell, progress, met }: { pointed: Pointed; cell: number; progress: boolean; met?: (n: number) => boolean }) {
  const n = useSyncExternalStore(pointed.subscribe, pointed.get, () => null);
  const step = cell + GAP;
  // Groups 3 to 12, periods 1 to 3: the empty bay of the chart.
  const box = { left: 2 * step + Math.round(cell * 0.5), top: 0, width: 10 * step - GAP - Math.round(cell * 0.5), height: 3 * step - GAP };
  const tile = Math.min(2 * cell + GAP, box.height);
  const e = n ? byNumber(n) : null;
  return (
    <div aria-hidden className="hero-key pointer-events-none absolute flex items-center" style={box}>
      {e ? (
        <div key={e.number} className="hero-key-in flex min-w-0 items-center gap-4">
          <div className="shrink-0" style={{ width: tile, height: tile }}>
            <ElementTile element={e} size={tile} showName={false} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[17px] font-medium leading-6 text-ink">{e.name}</div>
            <div className="cat-ink truncate text-[13px] leading-5" style={{ '--c': catVar(e.category) } as CSSProperties}>
              {categoryLabel(e.category)}
            </div>
            <div className="meta mt-1 truncate">
              <span className="text-ink-2">{formatNumber(e.mass, 5)}</span> u · {e.state}
              {progress && met && !met(e.number) ? ' · not met yet' : ''}
            </div>
          </div>
        </div>
      ) : (
        <div className="hero-key-in min-w-0">
          <div className="text-[15px] font-medium leading-6 text-ink">Select any element to open its card</div>
          <div className="meta mt-1 text-pretty">Atomic number in the corner, family in the colour</div>
        </div>
      )}
    </div>
  );
});
