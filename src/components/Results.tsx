import { motion } from 'motion/react';
import { ArrowRight, Check, Home, RotateCcw, Share2, Star, Trophy, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { byNumber, catVar } from '../lib/elements';
import { formatTime, levelFromXp, titleForLevel } from '../lib/scoring';
import { dailyNumber } from '../lib/daily';
import { useProgress, type RoundOutcome, type RoundSummary } from '../store/progress';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { ACHIEVEMENTS } from '../lib/achievements';
import { Confetti } from './Confetti';
import { Icon, TIER_COLOR } from './Icon';
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
  /** Visible text and accessible name of the exit button. Say where it goes, e.g. "Home" or "Back to path". */
  exitLabel?: string;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Results({ summary: s, outcome: o, title, total, onReplay, onNext, nextLabel, onExit, exitLabel = 'Done' }: Props) {
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
  const headline = headlineFor(s, acc, attempts);
  const unlocked = o.unlocked.map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter((a) => !!a);
  const overlay = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  // Modal behaviour (WCAG 2.4.3): focus moves in, Tab stays in, Escape exits, the page behind is inert.
  useEffect(() => {
    useUi.getState().setResultsOpen(true, o.unlocked);
    const restore = makeBackgroundInert(overlay.current);
    heading.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      const box = dialog.current;
      if (!box) return;
      // Another dialog opened on top (e.g. an element's detail sheet) handles its own keys.
      const active = document.activeElement;
      const otherModal = active instanceof HTMLElement ? active.closest('[aria-modal="true"]') : null;
      if (otherModal && otherModal !== box) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        exitRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const f = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      const inside = active instanceof Node && box.contains(active);
      if (e.shiftKey && (!inside || active === first || active === heading.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      restore();
      useUi.getState().setResultsOpen(false);
    };
  }, []);

  return (
    <motion.div ref={overlay} className="fixed inset-0 z-50 overflow-y-auto bg-bg/85 backdrop-blur-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {s.stars === 3 && <Confetti fire={1} />}
      <div ref={dialog} className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-5 py-10" role="dialog" aria-modal="true" aria-labelledby="results-title">
        <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', damping: 22, delay: 0.05 }} className="text-center">
          <p className="text-sm font-medium text-ink-3">{s.kind === 'daily' && s.dailyKey ? `Daily Challenge #${dailyNumber(s.dailyKey)}` : title}</p>
          <h2 ref={heading} id="results-title" tabIndex={-1} className="font-display mt-1 text-4xl font-semibold sm:text-5xl" style={{ outline: 'none' }}>
            {headline}
          </h2>
          <p className="mt-2 text-ink-2">{encouragement(s, acc, attempts, slipped.length > 0)}</p>
          <div className="mt-5 flex justify-center gap-3" role="img" aria-label={`${s.stars} of 3 stars`}>
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
              [s.kind === 'match' ? 'Pairs' : s.kind === 'quiz' || s.kind === 'life' ? 'Correct' : 'Placed', `${s.correct}/${total}`],
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
            {unlocked.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-ink-2">{unlocked.length === 1 ? 'Achievement unlocked' : `${unlocked.length} achievements unlocked`}</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {unlocked.map((a) => {
                    const color = TIER_COLOR[a.tier];
                    return (
                      <motion.li
                        key={a.id}
                        title={a.desc}
                        className="flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-3 text-sm font-semibold"
                        initial={reduce ? false : { scale: 0.85, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', damping: 16, delay: 0.9 }}
                      >
                        <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full" style={{ background: `color-mix(in oklab, ${color} 20%, transparent)`, color }}>
                          <Icon name={a.icon} size={15} />
                        </span>
                        {a.name}
                      </motion.li>
                    );
                  })}
                </ul>
              </div>
            )}
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
                  <span className="cat-chip grid h-7 w-7 place-items-center rounded-full text-xs font-bold" style={{ '--c': catVar(e.category) } as CSSProperties}>
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
            <button onClick={onNext} className="btn-primary flex h-14 items-center sm:flex-1 justify-center gap-2 rounded-2xl text-base">
              {nextLabel ?? 'Next'} <ArrowRight size={18} />
            </button>
          ) : null}
          {onReplay && (
            <button onClick={onReplay} className={`${s.kind !== 'daily' && !(onNext && s.completed) ? 'btn-primary' : 'btn-ghost'} flex h-14 items-center justify-center gap-2 rounded-2xl text-base font-medium sm:flex-1`}>
              <RotateCcw size={18} /> Play again
            </button>
          )}
          <button onClick={onExit} className="btn-ghost flex h-14 items-center justify-center gap-2 rounded-2xl px-6 text-base font-medium">
            {exitLabel === 'Home' && <Home size={18} aria-hidden />}
            {exitLabel}
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

/** Picks the headline from accuracy as well as stars, so a 3/10 never reads "Nicely done". */
function headlineFor(s: RoundSummary, acc: number, attempts: number) {
  if (!s.completed) return 'Good try!';
  if (attempts > 0 && acc < 50) return 'Keep going';
  if (s.stars >= 3) return acc === 100 ? 'Flawless' : 'Brilliant';
  if (s.stars === 2) return 'Great run';
  return 'Nicely done';
}

function encouragement(s: RoundSummary, acc: number, attempts: number, hasList: boolean) {
  if (!s.completed) return 'Every mistake is a fact you now know. Try again, it gets easier fast.';
  if (attempts > 0 && acc < 50)
    return hasList ? 'Every miss is something you now know. The ones to look at are below.' : 'Every miss is something you now know. Another round will help these stick.';
  if (s.stars === 3) return 'You clearly know these. Time to try something harder?';
  if (s.stars === 2) return 'Solid work. A couple more rounds and these will be locked in.';
  return hasList ? 'You finished, and that is how it starts. The ones you missed are listed below.' : 'You finished, and that is how it starts. Another round will lock these in.';
}

/**
 * Sets `inert` on everything outside `root` (sibling branches at each level up to <body>).
 * Live regions and other open dialogs are left alone. Returns a function that undoes exactly what it changed.
 */
function makeBackgroundInert(root: HTMLElement | null) {
  const touched: HTMLElement[] = [];
  let node: HTMLElement | null = root;
  while (node && node !== document.body) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sib of parent.children) {
      if (sib === node || !(sib instanceof HTMLElement) || sib.inert) continue;
      if (sib.matches('script, style, [aria-live], [aria-modal="true"]')) continue;
      sib.inert = true;
      touched.push(sib);
    }
    node = parent;
  }
  return () => touched.forEach((el) => (el.inert = false));
}

const TRAIL = { hit: '🟩', miss: '🟥', hint: '🟨' } as const;

export function trailLabel(trail: RoundSummary['trail']) {
  const count = (k: RoundSummary['trail'][number]) => trail.filter((t) => t === k).length;
  const hints = count('hint');
  const misses = count('miss');
  return `${count('hit')} of ${trail.length} placed first try${hints ? `, ${hints} with a hint` : ''}${misses ? `, ${misses} missed` : ''}`;
}

/** Coloured squares that also carry a symbol, so the result does not rely on colour alone (WCAG 1.4.1). */
export function TrailSquares({ trail, animate = true, className = '' }: { trail: RoundSummary['trail']; animate?: boolean; className?: string }) {
  return (
    <div className={`flex flex-wrap justify-center gap-1.5 ${className}`} role="img" aria-label={trailLabel(trail)}>
      {trail.map((t, i) => (
        <motion.span
          key={i}
          initial={animate ? { scale: 0 } : false}
          animate={{ scale: 1 }}
          transition={{ delay: 0.6 + i * 0.05, type: 'spring', damping: 12 }}
          className="grid h-6 w-6 place-items-center rounded-md text-bg"
          style={{ background: t === 'hit' ? 'var(--good)' : t === 'hint' ? 'var(--gold)' : 'var(--bad)' }}
          aria-hidden
        >
          {t === 'hit' ? <Check size={14} strokeWidth={3} /> : t === 'hint' ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : <X size={14} strokeWidth={3} />}
        </motion.span>
      ))}
    </div>
  );
}

function Trail({ trail }: { trail: RoundSummary['trail'] }) {
  return <TrailSquares trail={trail} className="mt-6" />;
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
    <button onClick={share} className="btn-primary flex h-14 w-full items-center sm:w-auto sm:flex-1 justify-center gap-2 rounded-2xl text-base">
      <Share2 size={18} /> {copied ? 'Copied to clipboard' : 'Share result'}
    </button>
  );
}
