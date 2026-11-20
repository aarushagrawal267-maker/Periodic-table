import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ElementChip, ElementTile, tileRadius } from '../components/ElementTile';
import { DUR, tween } from '../components/motion';
import { Results } from '../components/Results';
import { AnimatedNumber } from '../components/Stats';
import { buildLifeRound, el, LIFE_LENGTH } from '../lib/everyday';
import { haptic, sfx } from '../lib/feedback';
import { go } from '../lib/router';
import { stars } from '../lib/scoring';
import { useProgress, type RoundOutcome, type RoundSummary } from '../store/progress';
import { useSettings } from '../store/settings';
import { announceAchievements, useUi } from '../store/ui';

const TILE = 88;

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
  const recorded = useRef(false);

  const q = questions[index];
  const need = q.answer.size;
  const hits = [...picked].filter((n) => q.answer.has(n)).length;
  const verdict = perfect[index]
    ? { text: 'Correct', color: 'var(--good)' }
    : hits > 0
      ? { text: `Almost: ${hits} of ${need} found`, color: 'var(--ink)' }
      : { text: 'Not quite: here is what is inside', color: 'var(--bad)' };

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
    if (recorded.current) return;
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
    recorded.current = true;
    const outcome = recordRound(summary);
    if (summary.stars === 3) sfx.win();
    announceAchievements(outcome.unlocked);
    setResult({ summary, outcome });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-8 pt-2 sm:px-6">
      <header className="flex h-14 items-center gap-3">
        <button onClick={() => go('/play')} className="icon-btn -ml-2" aria-label="Leave">
          <ArrowLeft size={18} strokeWidth={1.5} />
        </button>
        <div className="flex flex-1 gap-1" role="progressbar" aria-label="Objects" aria-valuemin={1} aria-valuemax={LIFE_LENGTH} aria-valuenow={index + 1} aria-valuetext={`Object ${index + 1} of ${LIFE_LENGTH}`}>
          {questions.map((_, i) => (
            <span key={i} aria-hidden className="h-1 flex-1 rounded-full transition-colors" style={{ background: perfect[i] === undefined ? (i === index ? 'var(--ink-2)' : 'var(--line-strong)') : perfect[i] ? 'var(--good)' : 'var(--bad)' }} />
          ))}
        </div>
        <div className="min-w-12 text-right">
          <div className="text-xs leading-4 text-ink-3">Score</div>
          <div className="num text-base font-medium leading-6">
            <AnimatedNumber value={score} />
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.main key={index} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tween(DUR.enter)} className="flex flex-1 flex-col justify-center py-8">
          <p className="text-center">
            <span className="label">In real life</span>
            <span className="meta ml-2">
              {index + 1} of {LIFE_LENGTH}
            </span>
          </p>
          <h1 className="t-display mt-3 text-balance text-center">{q.thing.name}</h1>
          <p className="mt-3 text-center text-ink-2">
            Which {need === 1 ? 'element is' : `${need} elements are`} the key {need === 1 ? 'ingredient' : 'ingredients'}?
          </p>

          <div className="mx-auto mt-8 grid w-full max-w-md grid-cols-4 gap-2 sm:gap-4" role="group" aria-label="Elements to choose from">
            {q.options.map((e) => {
              const on = picked.has(e.number);
              const right = q.answer.has(e.number);
              const state = !checked ? (on ? 'on' : 'idle') : right ? (on ? 'right' : 'missed') : on ? 'wrong' : 'dim';
              return (
                <button
                  key={e.number}
                  onClick={() => toggle(e.number)}
                  aria-pressed={on}
                  // After Check the choice is final: say so, and toggle() ignores the press.
                  aria-disabled={checked || undefined}
                  aria-label={`${e.symbol}, ${e.name}${checked ? (right ? ', correct' : on ? ', not in it' : '') : ''}`}
                  className={`relative aspect-square transition-transform duration-150 ease-out active:scale-[0.98] ${state === 'wrong' ? 'animate-shake' : ''}`}
                  // The focus outline sits outside the state ring so both show at once.
                  style={{ outlineOffset: 6, borderRadius: tileRadius(TILE) }}
                >
                  {/* State ring drawn with its own element, so the global :focus-visible outline still shows (WCAG 2.4.7). */}
                  {state !== 'idle' && state !== 'dim' && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -inset-1 border-2"
                      style={{
                        borderRadius: tileRadius(TILE) + 4,
                        borderColor: state === 'on' ? 'var(--accent)' : state === 'wrong' ? 'var(--bad)' : 'var(--good)',
                        borderStyle: state === 'missed' ? 'dashed' : 'solid',
                      }}
                    />
                  )}
                  {/*
                    Standard and Expert hide the category until the answer is checked; then the answer tiles show their printed colour.
                    The ones that are not in the object step back to plain ink, with their text still at full contrast.
                  */}
                  <ElementTile element={e} size={TILE} showNumber={false} minName={11} color={state === 'dim' ? 'var(--ink-3)' : checked || difficulty === 'learner' ? undefined : 'var(--ink-2)'} />
                  {checked && (right || on) && (
                    <span aria-hidden className={`absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border-2 border-bg text-bg ${right ? 'bg-good' : 'bg-bad'}`}>
                      {right ? <Check size={14} strokeWidth={2.5} /> : <X size={14} strokeWidth={2.5} />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-8 min-h-24" aria-live="polite">
            {checked ? (
              <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={tween(DUR.menu)} className="card p-4 sm:p-5" aria-label="What is inside">
                <p className="text-[15px] font-medium" style={{ color: verdict.color }}>
                  {verdict.text}
                </p>
                <ul className="mt-4 space-y-4">
                  {q.thing.contains.map(([s, why]) => {
                    const e = el(s);
                    return (
                      <li key={s} className="flex items-start gap-3">
                        <button onClick={() => openDetail(e.number)} className="group shrink-0 rounded-control" aria-label={`Open ${e.name}`}>
                          <ElementChip element={e} size={44} className="border border-transparent transition-colors duration-150 ease-out group-hover:border-ink-3" />
                        </button>
                        <div className="min-w-0">
                          <p className="text-[15px] font-medium text-ink">{e.name}</p>
                          <p className="text-sm text-ink-2">{why}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </motion.section>
            ) : (
              <p className="meta text-center">
                {picked.size} of {need} picked
              </p>
            )}
          </div>

          <div className="mt-4">
            {checked ? (
              <button onClick={next} className="btn btn-lg btn-primary w-full">
                {index + 1 < questions.length ? 'Next object' : 'See results'} <ArrowRight size={18} strokeWidth={1.5} />
              </button>
            ) : (
              <button onClick={check} disabled={picked.size !== need} className="btn btn-lg btn-primary w-full">
                Check
              </button>
            )}
          </div>
        </motion.main>
      </AnimatePresence>

      {result && <Results summary={result.summary} outcome={result.outcome} title="In real life" total={LIFE_LENGTH} onReplay={onReplay} onExit={() => go('/')} exitLabel="Home" />}
    </div>
  );
}
