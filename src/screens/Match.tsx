import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ElementTile } from '../components/ElementTile';
import { Results } from '../components/Results';
import { Elapsed } from '../components/Stats';
import { byNumber, catVar } from '../lib/elements';
import { haptic, sfx } from '../lib/feedback';
import { buildDeck, matchScore, matchStars, pickPairs, MATCH_PAIRS } from '../lib/match';
import { go } from '../lib/router';
import { useProgress, type RoundOutcome, type RoundSummary } from '../store/progress';
import { useSettings } from '../store/settings';
import { announceAchievements } from '../store/ui';

export function Match() {
  const [round, setRound] = useState(0);
  return <MatchRound key={round} onReplay={() => setRound((r) => r + 1)} />;
}

function MatchRound({ onReplay }: { onReplay: () => void }) {
  const mastery = useProgress((s) => s.mastery);
  const recordRound = useProgress((s) => s.recordRound);
  const difficulty = useSettings((s) => s.difficulty);
  const pairs = useMemo(() => pickPairs(mastery), []); // eslint-disable-line react-hooks/exhaustive-deps
  const deck = useMemo(() => buildDeck(pairs), [pairs]);
  const [open, setOpen] = useState<string[]>([]);
  const [found, setFound] = useState<Set<number>>(new Set());
  const [slipped, setSlipped] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [endedAt, setEndedAt] = useState(0);
  const [result, setResult] = useState<{ summary: RoundSummary; outcome: RoundOutcome } | null>(null);
  const [announce, setAnnounce] = useState('');
  const busy = useRef(false);

  const flip = (id: string) => {
    if (busy.current || open.includes(id) || result) return;
    const card = deck.find((c) => c.id === id)!;
    if (found.has(card.element)) return;
    if (!startedAt) setStartedAt(Date.now());
    sfx.pick();
    const next = [...open, id];
    setOpen(next);
    if (next.length < 2) {
      setAnnounce(`${card.face === 'symbol' ? 'Symbol' : 'Name'}: ${card.face === 'symbol' ? byNumber(card.element).symbol : byNumber(card.element).name}`);
      return;
    }
    setMoves((m) => m + 1);
    const [a, b] = next.map((x) => deck.find((c) => c.id === x)!);
    if (a.element === b.element) {
      const f = new Set(found).add(a.element);
      setFound(f);
      setOpen([]);
      setStreak((s) => {
        setMaxStreak((m) => Math.max(m, s + 1));
        return s + 1;
      });
      sfx.hit(f.size - 1);
      haptic(12);
      setAnnounce(`Match! ${byNumber(a.element).name} is ${byNumber(a.element).symbol}.`);
      if (f.size === pairs.length) setEndedAt(Date.now());
    } else {
      busy.current = true;
      setStreak(0);
      setSlipped((s) => new Set(s).add(a.element).add(b.element));
      sfx.miss();
      setAnnounce(`No match: ${byNumber(a.element).name} and ${byNumber(b.element).name}.`);
      setTimeout(() => {
        setOpen([]);
        busy.current = false;
      }, 900);
    }
  };

  useEffect(() => {
    if (!endedAt || result) return;
    const ms = endedAt - startedAt;
    const results: Record<number, boolean> = {};
    for (const n of pairs) results[n] = !slipped.has(n);
    const summary: RoundSummary = {
      kind: 'match',
      difficulty,
      score: matchScore(moves, ms / 1000, pairs.length),
      correct: pairs.length,
      mistakes: moves - pairs.length,
      hints: 0,
      timeMs: ms,
      maxCombo: maxStreak,
      stars: matchStars(moves, pairs.length),
      completed: true,
      results,
      trail: pairs.map((n) => (slipped.has(n) ? 'miss' : 'hit')),
    };
    const outcome = recordRound(summary);
    setTimeout(() => {
      if (summary.stars === 3) sfx.win();
      setResult({ summary, outcome });
      announceAchievements(outcome.unlocked);
    }, 700);
  }, [endedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-8 pt-4 sm:px-5">
      <header className="flex items-center gap-3">
        <button onClick={() => go('/play')} className="btn-ghost grid h-10 w-10 shrink-0 place-items-center rounded-full" aria-label="Leave">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-semibold">Match Pairs</h1>
          <p className="text-xs text-ink-3">Pair each symbol with its name</p>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-ink-3">Pairs</div>
            <div className="font-display font-semibold tabular-nums">
              {found.size}/{pairs.length}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-ink-3">Moves</div>
            <div className="font-display font-semibold tabular-nums">{moves}</div>
          </div>
          <div className="hidden sm:block">
            <div className="text-[10px] font-medium uppercase tracking-wider text-ink-3">Time</div>
            <div className="font-display font-semibold">
              <Elapsed start={startedAt} end={endedAt} running={!!startedAt && !endedAt} />
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col justify-center py-6">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4" role="grid" aria-label={`${MATCH_PAIRS * 2} face-down cards`}>
          {deck.map((card, i) => {
            const e = byNumber(card.element);
            const isFound = found.has(card.element);
            const faceUp = isFound || open.includes(card.id);
            const c = catVar(e.category);
            return (
              <motion.button
                key={card.id}
                onClick={() => flip(card.id)}
                className="group relative aspect-[4/5] w-full rounded-2xl"
                style={{ perspective: 800 } as CSSProperties}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: i * 0.03, type: 'spring', damping: 18 }}
                aria-label={faceUp ? `${card.face === 'symbol' ? e.symbol : e.name}${isFound ? ', matched' : ''}` : `Card ${i + 1}, face down`}
                disabled={isFound}
              >
                <motion.div className="relative h-full w-full [transform-style:preserve-3d]" animate={{ rotateY: faceUp ? 180 : 0 }} transition={{ type: 'spring', damping: 18, stiffness: 220 }}>
                  <div className="absolute inset-0 grid place-items-center overflow-hidden rounded-2xl border border-line shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] transition-[border-color,filter] duration-200 [backface-visibility:hidden] group-hover:border-line-strong group-hover:brightness-110" style={{ background: 'linear-gradient(145deg, color-mix(in oklab, var(--accent) 22%, var(--surface-solid)), color-mix(in oklab, var(--accent-2) 14%, var(--surface-solid)))' }}>
                    <div aria-hidden className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(color-mix(in oklab, var(--ink) 22%, transparent) 1px, transparent 1.5px)', backgroundSize: '12px 12px', maskImage: 'radial-gradient(circle at 50% 50%, transparent 28%, black 75%)' }} />
                    <div aria-hidden className="absolute inset-2 rounded-xl border border-dashed border-line-strong" />
                    <span className="font-display text-grad relative grid h-11 w-11 place-items-center rounded-full border border-line-strong bg-bg/40 text-xl font-bold transition-transform duration-300 group-hover:scale-110">?</span>
                  </div>
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border p-2 text-center [backface-visibility:hidden] [transform:rotateY(180deg)]"
                    style={{
                      background: isFound ? `color-mix(in oklab, ${c} 18%, var(--surface-solid))` : 'var(--surface-solid)',
                      borderColor: isFound ? c : 'var(--line-strong)',
                      boxShadow: isFound ? `0 10px 30px -12px ${c}` : undefined,
                    }}
                  >
                    {card.face === 'symbol' ? (
                      <div className="aspect-square w-3/4">
                        <ElementTile element={e} size={72} showName={false} showNumber={difficulty === 'learner'} color={isFound || difficulty === 'learner' ? undefined : 'var(--accent-2)'} />
                      </div>
                    ) : (
                      <span className={`font-display text-base font-semibold leading-tight sm:text-lg ${isFound ? 'cat-ink' : ''}`} style={{ '--c': c } as CSSProperties}>
                        {e.name}
                      </span>
                    )}
                  </div>
                </motion.div>
              </motion.button>
            );
          })}
        </div>
        <p className="mt-6 text-center text-sm text-ink-3">{streak >= 2 ? `🔥 ${streak} in a row!` : 'Flip two cards. Find the symbol that goes with each name.'}</p>
      </main>
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>

      {result && <Results summary={result.summary} outcome={result.outcome} title="Match Pairs" total={pairs.length} onReplay={onReplay} onExit={() => go('/')} />}
    </div>
  );
}
