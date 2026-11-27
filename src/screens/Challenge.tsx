import { motion } from 'motion/react';
import { ArrowRight, Lock, Star, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DifficultyPicker } from '../components/DifficultyPicker';
import { MiniTable } from '../components/MiniTable';
import { CHALLENGE_LEVELS, challengeBest, challengeCleared, challengeLevelById, challengeUnlocked, type ChallengeLevel } from '../lib/challenge';
import { go } from '../lib/router';
import { formatTime } from '../lib/scoring';
import { useProgress } from '../store/progress';
import { DIFFICULTIES, useSettings } from '../store/settings';
import { Game } from './Game';

export function ChallengeHub() {
  const best = useProgress((s) => s.best);
  const last = CHALLENGE_LEVELS[CHALLENGE_LEVELS.length - 1];
  const master = challengeCleared(best, last.id);
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <a href="#/play" className="text-sm font-medium text-ink-3 hover:text-ink">
        ← All modes
      </a>
      <div className="mt-3 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-accent-2">
            <Timer size={15} /> Timed Challenge
          </p>
          <h1 className="font-display mt-1 text-4xl font-semibold sm:text-5xl">Beat the clock</h1>
          <p className="mt-2 max-w-xl text-ink-2">
            Six levels. Each one adds more elements and gives you less time for each. Clear a level to open the next, and place all 118 to become a Master of the Periodic Table. You can pause at any time.
          </p>
        </div>
        <DifficultyPicker />
      </div>
      {master && (
        <motion.div
          className="card mt-8 flex items-center gap-4 p-5"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ borderColor: 'color-mix(in oklab, var(--gold) 45%, transparent)' }}
        >
          <span className="text-4xl" aria-hidden>
            🏆
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold">Master of the Periodic Table</h2>
            <p className="text-sm text-ink-2">You placed all 118 elements against the clock. You are a chemistry wizard!</p>
          </div>
        </motion.div>
      )}
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CHALLENGE_LEVELS.map((l, i) => (
          <LevelCard key={l.id} level={l} index={i} />
        ))}
      </div>
    </div>
  );
}

function LevelCard({ level: l, index }: { level: ChallengeLevel; index: number }) {
  const difficulty = useSettings((s) => s.difficulty);
  const best = useProgress((s) => s.best);
  const set = useMemo(() => new Set(l.numbers), [l.numbers]);
  const open = challengeUnlocked(best, l);
  const b = challengeBest(best, l.id, difficulty);
  const body = (
    <>
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-25 blur-3xl transition-opacity group-hover:opacity-40" style={{ background: 'var(--accent-2)' }} />
      <MiniTable highlight={set} className={`relative w-full ${open ? '' : 'opacity-40'}`} label={`Level ${l.level}: elements 1 to ${l.numbers.length} highlighted`} />
      <div className="relative mt-5 flex flex-1 items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">Level {l.level}</p>
          <h2 className="font-display mt-0.5 text-xl font-semibold">{l.title}</h2>
          <p className="mt-1 text-sm text-ink-2">
            {l.numbers.length} elements · {l.secondsPerElement} s each · {formatTime(l.timeLimitMs)} in total
          </p>
        </div>
        {open ? (
          <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs font-medium tabular-nums text-ink-2">{l.numbers.length}</span>
        ) : (
          <Lock size={18} className="shrink-0 text-ink-3" aria-hidden />
        )}
      </div>
      <div className="relative mt-5 flex items-center justify-between border-t border-line pt-4 text-sm">
        {open ? (
          <>
            <div className="flex items-center gap-1" aria-label={b ? `${b.stars} stars, best ${b.score}` : 'Not cleared on this difficulty'}>
              {[0, 1, 2].map((i) => (
                <Star key={i} size={16} className={b && i < b.stars ? 'fill-gold text-gold' : 'text-line-strong'} />
              ))}
              {b && <span className="ml-2 tabular-nums text-ink-2">{b.score.toLocaleString('en-US')}</span>}
            </div>
            <span className="inline-flex items-center gap-1 font-semibold text-accent-2">
              Play <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </span>
          </>
        ) : (
          <span className="text-xs text-ink-3">Clear level {l.level - 1} to unlock</span>
        )}
      </div>
    </>
  );
  const motionProps = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay: index * 0.04 } };
  return open ? (
    <motion.a href={`#/challenge/${l.id}`} className="card card-hover group relative flex flex-col overflow-hidden p-6" {...motionProps}>
      {body}
    </motion.a>
  ) : (
    <motion.div className="card relative flex flex-col overflow-hidden p-6" aria-disabled="true" {...motionProps}>
      {body}
    </motion.div>
  );
}

export function ChallengeGame({ levelId }: { levelId: string }) {
  const level = challengeLevelById(levelId);
  const difficulty = useSettings((s) => s.difficulty);
  const best = useProgress((s) => s.best);
  const [round, setRound] = useState(0);
  if (!level || !challengeUnlocked(best, level)) return <ChallengeHub />;
  const next = CHALLENGE_LEVELS[level.level];
  const diffName = DIFFICULTIES.find((d) => d.id === difficulty)!.name;
  return (
    <Game
      key={`${level.id}-${round}-${difficulty}`}
      config={{
        kind: 'challenge',
        title: `Level ${level.level}: ${level.title}`,
        subtitle: `${level.numbers.length} elements · ${formatTime(level.timeLimitMs)} · ${diffName}`,
        targets: level.numbers,
        difficulty,
        regionId: level.id,
        timeLimitMs: level.timeLimitMs,
      }}
      onExit={() => go('/challenge')}
      onReplay={() => setRound((r) => r + 1)}
      onNext={next ? () => go(`/challenge/${next.id}`, true) : undefined}
      nextLabel={next ? `Next: Level ${next.level}` : undefined}
      finale={
        next
          ? { headline: `Level ${level.level} complete!`, message: `You mastered the elements of this level. Level ${next.level} is open: ${next.numbers.length} elements, ${next.secondsPerElement} seconds each.` }
          : { headline: 'Master of the Periodic Table!', message: "You've placed all 118 elements against the clock. You are a chemistry wizard! 🏆" }
      }
    />
  );
}
