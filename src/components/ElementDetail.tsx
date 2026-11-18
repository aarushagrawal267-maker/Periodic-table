import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ELEMENTS, byNumber, catVar, categoryLabel, formatNumber, type Element } from '../lib/elements';
import { shells } from '../lib/shells';
import { useProgress } from '../store/progress';
import { announceAchievements, useUi } from '../store/ui';
import { Sheet } from './Sheet';
import { ElementTile } from './ElementTile';

/**
 * Where focus should land after browsing to another element. The article is keyed by element
 * (so its animations replay), which unmounts the button that had focus; the new render reclaims it.
 */
let refocus: 'prev' | 'next' | 'heading' | null = null;

export function ElementDetailSheet() {
  const detail = useUi((s) => s.detail);
  const openDetail = useUi((s) => s.openDetail);
  const markExplored = useProgress((s) => s.markExplored);
  const [announce, setAnnounce] = useState('');

  /** Move to another element from inside the sheet, keeping focus in the dialog and saying where you are. */
  const browse = useCallback(
    (n: number, focus: 'prev' | 'next' | 'heading') => {
      const a = document.activeElement;
      // Only reclaim focus when it was inside the sheet; the buttons that held it are about to unmount.
      refocus = a instanceof HTMLElement && a.closest('[role="dialog"]') ? focus : null;
      const e = byNumber(n);
      setAnnounce(`${e.name}, element ${e.number}`);
      openDetail(n);
    },
    [openDetail],
  );

  useEffect(() => {
    if (detail) announceAchievements(markExplored(detail));
  }, [detail, markExplored]);

  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') browse(detail === 118 ? 1 : detail + 1, 'heading');
      if (e.key === 'ArrowLeft') browse(detail === 1 ? 118 : detail - 1, 'heading');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail, browse]);

  // A fresh open starts with nothing to announce; the dialog's own name says which element it is.
  useEffect(() => {
    if (!detail) setAnnounce('');
  }, [detail]);

  const e = detail ? byNumber(detail) : null;
  return (
    <Sheet open={!!e} onClose={() => openDetail(null)} label={e ? `${e.name} details` : 'Element details'} wide>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {e && <ElementDetail key={e.number} e={e} browse={browse} />}
    </Sheet>
  );
}

function ElementDetail({ e, browse }: { e: Element; browse: (n: number, focus: 'prev' | 'next' | 'heading') => void }) {
  const m = useProgress((s) => s.mastery[e.number]);
  const root = useRef<HTMLElement>(null);

  // After browsing, put focus back on the same control in the new element's card (WCAG 2.4.3).
  useEffect(() => {
    const target = refocus;
    refocus = null;
    if (!target || !root.current) return;
    const el = root.current.querySelector<HTMLElement>(target === 'heading' ? 'h2' : `[data-neighbour="${target}"]`);
    el?.focus({ preventScroll: target !== 'heading' });
  }, []);
  const c = catVar(e.category);
  const toC = (k: number | null) => (k === null ? null : Math.round(k - 273.15));

  const props: [string, string, string?][] = [
    ['Atomic mass', `${formatNumber(e.mass, 6)}`, 'u'],
    ['State at 20 °C', e.state + (e.statePredicted ? ' (predicted)' : '')],
    ['Group · Period', `${e.group ?? '—'} · ${e.period}`],
    ['Block', `${e.block}-block`],
    ['Electronegativity', formatNumber(e.electronegativity), e.electronegativity !== null ? 'Pauling' : undefined],
    ['Density', formatNumber(e.density), e.density !== null ? 'g/cm³' : undefined],
    ['Melting point', e.melt === null ? '—' : `${formatNumber(e.melt, 4)} K`, e.melt === null ? undefined : `${toC(e.melt)} °C`],
    ['Boiling point', e.boil === null ? '—' : `${formatNumber(e.boil, 4)} K`, e.boil === null ? undefined : `${toC(e.boil)} °C`],
    ['Atomic radius', formatNumber(e.radius), e.radius !== null ? 'pm' : undefined],
    ['Ionization energy', formatNumber(e.ionization), e.ionization !== null ? 'eV' : undefined],
    ['Discovered', e.ancient ? 'Ancient' : (e.year?.toString() ?? '—')],
    ['Oxidation states', e.oxidation ?? '—'],
  ];

  return (
    <article ref={root} style={{ '--c': c } as CSSProperties}>
      <header className="relative overflow-hidden px-6 pb-6 pt-8 sm:px-8">
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[140%] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{ background: `radial-gradient(closest-side, ${c}, transparent)` }}
        />
        <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <motion.div
            className="h-32 w-32 shrink-0 sm:h-36 sm:w-36"
            initial={{ rotateY: -30, scale: 0.85, opacity: 0 }}
            animate={{ rotateY: 0, scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 16, stiffness: 180 }}
            style={{ filter: `drop-shadow(0 18px 40px color-mix(in oklab, ${c} 45%, transparent))` }}
          >
            <ElementTile element={e} size={144} showName={false} />
          </motion.div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <span className="cat-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
              {categoryLabel(e.category)}
            </span>
            <h2 tabIndex={-1} className="font-display mt-2 text-4xl font-semibold outline-none sm:text-5xl">
              {e.name}
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              Element {e.number} · <span className="font-mono tracking-tight">{e.config}</span>
              {e.configPredicted && ' (predicted)'}
            </p>
            <MasteryDots s={m?.s ?? 0} />
          </div>
        </div>
      </header>

      <div className="grid gap-6 px-6 pb-8 sm:grid-cols-[1fr_200px] sm:px-8">
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed text-ink">{e.summary}</p>
          {e.fact && (
            <div className="rounded-2xl border p-4" style={{ borderColor: `color-mix(in oklab, ${c} 30%, transparent)`, background: `color-mix(in oklab, ${c} 7%, transparent)` }}>
              <div className="cat-ink mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                <Lightbulb size={14} /> Did you know?
              </div>
              <p className="text-[15px] leading-relaxed">{e.fact}</p>
            </div>
          )}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">Where you'll find it</h3>
            <ul className="flex flex-wrap gap-2">
              {e.uses.map((u) => (
                <li key={u} className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm">
                  {u}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <AtomModel e={e} />
      </div>

      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-3">
        {props.map(([k, v, unit]) => (
          <div key={k} className="solid px-5 py-3.5">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-3">{k}</dt>
            <dd className="mt-0.5 font-display text-[17px] font-medium tabular-nums">
              {v} {unit && <span className="text-xs font-normal text-ink-3">{unit}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <nav className="flex items-center justify-between px-4 py-4 sm:px-6" aria-label="Neighbouring elements">
        <NeighbourButton n={e.number === 1 ? 118 : e.number - 1} dir="prev" onClick={(n) => browse(n, 'prev')} />
        <span className="hidden text-xs text-ink-3 sm:block">Use ← → to browse</span>
        <NeighbourButton n={e.number === 118 ? 1 : e.number + 1} dir="next" onClick={(n) => browse(n, 'next')} />
      </nav>
      <p className="px-6 pb-6 text-[11px] text-ink-3 sm:px-8">Property data: PubChem (NCBI). Values for superheavy elements are predictions or estimates.</p>
    </article>
  );
}

function NeighbourButton({ n, dir, onClick }: { n: number; dir: 'prev' | 'next'; onClick: (n: number) => void }) {
  const e = ELEMENTS[n - 1];
  return (
    <button
      onClick={() => onClick(n)}
      data-neighbour={dir}
      className="btn-ghost flex items-center gap-2 rounded-full py-2 pl-3 pr-4 text-sm"
      // Includes the visible symbol and name, so "click Next" and "click Co" both work (WCAG 2.5.3).
      aria-label={`${dir === 'prev' ? 'Previous' : 'Next'}: ${e.symbol}, ${e.name}`}
    >
      {dir === 'prev' && <ChevronLeft size={16} />}
      <span className="cat-ink font-display font-semibold" style={{ '--c': catVar(e.category) } as CSSProperties}>
        {e.symbol}
      </span>{' '}
      <span className="text-ink-2">{e.name}</span>
      {dir === 'next' && <ChevronRight size={16} />}
    </button>
  );
}

export function MasteryDots({ s, className = '' }: { s: number; className?: string }) {
  const label = s >= 4 ? 'Mastered' : s === 0 ? 'Not practised yet' : 'Learning';
  return (
    <div className={`mt-3 flex items-center justify-center gap-2 sm:justify-start ${className}`} aria-label={`Mastery ${s} of 5: ${label}`}>
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="h-1.5 w-5 rounded-full transition-colors" style={{ background: i < s ? 'var(--c, var(--accent))' : 'var(--line-strong)' }} />
        ))}
      </div>
      <span className="text-xs text-ink-3">{label}</span>
    </div>
  );
}

/** Bohr-style shell diagram built from the real electron configuration. */
function AtomModel({ e }: { e: Element }) {
  const sh = shells(e);
  const size = 200;
  const center = size / 2;
  const step = (size / 2 - 14) / sh.length;
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[220px]" role="img" aria-label={`Electron shells: ${sh.join(', ')}`}>
        <defs>
          <radialGradient id="nucleus">
            <stop offset="0" stopColor="white" stopOpacity="0.9" />
            <stop offset="0.4" stopColor="var(--c)" />
            <stop offset="1" stopColor="var(--c)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={center} cy={center} r={14} fill="url(#nucleus)" />
        {sh.map((count, i) => {
          const r = 14 + step * (i + 1) - step / 3;
          const speed = 10 + i * 6;
          return (
            <g key={i}>
              <circle cx={center} cy={center} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={1} />
              <g style={{ transformOrigin: `${center}px ${center}px`, animation: `spin ${speed}s linear infinite ${i % 2 ? 'reverse' : ''}` }}>
                {Array.from({ length: count }, (_, j) => {
                  const a = (j / count) * Math.PI * 2;
                  return <circle key={j} cx={center + r * Math.cos(a)} cy={center + r * Math.sin(a)} r={count > 18 ? 1.8 : 2.6} fill="var(--c)" />;
                })}
              </g>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 text-center text-xs text-ink-3">
        Shells <span className="font-mono text-ink-2">{sh.join(' · ')}</span>
      </figcaption>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </figure>
  );
}
