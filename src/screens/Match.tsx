import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ElementTile } from '../components/ElementTile';
import { DUR, rise, tween } from '../components/motion';
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
      setAnnounce(`Pair found: ${byNumber(a.element).name} is ${byNumber(a.element).symbol}`);
      if (f.size === pairs.length) setEndedAt(Date.now());
    } else {
      busy.current = true;
      setStreak(0);
      setSlipped((s) => new Set(s).add(a.element).add(b.element));
      sfx.miss();
      setAnnounce(`No match: ${byNumber(a.element).name} and ${byNumber(b.element).name}`);
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
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-8 pt-2 sm:px-6">
      <header className="flex min-h-14 items-center gap-3 py-1">
        <button onClick={() => go('/play')} className="icon-btn -ml-2" aria-label="Leave">
          <ArrowLeft size={18} strokeWidth={1.5} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-medium leading-6">Match pairs</h1>
          <p className="text-balance text-[13px] leading-5 text-ink-3">Pair each symbol with its name</p>
        </div>
        <dl className="flex gap-5 text-right">
          <div>
            <dt className="text-xs leading-4 text-ink-3">Pairs</dt>
            <dd className="num text-[17px] font-medium leading-6">
              {found.size}/{pairs.length}
            </dd>
          </div>
          <div>
            <dt className="text-xs leading-4 text-ink-3">Moves</dt>
            <dd className="num text-[17px] font-medium leading-6">{moves}</dd>
          </div>
          <div className="hidden sm:block">
            <dt className="text-xs leading-4 text-ink-3">Time</dt>
            <dd className="num text-[17px] font-medium leading-6">
              <Elapsed start={startedAt} end={endedAt} running={!!startedAt && !endedAt} />
            </dd>
          </div>
        </dl>
      </header>

      <main className="flex flex-1 flex-col justify-center py-8">
        <motion.div {...rise} className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4" role="group" aria-label={`${MATCH_PAIRS * 2} cards`}>
          {deck.map((card, i) => {
            const e = byNumber(card.element);
            const isFound = found.has(card.element);
            const faceUp = isFound || open.includes(card.id);
            const c = catVar(e.category);
            return (
              <button
                key={card.id}
                onClick={() => flip(card.id)}
                className="group relative aspect-[4/5] w-full rounded-card transition-transform duration-150 ease-out active:scale-[0.98]"
                style={{ perspective: 800 } as CSSProperties}
                aria-label={faceUp ? `${card.face === 'symbol' ? e.symbol : e.name}${isFound ? ', matched' : ''}` : `Card ${i + 1}, face down`}
                // aria-disabled, not disabled, so a card matched from the keyboard keeps focus (WCAG 2.4.3). flip() ignores it.
                aria-disabled={isFound || undefined}
              >
                <motion.div className="relative h-full w-full [transform-style:preserve-3d]" initial={false} animate={{ rotateY: faceUp ? 180 : 0 }} transition={tween(DUR.enter)}>
                  {/* Back: a plain raised card with one hairline and an empty place from the table, so it never reads as a symbol. */}
                  <div className="absolute inset-0 grid place-items-center rounded-card border border-line bg-surface-2 transition-colors duration-150 ease-out light:bg-surface light:shadow-[var(--shadow-sm)] [backface-visibility:hidden] group-hover:border-line-strong">
                    <span aria-hidden className="slot h-7 w-7 rounded-tag" />
                  </div>
                  {/* Face: the brighter card stock (raised on dark, white on light); a found pair takes its element's printed colour. */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center rounded-card border bg-surface-2 p-3 text-center light:bg-surface [backface-visibility:hidden] [transform:rotateY(180deg)]"
                    style={{
                      background: isFound ? `color-mix(in oklab, ${c} var(--tile-tint), var(--surface))` : undefined,
                      borderColor: isFound ? `color-mix(in oklab, ${c} var(--tile-edge), transparent)` : 'var(--line-strong)',
                    }}
                  >
                    {card.face === 'symbol' ? (
                      <div className="aspect-square w-3/4">
                        <ElementTile element={e} size={72} showName={false} quietNumber showNumber={difficulty === 'learner'} color={isFound || difficulty === 'learner' ? undefined : 'var(--ink-2)'} />
                      </div>
                    ) : (
                      <span className={`text-base font-medium leading-tight sm:text-lg ${isFound ? 'cat-ink' : 'text-ink'}`} style={{ '--c': c } as CSSProperties}>
                        {e.name}
                      </span>
                    )}
                  </div>
                </motion.div>
              </button>
            );
          })}
        </motion.div>
        <p className={`mt-6 text-center text-sm ${streak >= 2 ? 'num text-ink-2' : 'text-ink-3'}`}>{streak >= 2 ? `${streak} in a row` : 'Flip two cards. Find the symbol that goes with each name.'}</p>
      </main>
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>

      {result && <Results summary={result.summary} outcome={result.outcome} title="Match pairs" total={pairs.length} onReplay={onReplay} onExit={() => go('/')} exitLabel="Home" />}
    </div>
  );
}
