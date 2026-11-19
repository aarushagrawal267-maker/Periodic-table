import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ELEMENTS, byNumber, catVar, categoryLabel, formatNumber, type Element } from '../lib/elements';
import { shells } from '../lib/shells';
import { useProgress } from '../store/progress';
import { announceAchievements, useUi } from '../store/ui';
import { Sheet } from './Sheet';
import { ElementTile } from './ElementTile';
import { DUR, tween } from './motion';

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
  const toC = (k: number) => `${Math.round(k - 273.15).toLocaleString('en-US')} °C`;

  const props: [string, string, string?][] = [
    ['Atomic mass', `${formatNumber(e.mass, 6)}`, 'u'],
    ['State at 20 °C', e.state + (e.statePredicted ? ' (predicted)' : '')],
    ['Group · Period', `${e.group ?? '—'} · ${e.period}`],
    ['Block', `${e.block}-block`],
    ['Electronegativity', formatNumber(e.electronegativity), e.electronegativity !== null ? 'Pauling' : undefined],
    ['Density', formatNumber(e.density), e.density !== null ? 'g/cm³' : undefined],
    ['Melting point', e.melt === null ? '—' : `${formatNumber(e.melt, 4)} K`, e.melt === null ? undefined : toC(e.melt)],
    ['Boiling point', e.boil === null ? '—' : `${formatNumber(e.boil, 4)} K`, e.boil === null ? undefined : toC(e.boil)],
    ['Atomic radius', formatNumber(e.radius), e.radius !== null ? 'pm' : undefined],
    ['Ionization energy', formatNumber(e.ionization), e.ionization !== null ? 'eV' : undefined],
    ['Discovered', e.ancient ? 'Ancient' : (e.year?.toString() ?? '—')],
    ['Oxidation states', e.oxidation ?? '—'],
  ];

  return (
    <article ref={root} style={{ '--c': c } as CSSProperties}>
      <header className="px-6 pb-6 pt-8 sm:px-8 sm:pt-8">
        <div className="flex items-center gap-5 pr-10 sm:gap-6 sm:pr-0">
          <motion.div className="h-24 w-24 shrink-0 sm:h-32 sm:w-32" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={tween(DUR.enter)}>
            <ElementTile element={e} size={128} showName={false} />
          </motion.div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <span className="dot" aria-hidden />
              {categoryLabel(e.category)}
            </p>
            <h2 tabIndex={-1} className="t-title mt-1 outline-none">
              {e.name}
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              Element <span className="num">{e.number}</span> · <span className="mono text-ink">{e.config}</span>
              {e.configPredicted && ' (predicted)'}
            </p>
            <MasteryDots s={m?.s ?? 0} />
          </div>
        </div>
      </header>

      <div className="grid gap-8 px-6 pb-8 sm:grid-cols-[1fr_200px] sm:px-8">
        <div className="space-y-6">
          <p className="text-base leading-relaxed text-ink">{e.summary}</p>
          {e.fact && (
            <div className="rounded-card bg-surface-2 p-4">
              <h3 className="label mb-1">Did you know</h3>
              <p className="text-[15px] leading-relaxed">{e.fact}</p>
            </div>
          )}
          <div>
            <h3 className="label mb-2">Where you'll find it</h3>
            <ul className="flex flex-wrap gap-2">
              {e.uses.map((u) => (
                <li key={u} className="chip text-ink">
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
          <div key={k} className="bg-surface px-6 py-3 sm:px-8">
            <dt className="text-[13px] text-ink-2">{k}</dt>
            <dd className="num mt-1 text-[17px] font-medium">
              {v} {unit && <span className="mono text-xs font-normal text-ink-3">{unit}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <nav className="flex items-center justify-between gap-2 px-4 py-4 sm:px-6" aria-label="Neighbouring elements">
        <NeighbourButton n={e.number === 1 ? 118 : e.number - 1} dir="prev" onClick={(n) => browse(n, 'prev')} />
        <span className="hidden items-center gap-1 text-[13px] text-ink-3 sm:flex">
          <kbd className="kbd">←</kbd>
          <kbd className="kbd">→</kbd>
          <span className="ml-1">to browse</span>
        </span>
        <NeighbourButton n={e.number === 118 ? 1 : e.number + 1} dir="next" onClick={(n) => browse(n, 'next')} />
      </nav>
      <p className="px-6 pb-6 text-xs text-ink-3 sm:px-8">Property data: PubChem (NCBI). Values for superheavy elements are predictions or estimates.</p>
    </article>
  );
}

function NeighbourButton({ n, dir, onClick }: { n: number; dir: 'prev' | 'next'; onClick: (n: number) => void }) {
  const e = ELEMENTS[n - 1];
  return (
    <button
      onClick={() => onClick(n)}
      data-neighbour={dir}
      className={`btn btn-secondary min-w-0 ${dir === 'prev' ? 'pl-2' : 'pr-2'}`}
      // Includes the visible symbol and name, so "click Next" and "click Co" both work (WCAG 2.5.3).
      aria-label={`${dir === 'prev' ? 'Previous' : 'Next'}: ${e.symbol}, ${e.name}`}
    >
      {dir === 'prev' && <ChevronLeft size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" />}
      <span className="cat-ink font-medium" style={{ '--c': catVar(e.category) } as CSSProperties}>
        {e.symbol}
      </span>{' '}
      <span className="truncate text-ink-2">{e.name}</span>
      {dir === 'next' && <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" />}
    </button>
  );
}

export function MasteryDots({ s, className = '' }: { s: number; className?: string }) {
  const label = s >= 4 ? 'Mastered' : s === 0 ? 'Not practised yet' : 'Learning';
  return (
    <div className={`mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`} role="img" aria-label={`Mastery ${s} of 5: ${label}`}>
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="h-1 w-4 rounded-full" style={{ background: i < s ? 'var(--c, var(--accent))' : 'var(--line-strong)' }} />
        ))}
      </div>
      <span className="whitespace-nowrap text-[13px] text-ink-2" aria-hidden>
        {label}
      </span>
    </div>
  );
}

/** Bohr-style shell diagram built from the real electron configuration, drawn in ink lines. Static. */
function AtomModel({ e }: { e: Element }) {
  const sh = shells(e);
  const size = 200;
  const center = size / 2;
  const nucleus = 10;
  const step = (size / 2 - 8 - nucleus) / sh.length;
  return (
    <figure className="flex flex-col items-center sm:items-stretch">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[200px]" role="img" aria-label={`Electron shells: ${sh.join(', ')}`}>
        <circle cx={center} cy={center} r={nucleus} fill="var(--c)" />
        {sh.map((count, i) => {
          const r = nucleus + step * (i + 1);
          // Start each shell at a different angle so the electrons do not all line up on one spoke.
          const offset = -Math.PI / 2 + i * 0.35;
          return (
            <g key={i}>
              <circle cx={center} cy={center} r={r} fill="none" stroke="var(--ink-3)" strokeWidth={1} />
              {Array.from({ length: count }, (_, j) => {
                const a = offset + (j / count) * Math.PI * 2;
                return <circle key={j} cx={center + r * Math.cos(a)} cy={center + r * Math.sin(a)} r={count > 18 ? 1.75 : 2.5} fill="var(--ink)" />;
              })}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-3 text-center text-[13px] text-ink-2">
        Shells <span className="mono text-ink">{sh.join(' · ')}</span>
      </figcaption>
    </figure>
  );
}
