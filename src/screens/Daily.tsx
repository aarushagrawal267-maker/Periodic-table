import { motion } from 'motion/react';
import { ArrowLeft, CalendarDays, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MiniTable } from '../components/MiniTable';
import { ShareButton } from '../components/Results';
import { ELEMENTS } from '../lib/elements';
import { DAILY_SIZE, dailyElements, dailyNumber, todayKey } from '../lib/daily';
import { hashString, seeded, shuffle } from '../lib/random';
import { go } from '../lib/router';
import { formatTime } from '../lib/scoring';
import { liveStreak, useProgress, type RoundSummary } from '../store/progress';
import { Game } from './Game';

const ALL = ELEMENTS.map((e) => e.number);

export function Daily() {
  const key = todayKey();
  const result = useProgress((s) => s.daily.results[key]);
  const daily = useProgress((s) => s.daily);
  const [playing, setPlaying] = useState(false);
  const targets = useMemo(() => dailyElements(key), [key]);
  const order = useMemo(() => shuffle(targets, seeded(hashString('order:' + key))), [targets, key]);
  const n = dailyNumber(key);
  const streak = liveStreak(daily, key);
  const startDaily = useProgress((s) => s.startDaily);
  const recordRound = useProgress((s) => s.recordRound);

  // A daily that was started but never finished (left mid-round, tab closed) counts as the attempt.
  useEffect(() => {
    if (playing || result || daily.started !== key) return;
    recordRound({ kind: 'daily', dailyKey: key, difficulty: 'standard', score: 0, correct: 0, mistakes: 0, hints: 0, timeMs: 0, maxCombo: 0, stars: 0, completed: false, results: {}, trail: [] });
  }, [playing, result, daily.started, key, recordRound]);

  if (playing)
    return (
      <Game
        config={{ kind: 'daily', title: `Daily #${n}`, subtitle: `${DAILY_SIZE} elements across the table`, targets, view: ALL, difficulty: 'standard', dailyKey: key, order }}
        onExit={() => setPlaying(false)}
      />
    );
  const summary: RoundSummary | null = result
    ? { kind: 'daily', dailyKey: key, difficulty: 'standard', score: result.score, correct: DAILY_SIZE, mistakes: result.mistakes, hints: 0, timeMs: result.timeMs, maxCombo: 0, stars: result.stars, completed: true, results: {}, trail: result.trail }
    : null;

  return (
    <div className="relative min-h-dvh">
      <div className="mx-auto max-w-3xl px-5 pb-16 pt-6">
        <button onClick={() => go('/')} className="btn-ghost grid h-10 w-10 place-items-center rounded-[10px]" aria-label="Back to home">
          <ArrowLeft size={18} strokeWidth={1.75} />
        </button>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="mt-8 text-center">
          <div className="mx-auto inline-flex items-center gap-2 text-sm text-ink-2">
            <CalendarDays size={16} strokeWidth={1.75} className="text-ink-3" /> {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 className="font-display mt-5 text-5xl font-medium sm:text-6xl">
            Daily #{n}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-ink-2">
            {DAILY_SIZE} elements scattered across the whole table. Same puzzle for everyone, every day. One attempt.
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.06 }} className="card mx-auto mt-10 max-w-xl p-6">
          <MiniTable highlight={result ? new Set(targets) : new Set()} className="w-full" color={(x) => (!result && targets.includes(x) ? 'var(--accent)' : undefined)} label="Today's elements on the table" />
          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <Stat label="Elements" value={String(DAILY_SIZE)} />
            <Stat label="Streak" value={`${streak} day${streak === 1 ? '' : 's'}`} />
            <Stat label="Next in" value={<Countdown />} />
          </div>
        </motion.div>

        <div className="mx-auto mt-8 max-w-xl">
          {summary ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
              <p className={`text-sm font-medium ${summary.stars ? 'text-good' : 'text-ink-3'}`}>{summary.stars ? 'Completed today' : 'Attempt used today. A fresh one arrives at midnight.'}</p>
              <div className="font-display mt-1 text-4xl font-medium tabular-nums">{summary.score.toLocaleString('en-US')} pts</div>
              <p className="mt-1 text-sm text-ink-2">
                {formatTime(summary.timeMs)} · {summary.mistakes} mistake{summary.mistakes === 1 ? '' : 's'}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {summary.trail.map((t, i) => (
                  <span key={i} className="h-6 w-6 rounded-md" style={{ background: t === 'hit' ? 'var(--good)' : t === 'hint' ? 'var(--gold)' : 'var(--bad)' }} />
                ))}
              </div>
              <div className="mt-6 flex">
                <ShareButton summary={summary} total={DAILY_SIZE} />
              </div>
              <a href="#/play/full" className="mt-4 inline-block text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                Keep practising with the full table
              </a>
            </motion.div>
          ) : (
            <button
              onClick={() => {
                startDaily(key);
                setPlaying(true);
              }}
              className="btn-primary flex h-12 w-full items-center justify-center gap-2 rounded-[10px] text-base">
              <Play size={16} strokeWidth={1.75} /> Start today's challenge
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="font-display whitespace-nowrap text-base font-medium tabular-nums sm:text-lg">{value}</div>
      <div className="text-xs text-ink-3">{label}</div>
    </div>
  );
}

export function Countdown() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const d = new Date(now);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const s = Math.max(0, Math.floor((midnight - now) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (
    <span>
      {h}h {String(m).padStart(2, '0')}m
    </span>
  );
}
