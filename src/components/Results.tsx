import { motion } from 'motion/react';
import { ArrowRight, Check, Home, RotateCcw, Share2, Star, Trophy, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { byNumber } from '../lib/elements';
import { formatTime, levelFromXp, titleForLevel } from '../lib/scoring';
import { dailyNumber } from '../lib/daily';
import { useProgress, type RoundOutcome, type RoundSummary } from '../store/progress';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { ACHIEVEMENTS } from '../lib/achievements';
import { CONFETTI_COUNT, roundSeed, type Finish } from '../lib/celebrate';
import { Confetti, MasterTrophy, useCalm } from './Celebrate';
import { ElementChip } from './ElementTile';
import { MiniTable } from './MiniTable';
import { Icon, TIER_COLOR } from './Icon';
import { DUR, STAGGER, tween } from './motion';
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
  /** Overrides for the headline and the line under it (the end of a Timed Challenge level). */
  headline?: string;
  message?: string;
  /** A Timed Challenge finish: a level cleared, or the master finish (all 118). Celebrated with confetti, and a trophy for the master. */
  finish?: 'level' | 'master';
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Results({ summary: s, outcome: o, title, total, onReplay, onNext, nextLabel, onExit, exitLabel = 'Done', headline: headlineOverride, message, finish }: Props) {
  const xp = useProgress((p) => p.xp);
  const openDetail = useUi((u) => u.openDetail);
  const reduce = useSettings((x) => x.reduceMotion);
  /** The setting or the OS: no confetti, and a trophy that stands still. */
  const calm = useCalm();
  const lvl = levelFromXp(xp);
  const before = levelFromXp(Math.max(0, xp - o.xpGained));
  const levelledUp = lvl.level > before.level;
  const attempts = s.correct + s.mistakes + s.hints;
  const acc = attempts ? Math.round((s.correct / attempts) * 100) : 0;
  const slipped = Object.entries(s.results)
    .filter(([, ok]) => !ok)
    .map(([n]) => byNumber(Number(n)));
  const headline = headlineOverride ?? headlineFor(s, acc, attempts);
  const played = new Set(Object.keys(s.results).map(Number));
  const slippedSet = new Set(slipped.map((e) => e.number));
  const primary: 'share' | 'next' | 'replay' | null = s.kind === 'daily' ? 'share' : onNext && s.completed ? 'next' : onReplay ? 'replay' : null;
  // With a primary and a replay already on screen, the way out steps back to a text button.
  const exitQuiet = !!primary && !!onReplay && primary !== 'replay';
  const unlocked = o.unlocked.map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter((a) => !!a);
  const overlay = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const starsRef = useRef<HTMLDivElement>(null);

  // Confetti only for a real celebration: three stars, a Timed Challenge level cleared, or the master finish.
  const celebrate: Finish | null = !s.completed ? null : finish === 'master' ? 'master' : finish === 'level' ? 'level' : s.stars >= 3 ? 'stars' : null;
  // Made of the round's own elements (all of them for the master finish), the same every time this result renders.
  const confettiElements = useMemo(() => (celebrate === 'master' ? [] : Object.keys(s.results).map(Number)), [celebrate, s.results]);
  const seed = roundSeed([s.score, s.timeMs, s.correct, s.mistakes]);

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
    <motion.div ref={overlay} className="fixed inset-0 z-50 scroll-pb-40 overflow-y-auto bg-bg sm:scroll-pb-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={tween(DUR.menu)}>
      {/* Decorative and behind the whole dialog (text, card and actions stay on top), never taking a click; not rendered at all when motion is reduced. */}
      {celebrate && !calm && <Confetti seed={seed} count={CONFETTI_COUNT[celebrate]} elements={confettiElements} origin={starsRef} />}
      <div ref={dialog} className="relative z-[1] mx-auto flex min-h-full max-w-xl flex-col justify-center px-4 py-8 sm:px-6" role="dialog" aria-modal="true" aria-labelledby="results-title">
        <motion.div className="text-center" {...enter(0)}>
          {finish === 'master' && s.completed && <MasterTrophy still={calm} />}
          <p className="text-sm text-ink-2">{s.kind === 'daily' && s.dailyKey ? `Daily challenge #${dailyNumber(s.dailyKey)}` : title}</p>
          <h2 ref={heading} id="results-title" tabIndex={-1} className="t-display mt-2" style={{ outline: 'none' }}>
            {headline}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-ink-2">{message ?? encouragement(s, acc, attempts, slipped.length > 0, total)}</p>
          <Stars stars={s.stars} reduce={reduce} ref={starsRef} />
          {s.kind === 'daily' && <TrailSquares trail={s.trail} className="mt-4" />}
        </motion.div>

        <motion.section className="card mt-6 overflow-hidden" {...enter(0.1)} aria-label="Round summary">
          <div className="relative px-4 pb-4 pt-4 text-center sm:px-6 sm:pb-5 sm:pt-6">
            {o.newBest && (
              <span className="absolute right-4 top-4 inline-flex items-center gap-1 text-[13px] font-medium leading-5 text-gold">
                <Trophy size={14} strokeWidth={1.5} aria-hidden /> New best
              </span>
            )}
            <div className="text-sm text-ink-2">Score</div>
            <div className="num mt-1 text-[56px] font-medium leading-none tracking-[-0.02em]">
              <AnimatedNumber value={s.score} duration={900} />
            </div>
            {o.previousBest !== null && !o.newBest && <div className="meta mt-2">Best {o.previousBest.toLocaleString('en-US')}</div>}
            {played.size > 0 && (
              <figure className="mx-auto mt-5 max-w-[320px]">
                <MiniTable
                  highlight={played}
                  flagged={slippedSet}
                  className="w-full"
                  label={`${placedWord(s.kind)} on the periodic table: ${played.size} elements${slipped.length ? `, ${slipped.length} worth another look` : ''}`}
                />
                <figcaption className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
                  <span>{placedWord(s.kind)}</span>
                  {slipped.length > 0 && (
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] border-2 border-bad" />
                      Worth another look
                    </span>
                  )}
                </figcaption>
              </figure>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
            {[
              [s.kind === 'match' ? 'Pairs' : s.kind === 'quiz' || s.kind === 'life' ? 'Correct' : 'Placed', `${s.correct}/${total}`],
              ['Accuracy', `${acc}%`],
              ['Time', formatTime(s.timeMs)],
              ['Best combo', `${s.maxCombo}`],
            ].map(([k, v]) => (
              <div key={k} className="bg-surface px-4 py-3 text-center">
                <dt className="text-[13px] text-ink-2">{k}</dt>
                <dd className="num mt-1 text-xl font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-line px-4 py-4 sm:px-6">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span>
                {levelledUp ? (
                  <span className="font-medium">Level {lvl.level} reached</span>
                ) : (
                  <>
                    Level {lvl.level} <span className="text-ink-2">· {titleForLevel(lvl.level)}</span>
                  </>
                )}
              </span>
              <span className="num font-medium text-accent">+{o.xpGained} XP</span>
            </div>
            <div className="meter mt-3">
              <motion.div
                className="meter-fill"
                style={{ transition: 'none' }}
                initial={{ scaleX: levelledUp ? 0 : before.progress }}
                animate={{ scaleX: lvl.progress }}
                transition={tween(0.9, reduce ? 0 : 0.4)}
              />
            </div>
          </div>
        </motion.section>

        {/*
          One primary, at most one secondary; the way out is a quiet text button.
          Phones: the actions stay pinned to the bottom edge, so they are on the first screen whatever the round shows.
        */}
        <motion.div
          className="sticky bottom-0 z-10 -mx-4 mt-6 grid grid-cols-2 gap-3 border-t border-line bg-bg px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:static sm:mx-0 sm:flex sm:items-center sm:border-0 sm:bg-transparent sm:p-0"
          {...enter(0.15)}
        >
          {primary === 'share' && <ShareButton summary={s} total={total} />}
          {primary === 'next' && (
            <button onClick={onNext} className="btn btn-lg btn-primary col-span-2 sm:flex-1">
              {nextLabel ?? 'Next'} <ArrowRight size={18} strokeWidth={1.5} />
            </button>
          )}
          {onReplay && (
            <button onClick={onReplay} className={`btn btn-lg sm:flex-1 ${primary === 'replay' ? 'btn-primary col-span-2' : 'btn-secondary'} ${exitQuiet ? '' : 'col-span-2'}`}>
              <RotateCcw size={18} strokeWidth={1.5} /> Play again
            </button>
          )}
          <button onClick={onExit} className={`btn btn-lg ${exitQuiet ? 'btn-quiet' : 'btn-secondary col-span-2 sm:flex-1'}`}>
            {exitLabel === 'Home' && <Home size={18} strokeWidth={1.5} aria-hidden />}
            {exitLabel}
          </button>
        </motion.div>

        {slipped.length > 0 && (
          <motion.div className="mt-12" {...enter(0.2)}>
            <h3 className="label mb-2">Worth another look</h3>
            <div className="flex flex-wrap gap-2">
              {slipped.map((e) => (
                <button key={e.number} onClick={() => openDetail(e.number)} className="btn btn-secondary pl-1.5">
                  <ElementChip element={e} size={32} />
                  {e.name}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {(unlocked.length > 0 || o.masteryUp.length > 0) && (
          <motion.div className="mt-12" {...enter(0.2)}>
            {unlocked.length > 0 && (
              <>
                <h3 className="label mb-2">{unlocked.length === 1 ? 'Achievement unlocked' : `${unlocked.length} achievements unlocked`}</h3>
                <ul className="space-y-1">
                  {unlocked.map((a) => (
                    <li key={a.id} title={a.desc} className="flex items-center gap-3 rounded-control bg-surface-2 py-2 pl-2 pr-3 text-sm">
                      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-tag bg-surface text-ink-2">
                        <Icon name={a.icon} size={16} />
                      </span>
                      <span className="min-w-0 flex-1 font-medium">{a.name}</span>
                      <span className="flex items-center gap-2 text-[13px] capitalize text-ink-2">
                        <span className="dot" style={{ background: TIER_COLOR[a.tier] }} aria-hidden />
                        {a.tier}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {o.masteryUp.length > 0 && (
              <p className={`text-sm text-ink-2 ${unlocked.length > 0 ? 'mt-4' : ''}`}>
                <span className="num font-medium text-ink">{o.masteryUp.length}</span> new element{o.masteryUp.length > 1 ? 's' : ''} mastered:{' '}
                <span className="text-ink">{o.masteryUp.map((n) => byNumber(n).symbol).join(', ')}</span>
              </p>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

/** What the map under the score shows: the elements you placed, or the ones the round asked about. */
function placedWord(kind: RoundSummary['kind']) {
  return kind === 'place' || kind === 'lesson' || kind === 'daily' ? 'What you placed' : 'The elements in this round';
}

/** The one entrance on the results screen: a short fade and rise, staggered by block. */
function enter(delay: number) {
  return { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: tween(DUR.enter, delay) };
}

/**
 * Three stars, the middle one larger: gold fill with a darker gold edge, so they read as objects on the dark page.
 * They come in one after another with a small scale; confetti rises from behind them on a real celebration.
 */
function Stars({ stars, reduce, ref }: { stars: number; reduce: boolean; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className="mt-6 flex items-end justify-center gap-3" role="img" aria-label={`${stars} of 3 stars`}>
      {[0, 1, 2].map((i) => {
        const on = i < stars;
        return (
          <motion.span
            key={i}
            aria-hidden
            initial={reduce ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={tween(DUR.enter, 0.2 + i * STAGGER * 2)}
          >
            <Star
              size={i === 1 ? 52 : 40}
              strokeWidth={1.5}
              strokeLinejoin="round"
              style={on ? { fill: 'var(--star)', color: 'var(--star-line)' } : { fill: 'var(--surface-2)', color: 'var(--ink-3)' }}
            />
          </motion.span>
        );
      })}
    </div>
  );
}

/** Picks the headline from accuracy as well as stars, so a 3/10 never reads "Nicely done". */
function headlineFor(s: RoundSummary, acc: number, attempts: number) {
  if (s.timedOut) return "Time's up";
  if (!s.completed) return 'Good try';
  if (attempts > 0 && acc < 50) return 'Keep going';
  if (s.stars >= 3) return acc === 100 ? 'Flawless' : 'Brilliant';
  if (s.stars === 2) return 'Great run';
  return 'Nicely done';
}

function encouragement(s: RoundSummary, acc: number, attempts: number, hasList: boolean, total: number) {
  if (s.timedOut) return `The clock ran out with ${total - s.correct} still to place. Pause whenever you need a breather, and try again.`;
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
export function makeBackgroundInert(root: HTMLElement | null) {
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
    <motion.div
      className={`flex flex-wrap justify-center gap-1 ${className}`}
      role="img"
      aria-label={trailLabel(trail)}
      initial={animate ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={tween(DUR.enter, 0.3)}
    >
      {trail.map((t, i) => (
        <span
          key={i}
          className="grid h-6 w-6 place-items-center rounded-tag text-bg"
          style={{ background: t === 'hit' ? 'var(--good)' : t === 'hint' ? 'var(--star)' : 'var(--bad)' }}
          aria-hidden
        >
          {t === 'hit' ? <Check size={14} strokeWidth={2.5} /> : t === 'hint' ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : <X size={14} strokeWidth={2.5} />}
        </span>
      ))}
    </motion.div>
  );
}

export function shareText(s: RoundSummary, total: number) {
  const n = s.dailyKey ? dailyNumber(s.dailyKey) : 0;
  return `Periodica Daily #${n}\n${s.correct}/${total} · ${formatTime(s.timeMs)} · ${s.score.toLocaleString('en-US')} pts\n${s.trail.map((t) => TRAIL[t]).join('')}\n${location.origin}${location.pathname}#/daily`;
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
    <button onClick={share} className="btn btn-lg btn-primary col-span-2 w-full sm:w-auto sm:flex-1">
      <Share2 size={18} strokeWidth={1.5} /> {copied ? 'Copied to clipboard' : 'Share result'}
    </button>
  );
}
