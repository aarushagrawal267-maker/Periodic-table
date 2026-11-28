import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import { useEffect, type CSSProperties } from 'react';
import { ELEMENTS, byNumber, catVar, categoryLabel, formatNumber, type Element } from '../lib/elements';
import { shells } from '../lib/shells';
import { useProgress } from '../store/progress';
import { announceAchievements, useUi } from '../store/ui';
import { Sheet } from './Sheet';
import { ElementTile } from './ElementTile';

export function ElementDetailSheet() {
  const detail = useUi((s) => s.detail);
  const openDetail = useUi((s) => s.openDetail);
  const markExplored = useProgress((s) => s.markExplored);

  useEffect(() => {
    if (detail) announceAchievements(markExplored(detail));
  }, [detail, markExplored]);

  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') openDetail(detail === 118 ? 1 : detail + 1);
      if (e.key === 'ArrowLeft') openDetail(detail === 1 ? 118 : detail - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail, openDetail]);

  const e = detail ? byNumber(detail) : null;
  return (
    <Sheet open={!!e} onClose={() => openDetail(null)} label={e ? `${e.name} details` : 'Element details'} wide>
      {e && <ElementDetail key={e.number} e={e} />}
    </Sheet>
  );
}

function ElementDetail({ e }: { e: Element }) {
  const openDetail = useUi((s) => s.openDetail);
  const m = useProgress((s) => s.mastery[e.number]);
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
    <article style={{ '--c': c } as CSSProperties}>
      <header className="relative overflow-hidden px-6 pb-6 pt-8 sm:px-8">
        <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <motion.div
            className="h-32 w-32 shrink-0 sm:h-36 sm:w-36"
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <ElementTile element={e} size={144} showName={false} />
          </motion.div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <span
              className="cat-chip inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
              {categoryLabel(e.category)}
            </span>
            <h2 className="font-display mt-2 text-4xl font-medium sm:text-5xl">{e.name}</h2>
            <p className="mt-1 text-sm text-ink-2">
              Element {e.number} · <span className="font-mono">{e.config}</span>
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
            <div className="rounded-xl border p-4" style={{ borderColor: `color-mix(in oklab, ${c} 30%, transparent)`, background: `color-mix(in oklab, ${c} 7%, transparent)` }}>
              <div className="cat-ink mb-2 flex items-center gap-2 text-xs font-medium">
                <Lightbulb size={14} /> Did you know?
              </div>
              <p className="text-[15px] leading-relaxed">{e.fact}</p>
            </div>
          )}
          <div>
            <h3 className="mb-2 text-xs font-medium text-ink-3">Where you'll find it</h3>
            <ul className="flex flex-wrap gap-2">
              {e.uses.map((u) => (
                <li key={u} className="rounded-md border border-line bg-surface px-3 py-1 text-sm">
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
            <dt className="text-xs text-ink-3">{k}</dt>
            <dd className="mt-0.5 font-display text-base font-medium tabular-nums">
              {v} {unit && <span className="text-xs font-normal text-ink-3">{unit}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <nav className="flex items-center justify-between px-4 py-4 sm:px-6" aria-label="Neighbouring elements">
        <NeighbourButton n={e.number === 1 ? 118 : e.number - 1} dir="prev" onClick={openDetail} />
        <span className="hidden items-center gap-1 text-xs text-ink-3 sm:flex">
          Use <kbd className="rounded border border-line bg-surface-2 px-1.5 font-sans text-[11px]">←</kbd> <kbd className="rounded border border-line bg-surface-2 px-1.5 font-sans text-[11px]">→</kbd> to browse
        </span>
        <NeighbourButton n={e.number === 118 ? 1 : e.number + 1} dir="next" onClick={openDetail} />
      </nav>
      <p className="px-6 pb-6 text-[11px] text-ink-3 sm:px-8">Property data: PubChem (NCBI). Values for superheavy elements are predictions or estimates.</p>
    </article>
  );
}

function NeighbourButton({ n, dir, onClick }: { n: number; dir: 'prev' | 'next'; onClick: (n: number) => void }) {
  const e = ELEMENTS[n - 1];
  return (
    <button onClick={() => onClick(n)} className="btn-ghost flex items-center gap-2 rounded-[10px] py-2 pl-3 pr-4 text-sm" aria-label={`${dir === 'prev' ? 'Previous' : 'Next'}: ${e.name}`}>
      {dir === 'prev' && <ChevronLeft size={16} />}
      <span className="cat-ink font-display font-medium" style={{ '--c': catVar(e.category) } as CSSProperties}>
        {e.symbol}
      </span>
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
        <circle cx={center} cy={center} r={8} fill="var(--c)" />
        {sh.map((count, i) => {
          const r = 14 + step * (i + 1) - step / 3;
          return (
            <g key={i}>
              <circle cx={center} cy={center} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={1} />
              <g>
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
        Shells <span className="whitespace-nowrap font-mono text-ink-2">{sh.join(' · ')}</span>
      </figcaption>
    </figure>
  );
}
