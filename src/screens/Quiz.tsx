import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DifficultyPicker } from '../components/DifficultyPicker';
import { ElementTile, tileRadius } from '../components/ElementTile';
import { MiniTable } from '../components/MiniTable';
import { DUR, EASE, tween } from '../components/motion';
import { Results } from '../components/Results';
import { Switch } from '../components/Switch';
import { AnimatedNumber } from '../components/Stats';
import { byNumber, catVar } from '../lib/elements';
import { haptic, sfx } from '../lib/feedback';
import { buildQuiz, QUESTION_MS, QUIZ_LENGTH, quizPool, type Question } from '../lib/quiz';
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

/** The timer is optional (WCAG 2.2.1): never on Learner, and switchable on the other levels. */
export function useQuizTimed() {
  const difficulty = useSettings((s) => s.difficulty);
  const quizTimer = useSettings((s) => s.quizTimer);
  return difficulty !== 'learner' && quizTimer;
}

function QuizIntro({ onStart }: { onStart: () => void }) {
  const difficulty = useSettings((s) => s.difficulty);
  const quizTimer = useSettings((s) => s.quizTimer);
  const set = useSettings((s) => s.set);
  const mastery = useProgress((s) => s.mastery);
  const timed = useQuizTimed();
  // The elements this quiz can ask about: the real pool, so the table shows what is coming.
  const pool = useMemo(() => new Set(quizPool(difficulty, mastery).map((e) => e.number)), [difficulty, mastery]);
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-12 pt-4 sm:px-6 sm:pt-6">
      <button onClick={() => go('/play')} className="icon-btn -ml-2" aria-label="Back">
        <ArrowLeft size={18} strokeWidth={1.5} />
      </button>
      <main className="grid flex-1 content-center gap-8 py-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-x-16 lg:gap-y-8">
        <header className="lg:col-start-1 lg:row-start-1 lg:self-end">
          <p className="label">Ten questions</p>
          <h1 className="t-display mt-3">Quick quiz</h1>
          <p className="mt-4 max-w-md text-ink-2">
            {timed ? 'Fifteen seconds for each question.' : 'No timer, so take your time.'} The questions come from elements you've met, plus a few new ones, with extra practice on the tricky ones.
          </p>
        </header>

        <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
          <DifficultyPicker extra={{ learner: 'No timer.', expert: 'Adds electronegativity questions.' }} />
          {difficulty !== 'learner' && (
            <label className="mt-4 flex min-h-11 max-w-sm cursor-pointer items-center justify-between gap-4 border-y border-line py-2 text-[15px]">
              15-second timer
              <Switch on={quizTimer} onChange={(v) => set({ quizTimer: v })} />
            </label>
          )}
          <button onClick={onStart} className="btn btn-lg btn-primary mt-8 w-full sm:w-auto">
            Start <ArrowRight size={18} strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        <figure className="card p-5 sm:p-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
          <MiniTable highlight={pool} className="w-full" label={`The ${pool.size} elements this quiz can ask about, highlighted on the periodic table`} />
          <figcaption className="mt-4 border-t border-line pt-4 text-sm text-ink-2">
            Questions come from these <span className="num text-ink">{pool.size}</span> elements
          </figcaption>
        </figure>
      </main>
    </div>
  );
}

function QuizRun({ onReplay }: { onReplay: () => void }) {
  const difficulty = useSettings((s) => s.difficulty);
  const timedSetting = useQuizTimed();
  // Fixed for the whole round, even if settings change mid-quiz.
  const [timed] = useState(timedSetting);
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
  const optionsRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

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
    if (!timed || answered || result) return;
    const id = setInterval(() => {
      const left = QUESTION_MS - (Date.now() - askedAt.current);
      setRemaining(left);
      if (left <= 0) answer(null);
    }, 100);
    return () => clearInterval(id);
  }, [timed, answered, answer, result]);

  // Auto-advance after a correct answer.
  useEffect(() => {
    if (!answered || !current?.ok || result) return;
    const t = setTimeout(next, 1100);
    return () => clearTimeout(t);
  }, [answered, current, next]);

  // After a wrong answer, focus moves to Next so keyboard and screen-reader users land on the way forward (WCAG 2.4.3).
  useEffect(() => {
    if (!answered || current?.ok) return;
    const a = document.activeElement;
    if (!a || a === document.body || optionsRef.current?.contains(a)) nextRef.current?.focus();
  }, [answered, current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (result || e.ctrlKey || e.metaKey || e.altKey || shortcutsBlocked(e.target)) return;
      const i = Number(e.key) - 1;
      // Number keys answer from the answer buttons or when nothing interactive has focus (the page, the question),
      // never while another control such as "Leave quiz" has focus (WCAG 2.1.4).
      const t = e.target;
      const onPage = !(t instanceof HTMLElement) || !!optionsRef.current?.contains(t) || !t.closest(INTERACTIVE);
      if (!answered && onPage && i >= 0 && i < q.options.length && i < 4) answer(i);
      else if (answered && (e.key === 'Enter' || e.key === ' ') && !isControl(e.target)) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answered, answer, next, result, q]);

  const e = byNumber(q.element);
  const heroEl = q.hero ? byNumber(q.element) : null;
  // Category colour would give the answer away, and so would the tile on harder levels: show an unprinted square instead.
  const hideColour = q.kind === 'category' || difficulty !== 'learner';

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-8 pt-4 sm:px-6">
      <header className="flex items-center gap-4">
        <button onClick={() => go('/play')} className="icon-btn -ml-2" aria-label="Leave quiz">
          <ArrowLeft size={18} strokeWidth={1.5} />
        </button>
        <div className="flex flex-1 gap-1" role="progressbar" aria-label="Questions" aria-valuemin={1} aria-valuemax={QUIZ_LENGTH} aria-valuenow={index + 1} aria-valuetext={`Question ${index + 1} of ${QUIZ_LENGTH}`}>
          {questions.map((_, i) => (
            <span key={i} aria-hidden className="h-1 flex-1 rounded-full transition-colors" style={{ background: answers[i] ? (answers[i].ok ? 'var(--good)' : 'var(--bad)') : i === index ? 'var(--accent)' : 'var(--line-strong)' }} />
          ))}
        </div>
        <div className="min-w-12 text-right">
          <div className="text-xs leading-4 text-ink-3">Score</div>
          <div className="num text-base font-medium leading-6">
            <AnimatedNumber value={score} />
          </div>
        </div>
      </header>

      {timed && (
        <>
          {/* The timer: a bar and the seconds beside it, so it never reads as a second progress bar. */}
          <div className="mt-4 flex items-center gap-3" aria-hidden>
            <div className="meter h-1 flex-1">
              {/* Time runs out at a constant rate, so the bar moves linearly between ticks. */}
              <div className="meter-fill" style={{ transform: `scaleX(${answered ? 0 : Math.max(0, remaining) / QUESTION_MS})`, transition: 'transform 100ms linear', background: remaining < 4000 ? 'var(--bad)' : 'var(--ink-3)' }} />
            </div>
            <span className="mono w-10 text-right text-xs leading-4" style={{ color: !answered && remaining < 4000 ? 'var(--bad)' : 'var(--ink-3)' }}>
              {answered ? '–' : `${Math.max(0, Math.ceil(remaining / 1000))} s`}
            </span>
          </div>
          {/* Said once per question, so screen-reader users know time is nearly up. */}
          <div className="sr-only" aria-live="polite">
            {!answered && !result && remaining > 0 && remaining <= 5000 ? 'About 5 seconds left' : ''}
          </div>
        </>
      )}

      <AnimatePresence mode="wait">
        <motion.main key={index} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: tween(DUR.press) }} transition={tween(DUR.enter)} className="flex flex-1 flex-col justify-center py-8">
          {/* The segments above already count the questions; this line only speaks up for a streak. */}
          <p className="meta h-4 text-center text-ink-2">{combo >= 3 ? `${combo} in a row ×${multiplier(combo)}` : ''}</p>
          {heroEl && (
            <div className="mx-auto mt-6 h-28 w-28" aria-hidden>
              {q.kind === 'number' ? (
                // The wall chart with the symbol left out: only the corner number is printed.
                <div className="slot relative grid h-full w-full place-items-center" style={{ borderRadius: tileRadius(112) }}>
                  <span className="tile-number absolute left-3 top-3 text-[28px] text-ink">{q.hero}</span>
                  <span className="mt-4 text-4xl text-ink-3">?</span>
                </div>
              ) : (
                <ElementTile element={heroEl} size={112} showName={false} showNumber={difficulty === 'learner'} color={hideColour ? 'var(--ink-3)' : undefined} />
              )}
            </div>
          )}
          <QuestionHeading className={`mx-auto mt-6 max-w-lg text-center font-medium ${q.kind === 'fact' ? 'text-xl leading-snug sm:text-2xl' : 'text-2xl leading-tight sm:text-3xl'}`}>
            <span className="sr-only">
              Question {index + 1} of {QUIZ_LENGTH}:{' '}
            </span>
            {q.prompt}
            {q.hero && q.kind !== 'category' && <span className="sr-only"> {q.hero}</span>}
          </QuestionHeading>
          {q.kind === 'fact' && <p className="mt-2 text-center text-sm text-ink-2">Which element is this?</p>}

          <div ref={optionsRef} className="mt-8 grid gap-3 sm:grid-cols-2" role="group" aria-label="Answers">
            {q.options.map((o, i) => {
              const isAnswer = i === q.answer;
              const chosen = current?.choice === i;
              const state = !answered ? 'idle' : isAnswer ? 'right' : chosen ? 'wrong' : 'dim';
              return (
                <motion.button
                  key={o}
                  onClick={() => answer(i)}
                  // aria-disabled, not disabled, so the focused answer keeps focus after it is chosen.
                  aria-disabled={answered || undefined}
                  animate={state === 'wrong' ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className={`flex min-h-14 items-center gap-3 rounded-control border px-4 py-3 text-left text-base font-medium transition-colors ${
                    state === 'idle'
                      ? 'border-line bg-surface hover:border-line-strong hover:bg-surface-2'
                      : state === 'right'
                        ? 'border-good bg-good/10'
                        : state === 'wrong'
                          ? 'border-bad bg-bad/10'
                          : 'border-line bg-surface text-ink-3'
                  }`}
                >
                  {state === 'right' ? (
                    <Check size={18} strokeWidth={1.5} className="shrink-0 text-good" aria-hidden />
                  ) : state === 'wrong' ? (
                    <X size={18} strokeWidth={1.5} className="shrink-0 text-bad" aria-hidden />
                  ) : (
                    <kbd className="kbd h-6 min-w-6 shrink-0 text-xs" aria-hidden>
                      {i + 1}
                    </kbd>
                  )}
                  <span className={q.kind === 'name' ? 'text-lg' : ''}>{o}</span>
                </motion.button>
              );
            })}
          </div>

          <div className="mt-6 min-h-28" aria-live="polite">
            {answered && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={tween(DUR.menu)} className="card flex flex-wrap items-center gap-4 p-4">
                <div className="h-12 w-12 shrink-0">
                  <ElementTile element={e} size={48} showName={false} />
                </div>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-sm font-medium" style={{ color: current.ok ? 'var(--good)' : 'var(--bad)' }}>
                    {current.ok ? `Correct · +${current.points}` : current.choice === null ? "Time's up" : 'Not quite'}
                  </p>
                  <p className="mt-1 text-sm text-ink-2">
                    <span className="cat-ink font-medium" style={{ '--c': catVar(e.category) } as React.CSSProperties}>
                      {e.name}
                    </span>
                    : {e.summary?.split('. ')[0]}.
                  </p>
                </div>
                {!current.ok && (
                  <button ref={nextRef} onClick={next} className="btn btn-primary ml-auto shrink-0">
                    Next <ArrowRight size={18} strokeWidth={1.5} aria-hidden />
                  </button>
                )}
              </motion.div>
            )}
          </div>
        </motion.main>
      </AnimatePresence>

      {result && <Results summary={result.summary} outcome={result.outcome} title="Quick quiz" total={QUIZ_LENGTH} onReplay={onReplay} onExit={() => go('/')} exitLabel="Home" />}
    </div>
  );
}

const INTERACTIVE = 'button, a[href], input, select, textarea, summary, [role="button"], [role="switch"], [role="radio"], [role="tab"], [role="link"]';

/** Number-key shortcuts must not fire while typing or while a dialog (settings, element detail) is open. */
function shortcutsBlocked(target: EventTarget | null) {
  if (document.querySelector('[aria-modal="true"]')) return true;
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || !!target.closest('input, textarea, select, [role="dialog"]');
}

/** Enter/Space on a focused control should activate that control, not skip ahead. */
function isControl(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const control = target.closest('button, a[href], input, select, textarea, [role="button"], [role="radio"], [role="switch"]');
  return !!control && !control.matches(':disabled, [aria-disabled="true"]');
}

/** The question heading takes focus when a new question appears, so it is read out (WCAG 2.4.3, 4.1.3). */
function QuestionHeading({ className, children }: { className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const a = document.activeElement;
    // Only when focus was lost with the old question (or the Start button); never steal it from another control.
    if (!a || a === document.body) ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className={`${className} outline-none`}>
      {children}
    </h1>
  );
}
