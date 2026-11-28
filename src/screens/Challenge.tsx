import { ArrowLeft, Lock, Star, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DifficultyPicker } from '../components/DifficultyPicker';
import { MiniTable } from '../components/MiniTable';
import { CHALLENGE_LEVELS, challengeBest, challengeCleared, challengeLevelById, challengeUnlocked, type ChallengeLevel } from '../lib/challenge';
import { go } from '../lib/router';
import { formatTime } from '../lib/scoring';
import { useProgress } from '../store/progress';
import { DIFFICULTIES, useSettings } from '../store/settings';
import { Game } from './Game';

/** The Timed Challenge page: six levels against the clock, each opening once the one before it is cleared. */
export function ChallengeHub() {
  const best = useProgress((s) => s.best);
  const last = CHALLENGE_LEVELS[CHALLENGE_LEVELS.length - 1];
  const master = challengeCleared(best, last.id);
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <a href="#/play" className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={16} strokeWidth={1.5} aria-hidden /> Play
      </a>
      <header className="mt-2 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="label flex items-center gap-2">
            <Timer size={14} strokeWidth={1.5} aria-hidden /> Timed challenge
          </p>
          <h1 className="t-title mt-2">Beat the clock</h1>
          <p className="mt-3 max-w-xl text-ink-2">
            Six levels. Each adds more elements and gives you less time for each one. Clear a level to open the next, and place all 118 to become a master of the periodic table. Pause whenever you need to.
          </p>
        </div>
        <DifficultyPicker />
      </header>

      {master && (
        <div className="card mt-8 flex items-center gap-4 p-4 sm:p-6" style={{ borderColor: 'var(--star-line)' }}>
          <Star size={28} strokeWidth={1.5} aria-hidden style={{ fill: 'var(--star)', color: 'var(--star-line)' }} />
          <div>
            <h2 className="text-base font-medium leading-6">Master of the periodic table</h2>
            <p className="mt-1 text-sm leading-5 text-ink-2">You placed all 118 elements against the clock.</p>
          </div>
        </div>
      )}

      <ol className="mt-8 grid auto-rows-fr gap-3 md:gap-4 lg:grid-cols-2" aria-label="Levels">
        {CHALLENGE_LEVELS.map((l) => (
          <li key={l.id}>
            <LevelRow level={l} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function LevelRow({ level: l }: { level: ChallengeLevel }) {
  const difficulty = useSettings((s) => s.difficulty);
  const best = useProgress((s) => s.best);
  const set = useMemo(() => new Set(l.numbers), [l.numbers]);
  const open = challengeUnlocked(best, l);
  const b = challengeBest(best, l.id, difficulty);
  const body = (
    <>
      <MiniTable highlight={set} className={`w-24 shrink-0 sm:w-28 ${open ? '' : 'opacity-40 grayscale'}`} label={`Level ${l.level}: elements 1 to ${l.numbers.length} highlighted`} />
      <div className="min-w-0 flex-1">
        <p className="meta">Level {l.level}</p>
        <h2 className={`mt-1 text-base font-medium leading-6 ${open ? '' : 'text-ink-2'}`}>{l.title}</h2>
        <p className="mt-1 text-sm leading-5 text-ink-2">
          {l.numbers.length} elements, {l.secondsPerElement} s each · <span className="whitespace-nowrap">{formatTime(l.timeLimitMs)} in total</span>
        </p>
        <div className="mt-3">
          {open ? (
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-0.5" role="img" aria-label={b ? `${b.stars} stars, best ${b.score}` : 'Not cleared on this difficulty'}>
                {[0, 1, 2].map((i) => {
                  const on = !!b && i < b.stars;
                  return <Star key={i} size={16} strokeWidth={1.5} aria-hidden style={on ? { fill: 'var(--star)', color: 'var(--star-line)' } : { fill: 'var(--surface-2)', color: 'var(--ink-3)' }} />;
                })}
              </span>
              {b && <span className="num text-sm text-ink-2">{b.score.toLocaleString('en-US')}</span>}
            </span>
          ) : (
            <span className="meta flex items-center gap-1.5">
              <Lock size={12} strokeWidth={1.5} aria-hidden /> Clear level {l.level - 1} to unlock
            </span>
          )}
        </div>
      </div>
    </>
  );
  return open ? (
    <a href={`#/challenge/${l.id}`} className="card card-link flex h-full items-center gap-3 p-4 sm:gap-4">
      {body}
    </a>
  ) : (
    <div className="card flex h-full items-center gap-3 border-dashed p-4 sm:gap-4" aria-disabled="true">
      {body}
    </div>
  );
}

/** One level of the Timed Challenge. App only renders this for a level that exists and is unlocked. */
export function ChallengeGame({ levelId }: { levelId: string }) {
  const level = challengeLevelById(levelId)!;
  const difficulty = useSettings((s) => s.difficulty);
  const [round, setRound] = useState(0);
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
      exitLabel="All levels"
      onReplay={() => setRound((r) => r + 1)}
      onNext={next ? () => go(`/challenge/${next.id}`, true) : undefined}
      nextLabel={next ? `Next: level ${next.level}` : undefined}
      finale={
        next
          ? { kind: 'level', headline: `Level ${level.level} complete`, message: `Level ${next.level} is open: ${next.numbers.length} elements, ${next.secondsPerElement} seconds each.` }
          : { kind: 'master', headline: 'Master of the periodic table', message: "You've placed all 118 elements against the clock. You are a chemistry wizard." }
      }
    />
  );
}
