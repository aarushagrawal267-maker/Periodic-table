import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Clock, RotateCcw, Sparkles, Star } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ElementTile } from '../components/ElementTile';
import { CHAPTERS, chapterById, type Chapter } from '../lib/chapters';
import { byNumber, catVar, categoryLabel, type Element } from '../lib/elements';
import { sfx } from '../lib/feedback';
import { go } from '../lib/router';
import { useProgress } from '../store/progress';
import { Game } from './Game';

export function LearnPath() {
  const chapters = useProgress((s) => s.chapters);
  const done = CHAPTERS.filter((c) => chapters[c.id]).length;
  const current = CHAPTERS.find((c) => !chapters[c.id]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <p className="text-sm font-semibold text-accent-2">Learning path</p>
      <h1 className="font-display mt-1 text-4xl font-semibold sm:text-5xl">Learn it, then play it</h1>
      <p className="mt-3 max-w-xl text-ink-2">
        {CHAPTERS.length} short chapters, about three minutes each. Flip through a few friendly cards, then drop those same elements onto the table. No timer, no pressure.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
          <motion.div className="h-full rounded-full" style={{ background: 'var(--grad)' }} initial={{ width: 0 }} animate={{ width: `${(done / CHAPTERS.length) * 100}%` }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} />
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {done}/{CHAPTERS.length}
        </span>
      </div>

      <ol className="relative mt-12">
        <div aria-hidden className="absolute bottom-10 left-[38px] top-10 w-[3px] rounded-full sm:left-1/2 sm:-translate-x-1/2" style={{ background: 'linear-gradient(var(--accent), var(--accent-2), var(--accent-3))', opacity: 0.25 }} />
        {CHAPTERS.map((c, i) => (
          <ChapterNode key={c.id} chapter={c} index={i} stars={chapters[c.id] ?? 0} current={c === current} />
        ))}
      </ol>
    </div>
  );
}

function ChapterNode({ chapter: c, index, stars, current }: { chapter: Chapter; index: number; stars: number; current: boolean }) {
  const right = index % 2 === 1;
  const done = stars > 0;
  return (
    <motion.li
      className={`relative mb-6 flex items-center gap-5 sm:mb-10 sm:gap-8 ${right ? 'sm:flex-row-reverse' : ''}`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 22, delay: Math.min(index, 8) * 0.05 }}
    >
      <a
        href={`#/learn/${c.id}`}
        className={`group relative z-10 grid h-[78px] w-[78px] shrink-0 place-items-center rounded-full text-3xl transition-transform hover:scale-105 sm:absolute sm:left-1/2 sm:-translate-x-1/2 sm:hover:scale-105 ${current ? 'pulse-ring' : ''}`}
        style={{
          background: done ? 'var(--grad)' : current ? 'radial-gradient(circle at 30% 25%, color-mix(in oklab, var(--accent-2) 22%, var(--surface-solid)), var(--surface-solid))' : 'radial-gradient(circle at 30% 25%, var(--surface-2), var(--surface-solid))',
          border: done ? 'none' : `2px solid ${current ? 'var(--accent-2)' : 'var(--line-strong)'}`,
          boxShadow: done ? '0 12px 30px -10px color-mix(in oklab, var(--accent-2) 70%, transparent)' : current ? '0 0 0 6px color-mix(in oklab, var(--accent-2) 12%, transparent), 0 14px 34px -12px color-mix(in oklab, var(--accent-2) 60%, transparent)' : 'var(--shadow-md)',
        }}
        aria-label={`Chapter ${index + 1}: ${c.title}${done ? `, completed with ${stars} stars` : current ? ', up next' : ''}`}
      >
        <span aria-hidden className={done ? 'drop-shadow' : ''}>
          {c.emoji}
        </span>
        {done && (
          <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-bg bg-good text-bg">
            <Check size={15} strokeWidth={3} />
          </span>
        )}
      </a>
      <a
        href={`#/learn/${c.id}`}
        className={`card card-hover group relative block flex-1 overflow-hidden p-5 sm:w-[calc(50%-64px)] sm:flex-none ${right ? 'sm:mr-auto' : 'sm:ml-auto'} ${current ? '!border-accent-2/50' : ''}`}
        style={current ? { boxShadow: '0 18px 50px -24px color-mix(in oklab, var(--accent-2) 70%, transparent)' } : undefined}
        tabIndex={-1}
      >
        {current && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: 'var(--grad)' }} />}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Chapter {index + 1}</span>
          {done ? (
            <span className="flex gap-0.5">
              {[0, 1, 2].map((s) => (
                <Star key={s} size={13} className={s < stars ? 'fill-gold text-gold' : 'text-line-strong'} />
              ))}
            </span>
          ) : current ? (
            <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-bg" style={{ background: 'var(--grad)' }}>
              UP NEXT
            </span>
          ) : null}
        </div>
        <h2 className="font-display mt-1.5 text-xl font-semibold transition-colors group-hover:text-ink">{c.title}</h2>
        <p className="mt-1 text-sm text-ink-2">{c.blurb}</p>
        <div className="mt-3 flex flex-wrap gap-1">
          {c.numbers.slice(0, 10).map((n) => {
            const e = byNumber(n);
            return (
              <span key={n} className="cat-chip rounded-md px-1.5 py-0.5 text-[11px] font-semibold" style={{ '--c': catVar(e.category) } as CSSProperties}>
                {e.symbol}
              </span>
            );
          })}
          {c.numbers.length > 10 && <span className="px-1 text-[11px] text-ink-3">+{c.numbers.length - 10}</span>}
        </div>
        <div className="mt-4 flex items-center gap-3 whitespace-nowrap border-t border-line pt-3 text-xs text-ink-3">
          <span className="flex items-center gap-1">
            <Clock size={12} /> ~{Math.max(2, Math.round(c.numbers.length / 4))} min
          </span>
          {c.mnemonic && (
            <span className="flex items-center gap-1">
              <Sparkles size={12} /> Memory trick
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 font-semibold text-ink-2 transition-colors group-hover:text-accent-2">
            {done ? 'Replay' : current ? 'Start' : 'Open'} <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </a>
    </motion.li>
  );
}

type Card = { kind: 'mnemonic' } | { kind: 'element'; n: number };

export function Lesson({ chapterId }: { chapterId: string }) {
  const chapter = chapterById(chapterId);
  const [phase, setPhase] = useState<'cards' | 'ready' | 'play'>('cards');
  const [round, setRound] = useState(0);
  const initialDeck = useMemo<Card[]>(() => (chapter ? [...(chapter.mnemonic ? [{ kind: 'mnemonic' as const }] : []), ...chapter.numbers.map((n) => ({ kind: 'element' as const, n }))] : []), [chapter]);
  const [deck, setDeck] = useState(initialDeck);
  const [seen, setSeen] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [exit, setExit] = useState<1 | -1>(1);

  const card = deck[0];
  const total = initialDeck.length;

  const answer = (knew: boolean) => {
    if (!card) return;
    setExit(knew ? 1 : -1);
    setFlipped(false);
    sfx.pick();
    const rest = deck.slice(1);
    // "Still learning" cards come back a little later in the deck.
    const next = knew || card.kind === 'mnemonic' ? rest : [...rest.slice(0, 2), card, ...rest.slice(2)];
    if (knew) setSeen((s) => s + 1);
    setDeck(next);
    if (next.length === 0) setPhase('ready');
  };

  useEffect(() => {
    if (phase !== 'cards') return;
    const onKey = (e: KeyboardEvent) => {
      // Let real buttons (Got it, Skip, Back) handle their own Enter/Space.
      if ((e.target as HTMLElement).closest('button, a, input')) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === 'ArrowRight') answer(true);
      else if (e.key === 'ArrowLeft') answer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!chapter) return <LearnPath />;
  const idx = CHAPTERS.indexOf(chapter);
  const next = CHAPTERS[idx + 1];

  if (phase === 'play')
    return (
      <Game
        key={round}
        config={{ kind: 'lesson', title: chapter.title, subtitle: `Chapter ${idx + 1} · put them on the table`, targets: chapter.numbers, difficulty: 'learner', regionId: chapter.id }}
        onExit={() => go('/learn')}
        onReplay={() => setRound((r) => r + 1)}
        onNext={next ? () => go(`/learn/${next.id}`, true) : () => go('/learn')}
        nextLabel={next ? `Next chapter: ${next.title}` : 'Back to the path'}
      />
    );

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 pb-8 pt-4">
      <header className="flex items-center gap-3">
        <button onClick={() => go('/learn')} className="btn-ghost grid h-10 w-10 shrink-0 place-items-center rounded-full" aria-label="Back to learning path">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-3">
            Chapter {idx + 1} · {chapter.emoji}
          </div>
          <h1 className="font-display truncate text-lg font-semibold">{chapter.title}</h1>
        </div>
        {phase === 'cards' && (
          <button onClick={() => setPhase('ready')} className="text-sm font-medium text-ink-3 hover:text-ink">
            Skip to game
          </button>
        )}
      </header>

      {phase === 'cards' && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={seen} aria-valuemax={total} aria-label="Cards learned">
          <motion.div className="h-full rounded-full" style={{ background: 'var(--grad)' }} animate={{ width: `${(seen / total) * 100}%` }} />
        </div>
      )}

      {phase === 'cards' && card ? (
        <>
          <div className="relative mt-8 flex flex-1 items-center justify-center" style={{ perspective: 1200 }}>
            <AnimatePresence mode="popLayout" custom={exit}>
              <motion.div
                key={card.kind === 'mnemonic' ? 'mnemonic' : `${card.n}-${deck.length}`}
                custom={exit}
                className="w-full max-w-sm cursor-grab touch-pan-y active:cursor-grabbing"
                drag="x"
                dragSnapToOrigin
                dragElastic={0.6}
                onDragEnd={(_, info: PanInfo) => {
                  if (info.offset.x > 110) answer(true);
                  else if (info.offset.x < -110) answer(false);
                }}
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0, x: 0, rotate: 0 }}
                variants={{ out: (d: number) => ({ opacity: 0, x: d * 320, rotate: d * 12, transition: { duration: 0.3 } }) }}
                exit="out"
                transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                whileDrag={{ rotate: 4 }}
              >
                {card.kind === 'mnemonic' ? <MnemonicCard chapter={chapter} /> : <FlipCard e={byNumber(card.n)} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />}
              </motion.div>
            </AnimatePresence>
          </div>
          <p className="mt-6 text-balance text-center text-xs text-ink-3">{card.kind === 'mnemonic' ? 'Say it out loud three times. Seriously, it works.' : 'Tap to flip · swipe right if you knew it, left to see it again'}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button onClick={() => answer(false)} className="btn-ghost flex h-14 items-center justify-center gap-2 rounded-2xl font-medium" disabled={card.kind === 'mnemonic'} style={card.kind === 'mnemonic' ? { opacity: 0.4 } : undefined}>
              <RotateCcw size={17} /> Still learning
            </button>
            <button onClick={() => answer(true)} className="btn-primary flex h-14 items-center justify-center gap-2 rounded-2xl">
              <Check size={18} /> {card.kind === 'mnemonic' ? 'Got the trick' : 'Got it'}
            </button>
          </div>
        </>
      ) : (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex -space-x-3">
            {chapter.numbers.slice(0, 6).map((n, i) => (
              <motion.div key={n} className="h-16 w-16" initial={{ y: 20, opacity: 0, rotate: -10 }} animate={{ y: 0, opacity: 1, rotate: (i - 2.5) * 5 }} transition={{ delay: i * 0.06, type: 'spring', damping: 14 }}>
                <ElementTile element={byNumber(n)} size={64} showName={false} />
              </motion.div>
            ))}
          </div>
          <h2 className="font-display mt-8 text-3xl font-semibold">Now put them on the table</h2>
          <p className="mt-2 max-w-sm text-ink-2">Drag each element to its home. No clock, colour hints on, and the lightbulb shows you the way if you get stuck.</p>
          <button
            onClick={() => setPhase('play')}
            className="btn-primary shine mt-8 flex h-14 w-full max-w-xs items-center justify-center gap-2 rounded-2xl text-lg"
          >
            Let's go <ArrowRight size={20} />
          </button>
          <button
            onClick={() => {
              setDeck(initialDeck);
              setSeen(0);
              setPhase('cards');
            }}
            className="mt-4 text-sm font-medium text-ink-3 hover:text-ink"
          >
            Review the cards again
          </button>
        </motion.div>
      )}
    </div>
  );
}

/** Shared card height: grows with the viewport, never smaller than a comfortable read. */
const CARD_H = 'h-[clamp(430px,calc(100dvh-300px),520px)]';

function FlipCard({ e, flipped, onFlip }: { e: Element; flipped: boolean; onFlip: () => void }) {
  const c = catVar(e.category);
  const face = 'absolute inset-0 flex flex-col overflow-hidden rounded-[28px] border [backface-visibility:hidden]';
  return (
    <button onClick={onFlip} className={`relative block ${CARD_H} w-full text-left`} aria-label={flipped ? `${e.name} details. Tap to flip back.` : `${e.name}. Tap to flip for facts.`} style={{ '--c': c } as CSSProperties}>
      <motion.div className="relative h-full w-full [transform-style:preserve-3d]" animate={{ rotateY: flipped ? 180 : 0 }} transition={{ type: 'spring', damping: 20, stiffness: 180 }}>
        <div className={`${face} solid items-center justify-center p-6 text-center`} style={{ borderColor: `color-mix(in oklab, ${c} 35%, transparent)`, boxShadow: `0 30px 60px -30px color-mix(in oklab, ${c} 60%, transparent)` }}>
          <div className="pointer-events-none absolute inset-0 rounded-[28px] opacity-30" style={{ background: `radial-gradient(80% 60% at 50% 0%, ${c}, transparent 70%)` }} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-10" style={{ background: `radial-gradient(60% 80% at 50% 100%, ${c}, transparent 70%)` }} />
          <span className="cat-chip relative mb-5 rounded-full px-3 py-1 text-xs font-semibold">{categoryLabel(e.category)}</span>
          <div className="relative h-40 w-40 drop-shadow-[0_18px_30px_rgb(0_0_0/0.35)]">
            <ElementTile element={e} size={160} />
          </div>
          <h2 className="font-display relative mt-6 text-4xl font-semibold">{e.name}</h2>
          <p className="relative mt-1.5 text-sm font-medium text-ink-2">
            Group {e.group ?? '—'} · Period {e.period}
          </p>
          <p className="absolute inset-x-0 bottom-5 flex items-center justify-center gap-1.5 text-xs font-medium text-ink-3">
            <RotateCcw size={12} className="-scale-x-100" /> Tap to flip
          </p>
        </div>
        <div className={`${face} solid [transform:rotateY(180deg)]`} style={{ borderColor: `color-mix(in oklab, ${c} 35%, transparent)` }}>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 opacity-20" style={{ background: `radial-gradient(80% 100% at 50% 0%, ${c}, transparent 70%)` }} />
          <div className="relative flex items-center gap-3 px-6 pb-4 pt-6">
            <div className="h-12 w-12 shrink-0">
              <ElementTile element={e} size={48} showName={false} />
            </div>
            <div className="min-w-0">
              <div className="font-display truncate text-2xl font-semibold leading-tight">{e.name}</div>
              <div className="cat-ink text-xs font-semibold">{categoryLabel(e.category)}</div>
            </div>
          </div>
          {/* The facts scroll if they are long; the fade tells you there is more. */}
          <div className="thin-scroll relative flex-1 overflow-y-auto px-6 pb-6 [mask-image:linear-gradient(to_bottom,black_calc(100%-36px),transparent)]">
            {e.uses.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {e.uses.map((u) => (
                  <span key={u} className="cat-chip rounded-full px-2.5 py-1 text-xs font-medium">
                    {u}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-4 text-[15px] leading-relaxed text-ink">{e.summary}</p>
            <div className="mt-4 rounded-2xl border p-3.5 text-[15px] leading-relaxed" style={{ background: `color-mix(in oklab, ${c} 9%, transparent)`, borderColor: `color-mix(in oklab, ${c} 22%, transparent)` }}>
              <div className="cat-ink mb-1 text-xs font-bold uppercase tracking-wider">
                <span aria-hidden>💡 </span>Fun fact
              </div>
              {e.fact}
            </div>
            <div className="h-4" aria-hidden />
          </div>
        </div>
      </motion.div>
    </button>
  );
}

function MnemonicCard({ chapter }: { chapter: Chapter }) {
  const words = chapter.mnemonic!;
  // Long rhymes get tighter rows; the card also grows rather than clipping.
  const dense = words.length > 7;
  return (
    <div className={`solid relative flex min-h-[clamp(430px,calc(100dvh-300px),520px)] flex-col overflow-hidden rounded-[28px] border border-line p-5 sm:p-6`} style={{ boxShadow: 'var(--shadow-lg)' }}>
      <div className="pointer-events-none absolute inset-0 opacity-25" style={{ background: 'radial-gradient(80% 50% at 50% 0%, var(--accent), transparent 70%)' }} />
      <div className="relative flex items-center gap-2 text-sm font-semibold text-accent-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-2/15">
          <Sparkles size={15} />
        </span>
        Memory trick
      </div>
      <p className="relative mt-2 text-sm text-ink-2">The first letters spell the elements in order.</p>
      <ol className={`relative mt-4 flex flex-1 flex-col justify-center ${dense ? 'gap-1.5' : 'gap-2.5'}`}>
        {words.map(([word, symbol], i) => {
          const e = byNumber(chapter.numbers[i]);
          return (
            <motion.li key={word + i} className="flex items-center gap-3" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.07 }}>
              <span className={`cat-chip grid shrink-0 place-items-center rounded-lg font-bold h-8 w-11 text-sm`} style={{ '--c': catVar(e.category) } as CSSProperties}>
                {symbol}
              </span>
              <span className="font-display text-xl font-semibold leading-tight">
                <Highlight word={word} symbol={symbol} />
              </span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

/** Highlights the letters of the word that match the symbol. */
function Highlight({ word, symbol }: { word: string; symbol: string }) {
  const lower = word.toLowerCase();
  const s = symbol.toLowerCase();
  if (lower.startsWith(s)) {
    return (
      <>
        <span className="text-grad">{word.slice(0, s.length)}</span>
        {word.slice(s.length)}
      </>
    );
  }
  const i = lower.indexOf(s);
  if (i >= 0)
    return (
      <>
        {word.slice(0, i)}
        <span className="text-grad">{word.slice(i, i + s.length)}</span>
        {word.slice(i + s.length)}
      </>
    );
  return (
    <>
      <span className="text-grad">{word[0]}</span>
      {word.slice(1)}
    </>
  );
}
