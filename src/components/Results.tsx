import { motion } from 'motion/react';
import { ArrowRight, Home, RotateCcw, Share2, Star, Trophy } from 'lucide-react';
import { useState } from 'react';
import { byNumber, catVar } from '../lib/elements';
import { formatTime, levelFromXp, titleForLevel } from '../lib/scoring';
import { dailyNumber } from '../lib/daily';
import { useProgress, type RoundOutcome, type RoundSummary } from '../store/progress';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { Confetti } from './Confetti';
import { AnimatedNumber } from './Stats';

interface Props {
  summary: RoundSummary;
  outcome: RoundOutcome;
  title: string;
  total: number;
  onReplay?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  onExit: () => void;
}

const HEADLINES = ['Good try!', 'Nicely done', 'Great run', 'Flawless'];

export function Results({ summary: s, outcome: o, title, total, onReplay, onNext, nextLabel, onExit }: Props) {
  const xp = useProgress((p) => p.xp);
  const openDetail = useUi((u) => u.openDetail);
  const reduce = useSettings((x) => x.reduceMotion);
  const lvl = levelFromXp(xp);
  const before = levelFromXp(Math.max(0, xp - o.xpGained));
  const levelledUp = lvl.level > before.level;
  const attempts = s.correct + s.mistakes + s.hints;
  const acc = attempts ? Math.round((s.correct / attempts) * 100) : 0;
  const slipped = Object.entries(s.results)
    .filter(([, ok]) => !ok)
    .map(([n]) => byNumber(Number(n)));
  const headline = s.completed ? HEADLINES[s.stars] : HEADLINES[0];

  return (
    <motion.div className="fixed inset-0 z-50 overflow-y-auto bg-bg/85 backdrop-blur-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {s.stars === 3 && <Confetti fire={1} />}
      <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-5 py-10" role="dialog" aria-modal="true" aria-labelledby="results-title">
        <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', damping: 22, delay: 0.05 }} className="text-center">
          <p className="text-sm font-medium text-ink-3">{s.kind === 'daily' && s.dailyKey ? `Daily Challenge #${dailyNumber(s.dailyKey)}` : title}</p>
          <h2 id="results-title" className="font-display mt-1 text-4xl font-semibold sm:text-5xl">
            {headline}
          </h2>
          <p className="mt-2 text-ink-2">{encouragement(s)}</p>
          <div className="mt-5 flex justify-center gap-3" aria-label={`${s.stars} of 3 stars`}>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                initial={reduce ? false : { scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 10, stiffness: 200, delay: 0.3 + i * 0.18 }}
              >
                <Star size={i === 1 ? 54 : 42} className={i < s.stars ? 'fill-gold text-gold' : 'text-line-strong'} style={i < s.stars ? { filter: 'drop-shadow(0 0 18px color-mix(in oklab, var(--gold) 60%, transparent))' } : undefined} />
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div className="card mt-8 overflow-hidden" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', damping: 22, delay: 0.2 }}>
          <div className="relative p-6 text-center">
            {o.newBest && (
              <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-1 text-xs font-semibold text-gold">
                <Trophy size={12} /> New best
              </span>
            )}
            <div className="text-xs font-medium uppercase tracking-wider text-ink-3">Score</div>
            <div className="font-display text-grad mt-1 text-6xl font-bold">
              <AnimatedNumber value={s.score} duration={1200} />
            </div>
            {o.previousBest !== null && !o.newBest && <div className="mt-1 text-xs text-ink-3">Best {o.previousBest.toLocaleString('en-US')}</div>}
          </div>
          <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
            {[
              [s.kind === 'quiz' || s.kind === 'life' ? 'Correct' : 'Placed', `${s.correct}/${total}`],
              ['Accuracy', `${acc}%`],
              ['Time', formatTime(s.timeMs)],
              ['Best combo', `${s.maxCombo}`],
            ].map(([k, v]) => (
              <div key={k} className="solid px-4 py-3.5 text-center">
                <dt className="text-[11px] uppercase tracking-wider text-ink-3">{k}</dt>
                <dd className="font-display mt-0.5 text-xl font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-line p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {levelledUp ? (
                  <span className="text-grad font-semibold">Level up! Level {lvl.level}</span>
                ) : (
                  <>
                    Level {lvl.level} <span className="text-ink-3">· {titleForLevel(lvl.level)}</span>
                  </>
                )}
              </span>
              <span className="font-semibold text-accent-3">+{o.xpGained} XP</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
              <motion.div className="h-full rounded-full" style={{ background: 'var(--grad)' }} initial={{ width: `${(levelledUp ? 0 : before.progress) * 100}%` }} animate={{ width: `${lvl.progress * 100}%` }} transition={{ duration: 1.2, delay: 0.6, ease: [0.16, 1, 0.3, 1] }} />
            </div>
            {o.masteryUp.length > 0 && (
              <p className="mt-3 text-sm text-ink-2">
                <span className="font-semibold text-accent-3">{o.masteryUp.length}</span> new element{o.masteryUp.length > 1 ? 's' : ''} mastered:{' '}
                {o.masteryUp.map((n) => byNumber(n).symbol).join(', ')}
              </p>
            )}
          </div>
        </motion.div>

        {s.kind === 'daily' && <Trail trail={s.trail} />}

        {slipped.length > 0 && (
          <motion.div className="mt-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">Worth another look</h3>
            <div className="flex flex-wrap gap-2">
              {slipped.map((e) => (
                <button key={e.number} onClick={() => openDetail(e.number)} className="btn-ghost flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-sm">
                  <span className="grid h-7 w-7 place-items-center rounded-full text-xs font-bold" style={{ background: `color-mix(in oklab, ${catVar(e.category)} 22%, transparent)`, color: catVar(e.category) }}>
                    {e.symbol}
                  </span>
                  {e.name}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        <motion.div className="mt-8 flex flex-col gap-3 sm:flex-row" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.45 }}>
          {s.kind === 'daily' ? (
            <ShareButton summary={s} total={total} />
          ) : onNext && s.completed ? (
            <button onClick={onNext} className="btn-primary flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-base">
              {nextLabel ?? 'Next'} <ArrowRight size={18} />
            </button>
          ) : null}
          {onReplay && (
            <button onClick={onReplay} className={`${s.kind !== 'daily' && !(onNext && s.completed) ? 'btn-primary' : 'btn-ghost'} flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-base font-medium`}>
              <RotateCcw size={18} /> Play again
            </button>
          )}
          <button onClick={onExit} className="btn-ghost flex h-14 items-center justify-center gap-2 rounded-2xl px-6 text-base font-medium" aria-label="Back to home">
            <Home size={18} />
            <span className="sm:hidden">Home</span>
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

function encouragement(s: RoundSummary) {
  if (!s.completed) return 'Every mistake is a fact you now know. Try again — it gets easier fast.';
  if (s.stars === 3) return 'You clearly know these. Time to try something harder?';
  if (s.stars === 2) return 'Solid work. A couple more rounds and these will be locked in.';
  return 'You finished — that is how it starts. The ones you missed are listed below.';
}

const TRAIL = { hit: '🟩', miss: '🟥', hint: '🟨' } as const;

function Trail({ trail }: { trail: RoundSummary['trail'] }) {
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-1.5" aria-label={`${trail.filter((t) => t === 'hit').length} first-try placements out of ${trail.length}`}>
      {trail.map((t, i) => (
        <motion.span
          key={i}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.6 + i * 0.05, type: 'spring', damping: 12 }}
          className="h-6 w-6 rounded-md"
          style={{ background: t === 'hit' ? 'var(--good)' : t === 'hint' ? 'var(--gold)' : 'var(--bad)' }}
        />
      ))}
    </div>
  );
}

export function shareText(s: RoundSummary, total: number) {
  const n = s.dailyKey ? dailyNumber(s.dailyKey) : 0;
  return `Periodica Daily #${n} ⚗️\n${s.correct}/${total} · ${formatTime(s.timeMs)} · ${s.score.toLocaleString('en-US')} pts\n${s.trail.map((t) => TRAIL[t]).join('')}\n${location.origin}${location.pathname}#/daily`;
}

export function ShareButton({ summary, total }: { summary: RoundSummary; total: number }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const text = shareText(summary, total);
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* cancelled */
    }
  };
  return (
    <button onClick={share} className="btn-primary flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-base">
      <Share2 size={18} /> {copied ? 'Copied to clipboard' : 'Share result'}
    </button>
  );
}
