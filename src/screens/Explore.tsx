import { motion } from 'motion/react';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ElementTile } from '../components/ElementTile';
import { PeriodicGrid } from '../components/PeriodicGrid';
import { useGridRoving } from '../components/useGridRoving';
import { CATEGORIES, ELEMENTS, bySymbol, catVar, categoryLabel, formatNumber, type Category, type Element } from '../lib/elements';
import { go } from '../lib/router';
import { useProgress } from '../store/progress';
import { useUi } from '../store/ui';

type Lens = {
  id: string;
  label: string;
  value?: (e: Element) => number | null;
  log?: boolean;
  unit?: string;
  lo?: string;
  hi?: string;
  describe: string;
};

const LENSES: Lens[] = [
  { id: 'category', label: 'Category', describe: 'Ten families of elements that share behaviour.' },
  { id: 'state', label: 'State', describe: 'Solid, liquid or gas at room temperature (20 °C).' },
  { id: 'en', label: 'Electronegativity', value: (e) => e.electronegativity, unit: 'Pauling', lo: 'Gives electrons', hi: 'Grabs electrons', describe: 'How strongly an atom pulls shared electrons. Rises up and to the right.' },
  { id: 'radius', label: 'Atomic radius', value: (e) => e.radius, unit: 'pm', lo: 'Small', hi: 'Large', describe: 'Atoms grow down a group and shrink across a period.' },
  { id: 'ie', label: 'Ionization energy', value: (e) => e.ionization, unit: 'eV', lo: 'Easy to ionize', hi: 'Hard to ionize', describe: 'Energy needed to remove one electron. Noble gases hold on hardest.' },
  { id: 'density', label: 'Density', value: (e) => e.density, log: true, unit: 'g/cm³', lo: 'Light', hi: 'Dense', describe: 'Mass per volume, on a log scale. Osmium and iridium top the chart.' },
  { id: 'melt', label: 'Melting point', value: (e) => e.melt, unit: 'K', lo: 'Cold', hi: 'Hot', describe: 'Temperature at which the solid melts. Look at the middle of the d-block.' },
  { id: 'year', label: 'Discovery', value: (e) => (e.ancient ? 0 : e.year), lo: 'Ancient', hi: 'Recent', describe: 'When each element was identified. Ancient metals sit in deep blue.' },
  { id: 'mastery', label: 'My mastery', describe: 'How well you know each element. Play to fill the table in.' },
];

/** US spellings students may type, so search still finds the IUPAC names. */
const US_NAMES: Record<number, string> = { 13: 'aluminum', 55: 'cesium' };

const STATE_COLORS: Record<string, string> = { Solid: 'var(--cat-transition-metal)', Liquid: 'var(--cat-nonmetal)', Gas: 'var(--cat-noble-gas)' };

export function Explore({ symbol }: { symbol?: string }) {
  const [lens, setLens] = useState('category');
  const [query, setQuery] = useState('');
  const [hoverCat, setHoverCat] = useState<Category | null>(null);
  const [hovered, setHovered] = useState<Element | null>(null);
  const openDetail = useUi((s) => s.openDetail);
  const mastery = useProgress((s) => s.mastery);
  const L = LENSES.find((l) => l.id === lens)!;
  const roving = useGridRoving();

  useEffect(() => {
    const e = symbol && bySymbol.get(symbol.toLowerCase());
    if (e) {
      openDetail(e.number);
      go('/explore', true);
    }
  }, [symbol, openDetail]);

  const scale = useMemo(() => {
    if (!L.value) return null;
    const vals = ELEMENTS.map(L.value).filter((v): v is number => v !== null);
    const f = (v: number) => (L.log ? Math.log10(v) : v);
    const min = Math.min(...vals.map(f));
    const max = Math.max(...vals.map(f));
    return { t: (v: number) => (f(v) - min) / (max - min), min: Math.min(...vals), max: Math.max(...vals) };
  }, [L]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    return new Set(
      ELEMENTS.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (US_NAMES[e.number]?.includes(q) ?? false) ||
          e.symbol.toLowerCase() === q ||
          String(e.number) === q ||
          categoryLabel(e.category).toLowerCase().includes(q),
      ).map((e) => e.number),
    );
  }, [q]);

  const colorFor = (e: Element): string | null => {
    if (lens === 'category') return catVar(e.category);
    if (lens === 'state') return STATE_COLORS[e.state] ?? null;
    if (lens === 'mastery') {
      const s = mastery[e.number]?.s ?? 0;
      return s === 0 ? null : `color-mix(in oklab, var(--accent-3) ${20 + s * 16}%, var(--accent))`;
    }
    const v = L.value!(e);
    if (v === null) return null;
    const t = scale!.t(v);
    return `color-mix(in oklch, var(--heat-hi) ${Math.round(t * 100)}%, var(--heat-lo))`;
  };

  const dim = (e: Element) => (matches ? !matches.has(e.number) : hoverCat ? e.category !== hoverCat : false);
  const preview = hovered ?? (matches && matches.size === 1 ? ELEMENTS[[...matches][0] - 1] : null);

  return (
    <div className="mx-auto max-w-[1400px] px-3 pb-16 pt-8 sm:px-6 sm:pt-10" style={{ '--heat-lo': '#3b4cc0', '--heat-hi': '#ff6b4a' } as CSSProperties}>
      <div className="flex flex-col gap-5 px-1 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-accent-2">Explore</p>
          <h1 className="font-display mt-1 text-4xl font-semibold sm:text-5xl">The living table</h1>
          <p className="mt-2 max-w-xl text-ink-2">Switch lenses to see the patterns chemists see. Tap any element for its full story.</p>
        </div>
        <label className="relative block w-full lg:w-80">
          <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' && matches?.size) openDetail([...matches][0]);
            }}
            placeholder="Search name, symbol, number…"
            aria-label="Search elements"
            className="h-12 w-full rounded-2xl border border-line bg-surface pl-11 pr-10 text-[15px] outline-none transition-colors placeholder:text-ink-3 focus:border-accent-2"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full hover:bg-surface-2" aria-label="Clear search">
              <X size={15} />
            </button>
          )}
        </label>
      </div>

      {/* py-1 leaves room for the focus ring, which the horizontal scroller would otherwise clip. */}
      <div className="no-scrollbar -mx-3 mt-5 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:px-1" role="tablist" aria-label="Colour the table by">
        {LENSES.map((l) => (
          <button key={l.id} role="tab" aria-selected={lens === l.id} onClick={() => setLens(l.id)} className={`relative shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${lens === l.id ? 'text-bg' : 'border border-line bg-surface text-ink-2 hover:text-ink'}`}>
            {lens === l.id && <motion.span layoutId="lens-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: 'spring', damping: 30, stiffness: 400 }} />}
            <span className="relative">{l.label}</span>
          </button>
        ))}
      </div>

      {/* PeriodicGrid shows its own "Swipe for more" cue when the table is wider than the screen. */}
      {/* One Tab stop for the whole table; arrow keys move between elements. */}
      <div className="relative mt-5 md:mt-6" data-roving role="group" aria-label="Periodic table. Use the arrow keys to move between elements.">
        <PeriodicGrid
          minCell={38}
          maxCell={74}
          gap={4}
          showAxes
          className="pb-3 pt-1"
          renderCell={(e, rect) => {
            const c = colorFor(e);
            const d = dim(e);
            return (
              <button
                {...roving.cellProps(e)}
                onClick={() => openDetail(e.number)}
                onMouseEnter={() => setHovered(e)}
                onMouseLeave={() => setHovered((h) => (h === e ? null : h))}
                onFocus={() => {
                  setHovered(e);
                  roving.setActive(e.number);
                }}
                className="block h-full w-full transition-[transform,opacity,filter] duration-200 hover:z-10 hover:scale-[1.18] focus-visible:z-10 focus-visible:scale-110"
                // Heat-map colours start at a deep blue, so tile text leans further towards --ink there.
                style={{ opacity: d ? 0.14 : 1, filter: d ? 'grayscale(1)' : undefined, ...(L.value ? { '--cell-ink-mix': 'var(--heat-ink-mix)' } : {}) } as CSSProperties}
                aria-label={`${e.symbol}, ${e.name}, ${e.number}${L.value ? `, ${L.label} ${formatNumber(L.value(e))}` : ''}`}
              >
                <ElementTile element={e} size={rect.size} quietNumber color={c ?? 'var(--ink-3)'} style={c ? undefined : { borderStyle: 'dashed' }} />
              </button>
            );
          }}
          overlay={
            preview && (
              <div className="pointer-events-none absolute hidden lg:block" style={{ left: '14%', top: 4, width: '42%' }}>
                <Preview e={preview} lens={L} />
              </div>
            )
          }
        />
      </div>

      <div className="mt-4 px-1">
        {lens === 'category' ? (
          <ul className="flex flex-wrap gap-2" onMouseLeave={() => setHoverCat(null)}>
            {CATEGORIES.map((c) => (
              <li key={c.id}>
                <button onMouseEnter={() => setHoverCat(c.id)} onFocus={() => setHoverCat(c.id)} onBlur={() => setHoverCat(null)} onClick={() => setQuery(c.label)} className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm transition-colors hover:bg-surface-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: catVar(c.id) }} />
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        ) : lens === 'state' ? (
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATE_COLORS).map(([k, v]) => (
              <span key={k} className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: v }} />
                {k}
              </span>
            ))}
          </div>
        ) : lens === 'mastery' ? (
          <div className="flex items-center gap-3 text-sm text-ink-2">
            <span>New</span>
            <div className="h-2.5 w-48 rounded-full" style={{ background: 'linear-gradient(90deg, var(--line-strong), var(--accent), var(--accent-3))' }} />
            <span>Mastered</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-2">
            <span>{L.lo}</span>
            <div className="h-2.5 w-48 rounded-full" style={{ background: 'linear-gradient(90deg, var(--heat-lo), color-mix(in oklch, var(--heat-hi) 50%, var(--heat-lo)), var(--heat-hi))' }} />
            <span>{L.hi}</span>
            <span className="text-ink-3">
              {formatNumber(scale!.min)} – {formatNumber(scale!.max)} {L.unit}
            </span>
            <span className="flex items-center gap-1.5 text-ink-3">
              <span className="h-2.5 w-2.5 rounded-full border border-dashed border-ink-3" /> No data
            </span>
          </div>
        )}
        <p className="mt-3 text-sm text-ink-3">{L.describe}</p>
      </div>
    </div>
  );
}

function Preview({ e, lens }: { e: Element; lens: Lens }) {
  return (
    <div className="glass flex items-center gap-4 rounded-2xl p-3 pr-5" style={{ boxShadow: 'var(--shadow-lg)' }}>
      <div className="h-16 w-16 shrink-0">
        <ElementTile element={e} size={64} showName={false} />
      </div>
      <div className="min-w-0">
        <div className="font-display text-lg font-semibold leading-tight">{e.name}</div>
        <div className="cat-ink text-xs" style={{ '--c': catVar(e.category) } as CSSProperties}>
          {categoryLabel(e.category)}
        </div>
        <div className="mt-1 text-xs text-ink-2">
          {lens.value ? (
            <>
              {lens.label}: <b className="text-ink">{lens.id === 'year' && e.ancient ? 'Ancient' : formatNumber(lens.value(e))}</b> {lens.value(e) !== null && lens.id !== 'year' ? lens.unit : ''}
            </>
          ) : (
            <>Mass {formatNumber(e.mass, 5)} u · {e.state}</>
          )}
        </div>
      </div>
    </div>
  );
}
