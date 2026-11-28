import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, BrainCircuit, Check, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DifficultyPicker } from '../components/DifficultyPicker';
import { ElementTile, Plate } from '../components/ElementTile';
import { Results } from '../components/Results';
import { AnimatedNumber } from '../components/Stats';
import { byNumber } from '../lib/elements';
import { haptic, sfx } from '../lib/feedback';
import { buildQuiz, QUESTION_MS, QUIZ_LENGTH, type Question } from '../lib/quiz';
import { go } from '../lib/router';
import { multiplier, stars } from '../lib/scoring';
import { useProgress, type RoundOutcome, type RoundSummary } from '../store/progress';
import { useSettings } from '../store/settings';
import { announceAchievements } from '../store/ui';

type Answer = { choice: number | null; ok: boolean; points: number };

export function Quiz() {
  const [round, setRound] = useState(0);
  const [started, setStarted] = useState(false);
  if (!started) return <QuizIntro onStart={() => setStarted(true)} />;
  return <QuizRun key={round} onReplay={() => setRound((r) => r + 1)} />;
}

function QuizIntro({ onStart }: { onStart: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 pb-10 pt-6">
      <button onClick={() => go('/play')} className="btn-ghost grid h-10 w-10 place-items-center rounded-[10px]" aria-label="Back">
        <ArrowLeft size={18} strokeWidth={1.75} />
      </button>
      <div className="flex flex-1 flex-col justify-center text-center">
        <motion.div initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="mx-auto">
          <Plate size={80} corner="Qz">
            <BrainCircuit size={32} strokeWidth={1.5} />
          </Plate>
        </motion.div>
        <h1 className="font-display mt-6 text-5xl font-medium">Quick Quiz</h1>
        <p className="mx-auto mt-3 max-w-sm text-ink-2">Ten questions, fifteen seconds each. Questions lean towards the elements you haven't mastered yet.</p>
        <div className="mt-8 flex justify-center">
          <DifficultyPicker />
        </div>
        <button onClick={onStart} className="btn-primary mx-auto mt-10 flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-[10px] text-base">
          Start <ArrowRight size={18} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

function QuizRun({ onReplay }: { onReplay: () => void }) {
  const difficulty = useSettings((s) => s.difficulty);
  const mastery = useProgress((s) => s.mastery);
  const recordRound = useProgress((s) => s.recordRound);
  const [questions] = useState<Question[]>(() => buildQuiz(difficulty, mastery));
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [result, setResult] = useState<{ summary: RoundSummary; outcome: RoundOutcome } | null>(null);
  const startedAt = useRef(Date.now());
  const recorded = useRef(false);
  const askedAt = useRef(Date.now());
  const [remaining, setRemaining] = useState(QUESTION_MS);

  const q = questions[index];
  const answered = answers.length > index;
  const current = answers[index];

  const answer = useCallback(
    (choice: number | null) => {
      if (answered) return;
      const ok = choice === q.answer;
      const left = Math.max(0, QUESTION_MS - (Date.now() - askedAt.current));
      const nextCombo = ok ? combo + 1 : 0;
      const points = ok ? Math.round((100 + Math.round((left / QUESTION_MS) * 100)) * multiplier(nextCombo)) : 0;
      setAnswers((a) => [...a, { choice, ok, points }]);
      setScore((s) => s + points);
      setCombo(nextCombo);
      setMaxCombo((m) => Math.max(m, nextCombo));
      if (ok) {
        sfx.hit(nextCombo - 1);
        haptic(12);
      } else {
        sfx.miss();
        haptic([30, 40, 30]);
      }
    },
    [answered, q, combo],
  );

  const next = useCallback(() => {
    if (recorded.current) return;
    if (index + 1 < questions.length) {
      setIndex((i) => i + 1);
      askedAt.current = Date.now();
      setRemaining(QUESTION_MS);
      return;
    }
    const results: Record<number, boolean> = {};
    questions.forEach((qq, i) => (results[qq.element] = (results[qq.element] ?? true) && answers[i].ok));
    const correct = answers.filter((a) => a.ok).length;
    const summary: RoundSummary = {
      kind: 'quiz',
      difficulty,
      score,
      correct,
      mistakes: QUIZ_LENGTH - correct,
      hints: 0,
      timeMs: Date.now() - startedAt.current,
      maxCombo,
      stars: stars(correct / QUIZ_LENGTH, true),
      completed: true,
      results,
      trail: answers.map((a) => (a.ok ? 'hit' : 'miss')),
    };
    recorded.current = true;
    const outcome = recordRound(summary);
    if (summary.stars === 3) sfx.win();
    announceAchievements(outcome.unlocked);
    setResult({ summary, outcome });
  }, [index, questions, answers, difficulty, score, maxCombo, recordRound]);

  // Question timer.
  useEffect(() => {
    if (answered || result) return;
    const id = setInterval(() => {
      const left = QUESTION_MS - (Date.now() - askedAt.current);
      setRemaining(left);
      if (left <= 0) answer(null);
    }, 100);
    return () => clearInterval(id);
  }, [answered, answer, result]);

  // Auto-advance after a correct answer.
  useEffect(() => {
    if (!answered || !current?.ok || result) return;
    const t = setTimeout(next, 1100);
    return () => clearTimeout(t);
  }, [answered, current, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (result) return;
      const i = Number(e.key) - 1;
      if (!answered && i >= 0 && i < 4) answer(i);
      else if (answered && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answered, answer, next, result]);

  const e = byNumber(q.element);
  const heroEl = q.hero ? byNumber(q.element) : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-8 pt-4">
      <header className="flex items-center gap-3">
        <button onClick={() => go('/play')} className="btn-ghost grid h-10 w-10 shrink-0 place-items-center rounded-[10px]" aria-label="Leave quiz">
          <ArrowLeft size={18} strokeWidth={1.75} />
        </button>
        <div className="flex flex-1 gap-1" aria-label={`Question ${index + 1} of ${QUIZ_LENGTH}`}>
          {questions.map((_, i) => (
            <span key={i} className="h-1.5 flex-1 rounded-full transition-colors" style={{ background: answers[i] ? (answers[i].ok ? 'var(--good)' : 'var(--bad)') : i === index ? 'var(--ink-2)' : 'var(--line-strong)' }} />
          ))}
        </div>
        <div className="font-display w-20 text-right text-lg font-medium tabular-nums">
          <AnimatedNumber value={score} />
        </div>
      </header>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full transition-[width] duration-100 ease-linear" style={{ width: `${(answered ? 0 : Math.max(0, remaining) / QUESTION_MS) * 100}%`, background: remaining < 4000 ? 'var(--bad)' : 'var(--accent)' }} />
      </div>

      <AnimatePresence mode="wait">
        <motion.main key={index} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="flex flex-1 flex-col justify-center py-8">
          <p className="text-center text-sm tabular-nums text-ink-3">
            Question {index + 1} of {QUIZ_LENGTH}
            {combo >= 3 && <span className="ml-2">· {combo} streak ×{multiplier(combo)}</span>}
          </p>
          {heroEl && (
            <div className="mx-auto mt-6 h-28 w-28">
              {q.kind === 'number' ? (
                <Plate size={112}>{q.hero}</Plate>
              ) : (
                <ElementTile element={heroEl} size={112} showName={false} showNumber={difficulty === 'learner'} color={q.kind === 'category' ? 'var(--ink-3)' : difficulty === 'learner' ? undefined : 'var(--ink-3)'} />
              )}
            </div>
          )}
          <h1 className={`font-display mx-auto mt-6 max-w-lg text-center font-medium ${q.kind === 'fact' ? 'text-xl leading-snug sm:text-2xl' : 'text-2xl sm:text-3xl'}`}>{q.prompt}</h1>
          {q.kind === 'fact' && <p className="mt-2 text-center text-sm text-ink-3">Which element is this?</p>}

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {q.options.map((o, i) => {
              const isAnswer = i === q.answer;
              const chosen = current?.choice === i;
              const state = !answered ? 'idle' : isAnswer ? 'right' : chosen ? 'wrong' : 'dim';
              return (
                <motion.button
                  key={o}
                  onClick={() => answer(i)}
                  disabled={answered}
                  animate={state === 'wrong' ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }}
                  transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                  className={`flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 text-left text-base font-medium transition-colors ${
                    state === 'idle' ? 'border-line bg-surface hover:border-line-strong hover:bg-surface-2' : state === 'right' ? 'border-good bg-good/12' : state === 'wrong' ? 'border-bad bg-bad/12' : 'border-line bg-surface opacity-50'
                  }`}
                >
                  <kbd className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-xs font-medium text-ink-3">{state === 'right' ? <Check size={14} strokeWidth={2} className="text-good" /> : state === 'wrong' ? <X size={14} strokeWidth={2} className="text-bad" /> : i + 1}</kbd>
                  <span className={q.kind === 'name' ? 'font-display text-xl' : ''}>{o}</span>
                </motion.button>
              );
            })}
          </div>

          <div className="mt-6 min-h-28" aria-live="polite">
            {answered && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="flex items-start gap-4 rounded-xl border border-line bg-surface p-4">
                <div className="h-14 w-14 shrink-0">
                  <ElementTile element={e} size={56} showName={false} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium" style={{ color: current.ok ? 'var(--good)' : 'var(--bad)' }}>
                    {current.ok ? `Correct · +${current.points}` : current.choice === null ? "Time's up" : 'Not quite'}
                  </div>
                  <p className="mt-0.5 text-sm text-ink-2">
                    <span className="font-medium text-ink">{e.name}.</span> {e.summary?.split('. ')[0]}.
                  </p>
                </div>
                {!current.ok && (
                  <button onClick={next} className="btn-primary flex h-10 shrink-0 items-center gap-1 self-center rounded-[10px] px-4 text-sm">
                    Next <ArrowRight size={16} strokeWidth={1.75} />
                  </button>
                )}
              </motion.div>
            )}
          </div>
        </motion.main>
      </AnimatePresence>

      {result && <Results summary={result.summary} outcome={result.outcome} title="Quick Quiz" total={QUIZ_LENGTH} onReplay={onReplay} onExit={() => go('/')} />}
    </div>
  );
}
