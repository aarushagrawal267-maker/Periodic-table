import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, CalendarDays, Clock, Flame, Play, Target } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MiniTable } from '../components/MiniTable';
import { ShareButton, TrailSquares } from '../components/Results';
import { ELEMENTS } from '../lib/elements';
import { DAILY_SIZE, dailyElements, dailyNumber, todayKey } from '../lib/daily';
import { hashString, seeded, shuffle } from '../lib/random';
import { go } from '../lib/router';
import { formatTime } from '../lib/scoring';
import { liveStreak, masteredCount, useProgress, type RoundSummary } from '../store/progress';
import { Game } from './Game';

const ALL = ELEMENTS.map((e) => e.number);
/** Players with fewer mastered elements than this get Learner help on the daily. */
const HELP_UNTIL = 20;

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
  // Newer players get Learner help (atomic numbers and colour hints), since the daily reaches across the whole table.
  const helped = useProgress((s) => masteredCount(s.mastery) < HELP_UNTIL);
  const [difficulty] = useState<'learner' | 'standard'>(helped ? 'learner' : 'standard');

  // A daily that was started (first tile dropped) but never finished (left mid-round, tab closed) counts as the attempt.
  useEffect(() => {
    if (playing || result || daily.started !== key) return;
    recordRound({ kind: 'daily', dailyKey: key, difficulty: 'standard', score: 0, correct: 0, mistakes: 0, hints: 0, timeMs: 0, maxCombo: 0, stars: 0, completed: false, results: {}, trail: [] });
  }, [playing, result, daily.started, key, recordRound]);

  if (playing)
    return (
      <Game
        config={{ kind: 'daily', title: `Daily #${n}`, subtitle: `${DAILY_SIZE} elements across the table`, targets, view: ALL, difficulty, dailyKey: key, order }}
        onExit={() => setPlaying(false)}
        // Only a real move uses up the day's try. Peeking and backing out is free.
        onFirstMove={() => startDaily(key)}
        exitLabel="Back to daily"
      />
    );
  const summary: RoundSummary | null = result
    ? { kind: 'daily', dailyKey: key, difficulty: 'standard', score: result.score, correct: DAILY_SIZE, mistakes: result.mistakes, hints: 0, timeMs: result.timeMs, maxCombo: 0, stars: result.stars, completed: true, results: {}, trail: result.trail }
    : null;

  return (
    <div className="relative min-h-dvh">
      <div className="mx-auto max-w-3xl px-5 pb-16 pt-6">
        <button onClick={() => go('/')} className="btn-ghost grid h-10 w-10 place-items-center rounded-full" aria-label="Back to home">
          <ArrowLeft size={18} />
        </button>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-8 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-2">
            <CalendarDays size={15} /> {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 className="font-display mt-5 text-5xl font-semibold sm:text-6xl">
            Daily <span className="text-grad">#{n}</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-ink-2">
            {DAILY_SIZE} elements from all over the table, the same for everyone today. One attempt, and it only counts once you drop your first tile.
          </p>
          {helped && !result && <p className="mx-auto mt-2 max-w-md text-sm text-ink-3">Some will be new. You'll get atomic numbers and colour hints to help.</p>}
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="card mx-auto mt-10 max-w-xl p-6">
          <MiniTable highlight={result ? new Set(targets) : new Set()} className="w-full" color={(x) => (!result && targets.includes(x) ? 'var(--accent-2)' : undefined)} label="Today's elements on the table" />
          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <Stat icon={Target} label="Elements" value={String(DAILY_SIZE)} />
            <Stat icon={Flame} label="Streak" value={`${streak} day${streak === 1 ? '' : 's'}`} />
            <Stat icon={Clock} label="Next in" value={<Countdown />} />
          </div>
        </motion.div>

        <div className="mx-auto mt-8 max-w-xl">
          {summary && summary.stars === 0 ? (
            // Started but left before the end: the attempt counts, but there is no score to show or share.
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
              <p className="font-display text-2xl font-semibold">Attempt used today</p>
              <p className="mx-auto mt-2 max-w-sm text-ink-2">You left before the end, so there is no score this time. A fresh puzzle arrives at midnight.</p>
              <a href="#/play/full" className="btn-primary mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base">
                Practise the full table <ArrowRight size={18} aria-hidden />
              </a>
            </motion.div>
          ) : summary ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
              <p className="text-sm font-medium text-good">Completed today</p>
              <div className="font-display mt-1 text-4xl font-semibold tabular-nums">{summary.score.toLocaleString('en-US')} pts</div>
              <p className="mt-1 text-sm text-ink-2">
                {formatTime(summary.timeMs)} · {summary.mistakes} mistake{summary.mistakes === 1 ? '' : 's'}
              </p>
              <TrailSquares trail={summary.trail} animate={false} className="mt-4" />
              <div className="mt-6 flex">
                <ShareButton summary={summary} total={DAILY_SIZE} />
              </div>
              <a href="#/play/full" className="mt-4 inline-block text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                Keep practising with the full table →
              </a>
            </motion.div>
          ) : (
            <button
              onClick={() => setPlaying(true)}
              className="btn-primary shine flex h-16 w-full items-center justify-center gap-2 rounded-2xl text-lg">
              <Play size={20} className="fill-current" /> Start today's challenge
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: I, label, value }: { icon: typeof Flame; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface p-3">
      <I size={16} className="mx-auto text-ink-3" />
      <div className="font-display mt-1.5 text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-ink-3">{label}</div>
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
