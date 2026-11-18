import { motion } from 'motion/react';
import { ArrowRight, BrainCircuit, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DifficultyPicker } from '../components/DifficultyPicker';
import { MiniTable } from '../components/MiniTable';
import { REGIONS, regionById, type Region } from '../lib/regions';
import { go } from '../lib/router';
import { useProgress } from '../store/progress';
import { DIFFICULTIES, useSettings } from '../store/settings';
import { Game } from './Game';
import { Home } from './Home';

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
          <RegionCard key={r.id} region={r} index={i} />
        ))}
        <motion.a
          href="#/life"
          className="card group flex flex-col justify-between overflow-hidden p-6 transition-colors hover:bg-surface-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: REGIONS.length * 0.04 }}
        >
          <div className="flex gap-1.5 text-3xl" aria-hidden>
            <span>📱</span>
            <span>🎆</span>
            <span>🦴</span>
          </div>
          <div className="mt-6">
            <h2 className="font-display text-xl font-semibold">In Real Life</h2>
            <p className="mt-1 text-sm text-ink-2">Spot the elements inside phones, fireworks, bananas and your own bones.</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent-3">
              Play <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </motion.a>
        <motion.a
          href="#/quiz"
          className="card group flex flex-col justify-between overflow-hidden p-6 transition-colors hover:bg-surface-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: REGIONS.length * 0.04 }}
        >
          <div className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: 'color-mix(in oklab, var(--accent) 18%, transparent)', color: 'var(--accent)' }}>
            <BrainCircuit size={24} />
          </div>
          <div className="mt-6">
            <h2 className="font-display text-xl font-semibold">Quick Quiz</h2>
            <p className="mt-1 text-sm text-ink-2">Ten rapid questions, tuned to the elements you find hardest.</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent">
              Start quiz <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </motion.a>
      </div>
    </div>
  );
}

function RegionCard({ region: r, index }: { region: Region; index: number }) {
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
      className="card group relative flex flex-col overflow-hidden p-6 transition-[background,transform] duration-300 hover:-translate-y-0.5 hover:bg-surface-2"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-25 blur-3xl transition-opacity group-hover:opacity-40" style={{ background: r.accent }} />
      <MiniTable highlight={set} className="relative w-full" label={`${r.name} highlighted on the periodic table`} />
      <div className="relative mt-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">{r.name}</h2>
          <p className="mt-1 text-sm text-ink-2">{r.tagline}</p>
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
      onReplay={() => setRound((r) => r + 1)}
      onNext={next ? () => go(`/play/${next.id}`, true) : undefined}
      nextLabel={next ? `Next: ${next.name}` : undefined}
    />
  );
}
