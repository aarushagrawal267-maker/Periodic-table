import { motion } from 'motion/react';
import { ArrowRight, BrainCircuit, Star } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { DifficultyPicker } from '../components/DifficultyPicker';
import { ElementTile } from '../components/ElementTile';
import { MiniTable } from '../components/MiniTable';
import { bySymbol, catVar } from '../lib/elements';
import { REGIONS, regionById, type Region } from '../lib/regions';
import { go } from '../lib/router';
import { useProgress } from '../store/progress';
import { DIFFICULTIES, useSettings } from '../store/settings';
import { Game } from './Game';
import { Home } from './Home';

/** Decorative art for the mode cards: real objects with the element that makes them work. */
const LIFE_ART: [string, string][] = [
  ['📱', 'Li'],
  ['🎆', 'Sr'],
  ['🍌', 'K'],
  ['🦴', 'Ca'],
];
const QUIZ_ART = ['Au', 'Ne', 'Fe'];
const MATCH_ART = ['Fe', '?', 'Iron', '?'];

export function PlayHub() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-accent-2">Place mode</p>
          <h1 className="font-display mt-1 text-4xl font-semibold sm:text-5xl">Choose a region</h1>
          <p className="mt-2 max-w-xl text-ink-2">Each region is a self-contained puzzle. Clear it, then raise the difficulty — or take on all 118 at once.</p>
        </div>
        <DifficultyPicker />
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REGIONS.map((r, i) => (
          <RegionCard key={r.id} region={r} index={i} wide={i === REGIONS.length - 1 && REGIONS.length % 3 === 1} />
        ))}
      </div>

      <div className="mt-16 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">More ways to play</h2>
          <p className="mt-1 text-ink-2">Quick rounds for when you have five minutes.</p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <motion.a
          href="#/match"
          className="card card-hover group relative flex flex-col overflow-hidden p-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: REGIONS.length * 0.04 }}
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-25 blur-3xl transition-opacity group-hover:opacity-40" style={{ background: 'var(--accent-2)' }} />
          <div className="relative grid aspect-[207/107] w-full grid-cols-4 items-center gap-2.5" aria-hidden>
            {MATCH_ART.map((face, i) => {
              const up = face !== '?';
              const e = bySymbol.get('fe')!;
              return (
                <div
                  key={i}
                  className={`font-display grid aspect-[4/5] place-items-center rounded-2xl border text-center font-bold transition-transform duration-500 ${up ? 'tile' : 'border-line text-ink-3'} ${i % 2 ? 'group-hover:-translate-y-1' : 'group-hover:translate-y-1'}`}
                  style={up ? ({ '--c': catVar(e.category) } as CSSProperties) : { background: 'repeating-linear-gradient(135deg, var(--surface-2) 0 6px, var(--surface) 6px 12px)' }}
                >
                  <span className={face.length > 2 ? 'text-xs sm:text-sm' : 'text-2xl'}>{face}</span>
                </div>
              );
            })}
          </div>
          <div className="relative mt-5 flex flex-1 flex-col">
            <h2 className="font-display text-xl font-semibold">Match Pairs</h2>
            <p className="mt-1 text-sm text-ink-2">A relaxed memory game: flip cards and pair each symbol with its name.</p>
            <span className="mt-auto inline-flex items-center gap-1 border-t border-line pt-4 text-sm font-semibold text-accent-2">
              Play <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </motion.a>
        <motion.a
          href="#/life"
          className="card card-hover group relative flex flex-col overflow-hidden p-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: REGIONS.length * 0.04 }}
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-25 blur-3xl transition-opacity group-hover:opacity-40" style={{ background: 'var(--accent-3)' }} />
          <div className="relative grid aspect-[207/107] w-full grid-cols-4 items-center gap-3" aria-hidden>
            {LIFE_ART.map(([emoji, sym], i) => {
              const e = bySymbol.get(sym.toLowerCase())!;
              return (
                <div key={sym} className="relative grid aspect-square place-items-center rounded-2xl border border-line text-3xl transition-transform duration-500 group-hover:-translate-y-1 sm:text-4xl" style={{ background: 'radial-gradient(circle at 30% 20%, var(--surface-2), var(--surface))', rotate: `${(i - 1.5) * 4}deg`, transitionDelay: `${i * 40}ms` }}>
                  {emoji}
                  <span className="cat-chip absolute -bottom-2 -right-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold shadow-sm" style={{ '--c': catVar(e.category) } as CSSProperties}>
                    {e.symbol}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="relative mt-5 flex flex-1 flex-col">
            <h2 className="font-display text-xl font-semibold">In Real Life</h2>
            <p className="mt-1 text-sm text-ink-2">Spot the elements inside phones, fireworks, bananas and your own bones.</p>
            <span className="mt-auto inline-flex items-center gap-1 border-t border-line pt-4 text-sm font-semibold text-accent-3">
              Play <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </motion.a>
        <motion.a
          href="#/quiz"
          className="card card-hover group relative flex flex-col overflow-hidden p-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: REGIONS.length * 0.04 }}
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-25 blur-3xl transition-opacity group-hover:opacity-40" style={{ background: 'var(--accent)' }} />
          <div className="relative flex aspect-[207/107] w-full items-center justify-center" aria-hidden>
            {QUIZ_ART.map((sym, i) => (
              <div key={sym} className="-mx-2 h-[72px] w-[72px] transition-transform duration-500 sm:h-20 sm:w-20" style={{ transform: `rotate(${(i - 1) * 10}deg) translateY(${i === 1 ? -6 : 4}px)`, zIndex: i === 1 ? 0 : 1 }}>
                <ElementTile element={bySymbol.get(sym.toLowerCase())!} size={80} showName={false} />
              </div>
            ))}
            <div className="tile font-display absolute grid h-[76px] w-[76px] place-items-center rounded-[18px] text-4xl font-bold shadow-xl transition-transform duration-500 group-hover:-translate-y-1 group-hover:rotate-6 sm:h-[84px] sm:w-[84px]" style={{ '--c': 'var(--accent)', zIndex: 2 } as CSSProperties}>
              ?
            </div>
          </div>
          <div className="relative mt-5 flex flex-1 flex-col">
            <div className="flex items-center gap-2">
              <BrainCircuit size={18} className="text-accent" />
              <h2 className="font-display text-xl font-semibold">Quick Quiz</h2>
            </div>
            <p className="mt-1 text-sm text-ink-2">Ten rapid questions, tuned to the elements you find hardest.</p>
            <span className="mt-auto inline-flex items-center gap-1 border-t border-line pt-4 text-sm font-semibold text-accent">
              Start quiz <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </motion.a>
      </div>
    </div>
  );
}

function RegionCard({ region: r, index, wide = false }: { region: Region; index: number; wide?: boolean }) {
  const difficulty = useSettings((s) => s.difficulty);
  const best = useProgress((s) => s.best);
  const mastery = useProgress((s) => s.mastery);
  const set = useMemo(() => new Set(r.numbers), [r.numbers]);
  const b = best[`${r.id}:${difficulty}`];
  const known = r.numbers.filter((n) => (mastery[n]?.s ?? 0) >= 4).length;
  const cleared = DIFFICULTIES.filter((d) => best[`${r.id}:${d.id}`]).length;

  return (
    <motion.a
      href={`#/play/${r.id}`}
      className={`card card-hover group relative flex flex-col overflow-hidden p-6 ${wide ? 'sm:col-span-2 lg:col-span-3 lg:flex-row lg:items-center lg:gap-10 lg:p-8' : ''}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <div className={`pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-25 blur-3xl transition-opacity group-hover:opacity-40 ${wide ? 'lg:h-80 lg:w-80' : ''}`} style={{ background: r.accent }} />
      <MiniTable highlight={set} className={`relative w-full ${wide ? 'lg:w-[44%] lg:shrink-0' : ''}`} label={`${r.name} highlighted on the periodic table`} />
      <div className={wide ? 'relative flex flex-1 flex-col lg:self-stretch lg:justify-center' : 'contents'}>
      {wide && <p className="relative mt-5 text-xs font-semibold uppercase tracking-wider text-accent-2 lg:mt-0">The final boss</p>}
      <div className={`relative flex flex-1 items-start justify-between gap-3 ${wide ? 'mt-2 lg:flex-none' : 'mt-5'}`}>
        <div>
          <h2 className={`font-display font-semibold ${wide ? 'text-xl lg:text-3xl' : 'text-xl'}`}>{r.name}</h2>
          <p className={`mt-1 text-ink-2 ${wide ? 'text-sm lg:text-base' : 'text-sm'}`}>{r.tagline}</p>
        </div>
        <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs font-medium tabular-nums text-ink-2">{r.numbers.length}</span>
      </div>
      <div className="relative mt-5 flex items-center justify-between border-t border-line pt-4 text-sm">
        <div className="flex items-center gap-1" aria-label={b ? `${b.stars} stars, best ${b.score}` : 'Not cleared on this difficulty'}>
          {[0, 1, 2].map((i) => (
            <Star key={i} size={16} className={b && i < b.stars ? 'fill-gold text-gold' : 'text-line-strong'} />
          ))}
          {b && <span className="ml-2 tabular-nums text-ink-2">{b.score.toLocaleString('en-US')}</span>}
        </div>
        <span className="text-xs text-ink-3">
          {known}/{r.numbers.length} mastered{cleared > 0 && ` · ${cleared}/3 cleared`}
        </span>
      </div>
      </div>
    </motion.a>
  );
}

export function RegionGame({ regionId }: { regionId: string }) {
  const region = regionById(regionId);
  const difficulty = useSettings((s) => s.difficulty);
  const [round, setRound] = useState(0);
  if (!region) return <Home />;
  const idx = REGIONS.indexOf(region);
  const next = REGIONS[idx + 1];
  const diffName = DIFFICULTIES.find((d) => d.id === difficulty)!.name;
  return (
    <Game
      key={`${region.id}-${round}-${difficulty}`}
      config={{ kind: 'place', title: region.name, subtitle: `${region.numbers.length} elements · ${diffName}`, targets: region.numbers, difficulty, regionId: region.id }}
      onExit={() => go('/play')}
      exitLabel="All regions"
      onReplay={() => setRound((r) => r + 1)}
      onNext={next ? () => go(`/play/${next.id}`, true) : undefined}
      nextLabel={next ? `Next: ${next.name}` : undefined}
    />
  );
}
