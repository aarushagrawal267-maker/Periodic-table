import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { MiniTable } from '../components/MiniTable';
import { ShareButton, TrailSquares } from '../components/Results';
import { ELEMENTS } from '../lib/elements';
import { formatDate } from '../lib/date';
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
  const date = formatDate();

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-12 pt-4 sm:px-6 sm:pt-6">
      <button onClick={() => go('/')} className="icon-btn -ml-2" aria-label="Back to home">
        <ArrowLeft size={18} strokeWidth={1.5} />
      </button>

      <main className="grid flex-1 content-center gap-8 py-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-x-16 lg:gap-y-10">
        <header className="lg:col-start-1 lg:row-start-1 lg:self-end">
          <p className="label">{date}</p>
          <h1 className="t-display mt-3">
            Daily <span className="text-ink-3">#{n}</span>
          </h1>
          <p className="mt-4 max-w-md text-ink-2">
            {DAILY_SIZE} elements from all over the table, the same for everyone today. You get one attempt, and it only counts once you place your first tile.
          </p>
          {helped && !result && <p className="mt-2 max-w-md text-sm text-ink-3">Some will be new, so you get atomic numbers and colour hints</p>}
        </header>

        <div className="card p-5 sm:p-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
          <MiniTable highlight={result ? new Set(targets) : new Set()} className="w-full" color={(x) => (!result && targets.includes(x) ? 'var(--accent)' : undefined)} label="Today's elements on the table" />
          <dl className="mt-6 grid grid-cols-3 border-t border-line pt-4">
            <Fact label="Elements" value={String(DAILY_SIZE)} />
            <Fact label="Streak" value={`${streak} day${streak === 1 ? '' : 's'}`} />
            <Fact label="Next puzzle" value={<Countdown />} />
          </dl>
        </div>

        <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
          {summary && summary.stars === 0 ? (
            // Started but left before the end: the attempt counts, but there is no score to show or share.
            <div>
              <h2 className="t-heading">Attempt used today</h2>
              <p className="mt-1 max-w-md text-ink-2">You left before the end, so there is no score this time. A fresh puzzle arrives at midnight.</p>
              <a href="#/play/full" className="btn btn-lg btn-primary mt-6 w-full sm:w-auto">
                Practise the full table <ArrowRight size={18} strokeWidth={1.5} aria-hidden />
              </a>
            </div>
          ) : summary ? (
            <div>
              <p className="text-sm font-medium text-good">Completed today</p>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="num text-5xl font-medium leading-none">{summary.score.toLocaleString('en-US')}</span>
                <span className="meta text-sm">pts</span>
              </p>
              <p className="meta mt-3">
                {formatTime(summary.timeMs)} · {summary.mistakes} mistake{summary.mistakes === 1 ? '' : 's'}
              </p>
              <div className="mt-4 w-fit">
                <TrailSquares trail={summary.trail} animate={false} />
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <ShareButton summary={summary} total={DAILY_SIZE} />
                <a href="#/play/full" className="btn btn-lg btn-secondary">
                  Practise the full table
                </a>
              </div>
            </div>
          ) : (
            <button onClick={() => setPlaying(true)} className="btn btn-lg btn-primary w-full sm:w-auto">
              Start today's challenge <ArrowRight size={18} strokeWidth={1.5} aria-hidden />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-1 border-l border-line pl-4 first:border-l-0 first:pl-0">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="num text-xl font-medium">{value}</dd>
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
