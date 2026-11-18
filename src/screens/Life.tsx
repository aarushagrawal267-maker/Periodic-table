import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ElementTile } from '../components/ElementTile';
import { Results } from '../components/Results';
import { AnimatedNumber } from '../components/Stats';
import { buildLifeRound, el, LIFE_LENGTH } from '../lib/everyday';
import { catVar } from '../lib/elements';
import { haptic, sfx } from '../lib/feedback';
import { go } from '../lib/router';
import { stars } from '../lib/scoring';
import { useProgress, type RoundOutcome, type RoundSummary } from '../store/progress';
import { useSettings } from '../store/settings';
import { announceAchievements, useUi } from '../store/ui';

export function Life() {
  const [round, setRound] = useState(0);
  return <LifeRound key={round} onReplay={() => setRound((r) => r + 1)} />;
}

function LifeRound({ onReplay }: { onReplay: () => void }) {
  const questions = useMemo(buildLifeRound, []);
  const difficulty = useSettings((s) => s.difficulty);
  const recordRound = useProgress((s) => s.recordRound);
  const openDetail = useUi((s) => s.openDetail);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [perfect, setPerfect] = useState<boolean[]>([]);
  const [results, setResults] = useState<Record<number, boolean>>({});
  const [result, setResult] = useState<{ summary: RoundSummary; outcome: RoundOutcome } | null>(null);
  const startedAt = useRef(Date.now());

  const q = questions[index];
  const need = q.answer.size;

  const toggle = (n: number) => {
    if (checked) return;
    sfx.pick();
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(n)) next.delete(n);
      else if (next.size < need) next.add(n);
      return next;
    });
  };

  const check = () => {
    const hits = [...picked].filter((n) => q.answer.has(n)).length;
    const ok = hits === need;
    setChecked(true);
    setScore((s) => s + hits * 60 + (ok ? 80 : 0));
    setPerfect((p) => [...p, ok]);
    setResults((r) => {
      const next = { ...r };
      for (const n of q.answer) next[n] = (next[n] ?? true) && picked.has(n);
      return next;
    });
    if (ok) {
      sfx.hit(perfect.filter(Boolean).length);
      haptic(12);
    } else {
      sfx.miss();
      haptic([30, 40, 30]);
    }
  };

  const next = () => {
    if (index + 1 < questions.length) {
      setIndex((i) => i + 1);
      setPicked(new Set());
      setChecked(false);
      return;
    }
    const correct = perfect.filter(Boolean).length;
    const summary: RoundSummary = {
      kind: 'life',
      difficulty,
      score,
      correct,
      mistakes: LIFE_LENGTH - correct,
      hints: 0,
      timeMs: Date.now() - startedAt.current,
      maxCombo: 0,
      stars: stars(correct / LIFE_LENGTH, true),
      completed: true,
      results,
      trail: perfect.map((p) => (p ? 'hit' : 'miss')),
    };
    const outcome = recordRound(summary);
    if (summary.stars === 3) sfx.win();
    announceAchievements(outcome.unlocked);
    setResult({ summary, outcome });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-8 pt-4">
      <header className="flex items-center gap-3">
        <button onClick={() => go('/play')} className="btn-ghost grid h-10 w-10 shrink-0 place-items-center rounded-full" aria-label="Leave">
          <ArrowLeft size={18} />
        </button>
        <div className="flex flex-1 gap-1" aria-label={`Object ${index + 1} of ${LIFE_LENGTH}`}>
          {questions.map((_, i) => (
            <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: perfect[i] === undefined ? (i === index ? 'var(--ink-2)' : 'var(--line-strong)') : perfect[i] ? 'var(--good)' : 'var(--gold)' }} />
          ))}
        </div>
        <div className="font-display w-16 text-right text-lg font-semibold">
          <AnimatedNumber value={score} />
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.main key={index} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ type: 'spring', damping: 24, stiffness: 260 }} className="flex flex-1 flex-col justify-center py-6">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-accent-2">In real life</p>
          <motion.div className="mx-auto mt-4 grid h-32 w-32 place-items-center rounded-[36px] text-7xl" style={{ background: 'radial-gradient(circle at 30% 20%, var(--surface-2), var(--surface))', border: '1px solid var(--line)' }} initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', damping: 10, stiffness: 180 }} aria-hidden>
            {q.thing.emoji}
          </motion.div>
          <h1 className="font-display mt-5 text-center text-3xl font-semibold">{q.thing.name}</h1>
          <p className="mt-1 text-center text-ink-2">
            Which {need === 1 ? 'element is' : `${need} elements are`} the key {need === 1 ? 'ingredient' : 'ingredients'}?
          </p>

          <div className="mt-7 grid grid-cols-4 gap-2.5 sm:gap-3" role="group" aria-label="Elements to choose from">
            {q.options.map((e) => {
              const on = picked.has(e.number);
              const right = q.answer.has(e.number);
              const state = !checked ? (on ? 'on' : 'idle') : right ? (on ? 'right' : 'missed') : on ? 'wrong' : 'dim';
              return (
                <motion.button
                  key={e.number}
                  onClick={() => toggle(e.number)}
                  aria-pressed={on}
                  aria-label={`${e.name}${checked ? (right ? ', correct' : on ? ', not in it' : '') : ''}`}
                  whileTap={{ scale: 0.94 }}
                  animate={state === 'wrong' ? { x: [0, -6, 6, -4, 4, 0] } : state === 'right' ? { scale: [1, 1.08, 1] } : { scale: on ? 1.04 : 1 }}
                  className="relative aspect-square rounded-2xl"
                  style={{
                    opacity: state === 'dim' ? 0.35 : 1,
                    outline: state === 'on' ? '2px solid var(--accent-2)' : state === 'right' ? '2px solid var(--good)' : state === 'missed' ? '2px dashed var(--good)' : state === 'wrong' ? '2px solid var(--bad)' : 'none',
                    outlineOffset: 3,
                  }}
                >
                  <ElementTile element={e} size={88} showNumber={false} color={difficulty === 'learner' ? undefined : 'var(--accent-2)'} />
                  {checked && (right || on) && (
                    <span className={`absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-bg ${right ? 'bg-good' : 'bg-bad'} text-bg`}>{right ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}</span>
                  )}
                </motion.button>
              );
            })}
          </div>

          <div className="mt-6 min-h-24" aria-live="polite">
            {checked ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-line bg-surface p-4">
                <div className="mb-2 text-sm font-semibold" style={{ color: perfect[index] ? 'var(--good)' : 'var(--gold)' }}>
                  {perfect[index] ? 'Spot on!' : 'Close! Here is what is inside:'}
                </div>
                <ul className="space-y-2">
                  {q.thing.contains.map(([s, why]) => {
                    const e = el(s);
                    return (
                      <li key={s} className="flex items-start gap-3 text-sm">
                        <button onClick={() => openDetail(e.number)} className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold" style={{ background: `color-mix(in oklab, ${catVar(e.category)} 18%, transparent)`, color: catVar(e.category) }} aria-label={`Open ${e.name}`}>
                          {e.symbol}
                        </button>
                        <span className="text-ink-2">
                          <b className="text-ink">{e.name}.</b> {why}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </motion.div>
            ) : (
              <p className="text-center text-sm text-ink-3">
                {picked.size}/{need} picked
              </p>
            )}
          </div>

          <div className="mt-4">
            {checked ? (
              <button onClick={next} className="btn-primary flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base">
                {index + 1 < questions.length ? 'Next object' : 'See results'} <ArrowRight size={18} />
              </button>
            ) : (
              <button onClick={check} disabled={picked.size !== need} className="btn-primary flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base disabled:opacity-40 disabled:shadow-none">
                Check
              </button>
            )}
          </div>
        </motion.main>
      </AnimatePresence>

      {result && <Results summary={result.summary} outcome={result.outcome} title="In Real Life" total={LIFE_LENGTH} onReplay={onReplay} onExit={() => go('/')} />}
    </div>
  );
}
