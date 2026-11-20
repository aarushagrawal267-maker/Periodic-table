import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ElementTile, tileRadius } from '../components/ElementTile';
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
  { id: 'category', label: 'Category', describe: 'Ten families of elements that share behaviour' },
  { id: 'state', label: 'State', describe: 'Solid, liquid or gas at room temperature (20 °C)' },
  { id: 'en', label: 'Electronegativity', value: (e) => e.electronegativity, unit: 'Pauling', lo: 'Gives electrons', hi: 'Grabs electrons', describe: 'How strongly an atom pulls shared electrons. Rises up and to the right.' },
  { id: 'radius', label: 'Atomic radius', value: (e) => e.radius, unit: 'pm', lo: 'Small', hi: 'Large', describe: 'Atoms grow down a group and shrink across a period' },
  { id: 'ie', label: 'Ionization energy', value: (e) => e.ionization, unit: 'eV', lo: 'Easy to ionize', hi: 'Hard to ionize', describe: 'Energy needed to remove one electron. Noble gases hold on hardest.' },
  { id: 'density', label: 'Density', value: (e) => e.density, log: true, unit: 'g/cm³', lo: 'Light', hi: 'Dense', describe: 'Mass per volume, on a log scale. Osmium and iridium top the chart.' },
  { id: 'melt', label: 'Melting point', value: (e) => e.melt, unit: 'K', lo: 'Cold', hi: 'Hot', describe: 'Temperature at which the solid melts. Look at the middle of the d-block.' },
  { id: 'year', label: 'Discovery', value: (e) => (e.ancient ? 0 : e.year), lo: 'Ancient', hi: 'Recent', describe: 'When each element was identified. Ancient metals sit in deep blue.' },
  { id: 'mastery', label: 'My mastery', describe: 'How well you know each element. Play to fill the table in.' },
];

/** US spellings students may type, so search still finds the IUPAC names. */
const US_NAMES: Record<number, string> = { 13: 'aluminum', 55: 'cesium' };

const STATE_COLORS: Record<string, string> = { Solid: 'var(--cat-transition-metal)', Liquid: 'var(--cat-nonmetal)', Gas: 'var(--cat-noble-gas)' };

/** Property lenses run from a cool blue to a warm orange, mixed in oklab so the middle stays neutral instead of swinging through magenta. */
const heat = (t: number) => `color-mix(in oklab, var(--heat-hi) ${Math.round(t * 100)}%, var(--heat-lo))`;
/** Mastery is progress, so it is drawn in the accent: one step of strength per level. */
const masteryColor = (s: number) => `color-mix(in oklab, var(--accent) ${25 * s}%, var(--ink-3))`;
const KEY_STEPS = [0, 0.25, 0.5, 0.75, 1];

/** A lens value as text. Years are exact (never rounded to three figures), and ancient elements say so. */
const valueText = (lens: Lens, e: Element) => {
  const v = lens.value?.(e) ?? null;
  if (lens.id === 'year') return e.ancient ? 'Ancient' : v === null ? '—' : String(v);
  return formatNumber(v);
};

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
      return s === 0 ? null : masteryColor(s);
    }
    const v = L.value!(e);
    if (v === null) return null;
    return heat(scale!.t(v));
  };

  const dim = (e: Element) => (matches ? !matches.has(e.number) : hoverCat ? e.category !== hoverCat : false);
  const preview = hovered ?? (matches && matches.size === 1 ? ELEMENTS[[...matches][0] - 1] : null);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12" style={{ '--heat-lo': '#3b4cc0', '--heat-hi': '#ff6b4a' } as CSSProperties}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="label">Explore</p>
          <h1 className="t-title mt-1">The periodic table</h1>
          <p className="mt-2 max-w-xl text-ink-2">Colour the table by a property to see the patterns chemists see. Select any element to open its card.</p>
        </div>
        <label className="relative block w-full lg:w-80">
          <Search size={16} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' && matches?.size) openDetail([...matches][0]);
            }}
            placeholder="Search elements"
            aria-label="Search elements"
            className="field pl-9 pr-11"
          />
          {query && (
            <button onClick={() => setQuery('')} className="icon-btn absolute right-0 top-1/2 -translate-y-1/2 md:right-1" aria-label="Clear search">
              <X size={16} strokeWidth={1.5} />
            </button>
          )}
        </label>
      </div>

      {/* Lenses: one quiet segmented control. On phones it scrolls sideways; py-1 leaves room for the focus ring. */}
      <div className="no-scrollbar -mx-4 mt-6 overflow-x-auto px-4 py-1 sm:-mx-6 sm:px-6">
        <div className="seg" role="tablist" aria-label="Colour the table by">
          {LENSES.map((l) => (
            <button key={l.id} role="tab" aria-selected={lens === l.id} onClick={() => setLens(l.id)} className="seg-item shrink-0 whitespace-nowrap">
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* PeriodicGrid shows its own "Swipe for more" cue when the table is wider than the screen. */}
      {/* One Tab stop for the whole table; arrow keys move between elements. */}
      <div className="relative mt-6" data-roving role="group" aria-label="Periodic table. Use the arrow keys to move between elements.">
        <PeriodicGrid
          minCell={38}
          maxCell={74}
          gap={4}
          showAxes
          className="pb-4 pt-1"
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
                className="group block h-full w-full transition-opacity duration-200 ease-out focus-visible:z-10"
                // Heat-map colours start at a deep blue, so tile text leans further towards --ink there.
                style={{ borderRadius: tileRadius(rect.size), opacity: d ? 0.14 : 1, filter: d ? 'grayscale(1)' : undefined, ...(L.value ? { '--cell-ink-mix': 'var(--heat-ink-mix)' } : {}) } as CSSProperties}
                aria-label={`${e.symbol}, ${e.name}, ${e.number}${L.value ? `, ${L.label} ${valueText(L, e)}` : ''}`}
              >
                <ElementTile
                  element={e}
                  size={rect.size}
                  quietNumber
                  color={c ?? 'var(--ink-3)'}
                  className="transition-colors duration-150 ease-out group-hover:border-ink-2!"
                  style={c ? undefined : { borderStyle: 'dashed' }}
                />
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

      {/* The key, printed under the table like a wall chart's legend: what the colours mean, then the swatches. */}
      <div className="mt-6 border-t border-line pt-4">
        <p className="mb-2 max-w-2xl text-sm text-ink-2">{L.describe}</p>
        {lens === 'category' ? (
          <ul className="-mx-2 grid grid-cols-2 gap-x-4 sm:grid-cols-3 lg:grid-cols-5" aria-label="Categories" onMouseLeave={() => setHoverCat(null)}>
            {CATEGORIES.map((c) => (
              <li key={c.id}>
                <button
                  onMouseEnter={() => setHoverCat(c.id)}
                  onFocus={() => setHoverCat(c.id)}
                  onBlur={() => setHoverCat(null)}
                  onClick={() => setQuery(c.label)}
                  className="flex h-11 w-full items-center gap-2 rounded-control px-2 text-left text-sm text-ink-2 transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-ink md:h-9"
                >
                  <span className="dot" style={{ '--c': catVar(c.id) } as CSSProperties} />
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        ) : lens === 'state' ? (
          <ul className="flex flex-wrap gap-x-6" aria-label="States">
            {Object.entries(STATE_COLORS).map(([k, v]) => (
              <li key={k} className="flex h-9 items-center gap-2 text-sm text-ink-2">
                <span className="dot" style={{ '--c': v } as CSSProperties} />
                {k}
              </li>
            ))}
          </ul>
        ) : lens === 'mastery' ? (
          <div className="flex min-h-9 flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-2">
            <span className="flex items-center gap-3">
              <span>Learning</span>
              <span className="flex gap-1" aria-hidden>
                {[1, 2, 3, 4].map((s) => (
                  <span key={s} className="dot" style={{ '--c': masteryColor(s) } as CSSProperties} />
                ))}
              </span>
              <span>Mastered</span>
            </span>
            <NoData label="Not started" />
          </div>
        ) : (
          <div className="flex min-h-9 flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-2">
            <span className="flex items-center gap-3">
              <span>{L.lo}</span>
              <span className="flex gap-1" aria-hidden>
                {KEY_STEPS.map((t) => (
                  <span key={t} className="dot" style={{ '--c': heat(t) } as CSSProperties} />
                ))}
              </span>
              <span>{L.hi}</span>
            </span>
            <span className="meta">
              {L.id === 'year' ? `Ancient to ${scale!.max}` : `${formatNumber(scale!.min)} to ${formatNumber(scale!.max)} ${L.unit}`}
            </span>
            <NoData label="No data" />
          </div>
        )}
      </div>
    </div>
  );
}

function NoData({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2 text-ink-3">
      <span aria-hidden className="h-2 w-2 rounded-full border border-dashed border-ink-3" />
      {label}
    </span>
  );
}

function Preview({ e, lens }: { e: Element; lens: Lens }) {
  const v = lens.value?.(e) ?? null;
  return (
    <div className="card flex items-center gap-4 p-2 pr-5" style={{ boxShadow: 'var(--shadow-lg)' }}>
      <div className="h-14 w-14 shrink-0">
        <ElementTile element={e} size={56} showName={false} />
      </div>
      <div className="min-w-0">
        <div className="text-[17px] font-medium leading-6">{e.name}</div>
        <div className="cat-ink text-[13px] leading-5" style={{ '--c': catVar(e.category) } as CSSProperties}>
          {categoryLabel(e.category)}
        </div>
        <div className="meta mt-1">
          {lens.value ? (
            <>
              {lens.label} <span className="text-ink">{valueText(lens, e)}</span> {v !== null && lens.id !== 'year' ? lens.unit : ''}
            </>
          ) : (
            <>
              Mass <span className="text-ink">{formatNumber(e.mass, 5)}</span> u · {e.state}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
