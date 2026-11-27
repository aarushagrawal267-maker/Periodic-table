import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Eye, EyeOff, RotateCcw, Star } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ElementChip, ElementTile } from '../components/ElementTile';
import { MiniTable } from '../components/MiniTable';
import { SectionHeader } from '../components/SectionHeader';
import { DUR, rise, tween } from '../components/motion';
import { CHAPTERS, chapterById, type Chapter } from '../lib/chapters';
import { CATEGORIES, byNumber, catVar, categoryLabel, type Element } from '../lib/elements';
import { sfx } from '../lib/feedback';
import { dueForReview } from '../lib/review';
import { go } from '../lib/router';
import { useProgress } from '../store/progress';
import { Game } from './Game';

export function LearnPath() {
  const chapters = useProgress((s) => s.chapters);
  const mastery = useProgress((s) => s.mastery);
  const due = useMemo(() => dueForReview(mastery), [mastery]);
  const done = CHAPTERS.filter((c) => chapters[c.id]).length;
  const current = CHAPTERS.find((c) => !chapters[c.id]);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-16">
      <header className="lg:sticky lg:top-28 lg:self-start">
        <h1 className="t-title">Learn it, then play it</h1>
        <p className="mt-3 max-w-xl text-ink-2">
          {CHAPTERS.length} short chapters, about three minutes each. Flip through a few cards, then place those same elements on the table. No timer, no pressure.
        </p>
        <div className="mt-4 max-w-xl lg:mt-6">
          <div className="flex items-baseline justify-between gap-4">
            <span className="label">Chapters done</span>
            <span className="meta">
              {done} of {CHAPTERS.length}
            </span>
          </div>
          <div className="meter mt-2" role="progressbar" aria-label="Chapters done" aria-valuenow={done} aria-valuemin={0} aria-valuemax={CHAPTERS.length}>
            <div className="meter-fill" style={{ transform: `scaleX(${done / CHAPTERS.length})` }} />
          </div>
        </div>
      </header>

      <div className="mt-8 lg:mt-0">
        {(current || due.length > 0) && (
          <div className="mb-12 flex flex-col gap-3 md:mb-16 md:gap-4">
            {current && <UpNext chapter={current} index={CHAPTERS.indexOf(current)} />}
            {due.length > 0 && <ReviewBanner due={due} />}
          </div>
        )}
        <section aria-labelledby="all-chapters">
          <SectionHeader id="all-chapters" title="All chapters" />
          <ol className="border-b border-line">
            {CHAPTERS.map((c, i) => (
              <ChapterRow key={c.id} chapter={c} index={i} stars={chapters[c.id] ?? 0} current={c === current} />
            ))}
          </ol>
        </section>
        <TableStory />
      </div>
    </div>
  );
}

/** A short history of the periodic table, with the whole table drawn in category colours. */
function TableStory() {
  const hl = 'font-medium text-ink';
  return (
    <section className="mt-12 md:mt-16" aria-labelledby="table-story">
      <SectionHeader id="table-story" title="The periodic table" sub="Where the table you are learning comes from" />
      <div className="card overflow-hidden">
        <div className="space-y-3 p-4 leading-relaxed text-ink-2 sm:p-6">
          <p>
            The periodic table arranges the chemical elements by their <span className={hl}>atomic numbers</span>, <span className={hl}>electron configurations</span> and recurring{' '}
            <span className={hl}>chemical properties</span>. Elements appear in order of increasing atomic number. The standard table has <span className={hl}>18 columns</span> (groups) and{' '}
            <span className={hl}>7 rows</span> (periods), with a double row of elements, the lanthanides and actinides, set out underneath.
          </p>
          <p>
            It took more than <span className={hl}>200 years</span> and many scientists to develop. The modern table is based on <span className={hl}>Dmitri Mendeleev's 1869</span> design, which left gaps for elements nobody had found yet and correctly predicted their properties.
          </p>
        </div>
        <figure className="border-t border-line p-4 sm:p-6">
          <MiniTable className="w-full" label="The full periodic table, coloured by element category" />
          <figcaption className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[13px] leading-5 text-ink-2">
            {CATEGORIES.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-2">
                <span className="dot" style={{ background: catVar(c.id) }} aria-hidden />
                {c.label}
              </span>
            ))}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

/** Spaced review: elements you met a while ago (or slipped on) are ready to refresh. */
function ReviewBanner({ due }: { due: number[] }) {
  const label = `${due.length} ${due.length === 1 ? 'element' : 'elements'} ready for a quick review`;
  return (
    <a href="#/learn/review" className="card card-link group flex items-center gap-4 p-4 sm:p-6">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        <span className="mt-1 block text-sm text-ink-2">A few cards, then a short game on the table</span>
        <span aria-hidden className="mt-3 flex flex-wrap items-center gap-1">
          {/* Six chips below 360px and eight above, so the row never leaves one or two on a line of their own. */}
          {due.slice(0, 8).map((n, i) => (
            <ElementChip key={n} element={byNumber(n)} size={28} className={i >= 6 ? 'max-[359px]:hidden' : ''} />
          ))}
          {due.length > 6 && <span className="meta pl-1 min-[360px]:hidden">+{due.length - 6}</span>}
          {due.length > 8 && <span className="meta pl-1 max-[359px]:hidden">+{due.length - 8}</span>}
        </span>
      </span>
      <ArrowRight aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-ink-3 transition-colors group-hover:text-ink" />
    </a>
  );
}

/** Minutes a chapter takes: about four elements a minute, never less than two. */
const minutes = (c: Chapter) => Math.max(2, Math.round(c.numbers.length / 4));

/** The chapter to do next, lifted out of the list: its elements, its length and one clear way in. */
function UpNext({ chapter: c, index }: { chapter: Chapter; index: number }) {
  const shown = c.numbers.slice(0, 8);
  return (
    <a
      href={`#/learn/${c.id}`}
      className="card card-link block p-4 sm:p-6"
      aria-label={`Start chapter ${index + 1}: ${c.title}, up next`}
    >
      <p className="label">Up next · chapter {index + 1}</p>
      <h2 className="t-heading mt-1">{c.title}</h2>
      <p className="mt-1 max-w-2xl text-[15px] leading-6 text-ink-2">{c.blurb}</p>
      <span aria-hidden className="mt-4 flex flex-wrap items-center gap-1">
        {shown.map((n) => (
          <ElementChip key={n} element={byNumber(n)} size={32} />
        ))}
        {c.numbers.length > shown.length && <span className="meta pl-1">+{c.numbers.length - shown.length}</span>}
      </span>
      <span aria-hidden className="meta mt-4 block">
        {c.numbers.length} elements · {minutes(c)} min{c.mnemonic ? ' · memory trick' : ''}
      </span>
      <span aria-hidden className="btn btn-primary mt-5 w-full sm:w-auto">
        Start chapter {index + 1} <ArrowRight size={18} strokeWidth={1.5} />
      </span>
    </a>
  );
}

/**
 * One row of the contents page, the same for every chapter: number, title, one line on what it covers,
 * and its state on the right (stars when done, "Up next", or how long it takes). Every row is one height.
 */
function ChapterRow({ chapter: c, index, stars, current }: { chapter: Chapter; index: number; stars: number; current: boolean }) {
  return (
    <li className="border-t border-line">
      <a
        href={`#/learn/${c.id}`}
        className="group -mx-4 flex h-[88px] items-center gap-3 px-4 transition-colors hover:bg-surface sm:mx-0 sm:h-[72px] sm:gap-6 sm:rounded-control sm:px-5"
        aria-label={`Chapter ${index + 1}: ${c.title}${stars ? `, completed with ${stars} stars` : ''}`}
      >
        <span aria-hidden className={`mono w-6 shrink-0 text-[15px] leading-6 ${current ? 'text-accent' : 'text-ink-3'}`}>
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium leading-6">{c.title}</span>
          <span className="line-clamp-2 text-sm leading-5 text-ink-2 sm:line-clamp-1">{c.blurb}</span>
        </span>
        {/* On phones the state column exists only on rows that have a state, so the other summaries get the width. */}
        <span className={`${stars || current ? 'flex w-14' : 'hidden sm:flex'} shrink-0 justify-end sm:w-auto`}>
          {stars ? (
            <ChapterStars stars={stars} />
          ) : current ? (
            <span className="text-sm leading-6 text-ink-2">Up next</span>
          ) : (
            <span aria-hidden className="meta hidden sm:block">
              {c.numbers.length} elements · {minutes(c)} min
            </span>
          )}
        </span>
        <ChevronRight aria-hidden size={16} strokeWidth={1.5} className="shrink-0 text-ink-3 transition-colors group-hover:text-ink" />
      </a>
    </li>
  );
}

/** Three small stars for a chapter you have done. */
function ChapterStars({ stars }: { stars: number }) {
  return (
    <span aria-hidden className="flex h-6 shrink-0 items-center gap-0.5">
      {[0, 1, 2].map((s) => (
        <Star
          key={s}
          size={14}
          strokeWidth={1.5}
          style={s < stars ? { fill: 'var(--star)', color: 'var(--star-line)' } : { fill: 'none', color: 'var(--ink-3)' }}
        />
      ))}
    </span>
  );
}

type Card = { kind: 'mnemonic' } | { kind: 'element'; n: number };

/** What a lesson teaches: a chapter of the path, or the spaced-review deck. */
interface LessonPlan {
  /** Saved with the round, so chapter stars land on the right chapter. */
  regionId: string;
  title: string;
  kicker: string;
  /** The count after the kicker; dropped below 360px, where the meter beside the card already gives it. */
  kickerCount: string;
  subtitle: string;
  numbers: number[];
  /** Chapter whose memory trick opens the deck, if it has one. */
  trick?: Chapter;
}

/** The first sentence of a summary: enough to remember, short enough to read in a breath. */
function firstSentence(text: string) {
  const m = text.match(/^[\s\S]*?[.!?](?=\s+[A-Z("']|\s*$)/);
  return (m ? m[0] : text).trim();
}

/** Spell a symbol letter by letter so screen readers say "N a", not "na". */
const spell = (symbol: string) => symbol.split('').join(' ');

/** Lesson controls that keep the arrow-key shortcuts working while focused. */
const LESSON_KEYS = '[data-lesson-keys]';

export function Lesson({ chapterId }: { chapterId: string }) {
  const isReview = chapterId === 'review';
  // The review deck is fixed when the lesson opens, so it does not reshuffle once the game updates mastery.
  const [reviewNumbers] = useState(() => (isReview ? dueForReview(useProgress.getState().mastery) : []));
  const chaptersDone = useProgress((s) => s.chapters);
  const chapter = isReview ? undefined : chapterById(chapterId);
  const idx = chapter ? CHAPTERS.indexOf(chapter) : -1;

  const plan = useMemo<LessonPlan | null>(() => {
    if (isReview)
      return {
        regionId: 'review',
        title: 'Quick review',
        kicker: 'Spaced review',
        kickerCount: ` · ${reviewNumbers.length} ${reviewNumbers.length === 1 ? 'element' : 'elements'}`,
        subtitle: 'Quick review · put them back on the table',
        numbers: reviewNumbers,
      };
    if (!chapter) return null;
    return {
      regionId: chapter.id,
      title: chapter.title,
      kicker: `Chapter ${idx + 1}`,
      kickerCount: ` · ${chapter.numbers.length} elements`,
      subtitle: `Chapter ${idx + 1} · put them on the table`,
      numbers: chapter.numbers,
      trick: chapter.mnemonic ? chapter : undefined,
    };
  }, [isReview, reviewNumbers, chapter, idx]);

  // After a chapter: the one after it. After a review: the first chapter you have not finished.
  const next = chapter ? CHAPTERS[idx + 1] : CHAPTERS.find((c) => !chaptersDone[c.id]);

  const [phase, setPhase] = useState<'cards' | 'ready' | 'play'>('cards');
  const [round, setRound] = useState(0);
  const initialDeck = useMemo<Card[]>(() => (plan ? [...(plan.trick ? [{ kind: 'mnemonic' as const }] : []), ...plan.numbers.map((n) => ({ kind: 'element' as const, n }))] : []), [plan]);
  const [deck, setDeck] = useState(initialDeck);
  const [seen, setSeen] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [exit, setExit] = useState<1 | -1>(1);
  /** Bumps on every answer: keys the card animation and focus moves, even when the same card comes straight back. */
  const [turn, setTurn] = useState(0);
  const [announce, setAnnounce] = useState('');
  const flipRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef(false);
  const retry = useRef(new Set<number>());

  const card = deck[0];
  const total = initialDeck.length;
  const position = Math.max(1, Math.min(total, total - deck.length + 1));

  /** Polite announcement. Repeating the same text still gets read out. */
  const say = (msg: string) => setAnnounce((prev) => (prev === msg ? `${msg} ` : msg));

  const flip = () => {
    if (card?.kind !== 'element') return;
    const e = byNumber(card.n);
    setFlipped((f) => !f);
    say(flipped ? 'Question side' : `Answer: ${e.name}. ${e.summary ? firstSentence(e.summary) : ''}`);
  };

  const answer = (knew: boolean) => {
    if (!card) return;
    if (!knew && card.kind === 'mnemonic') return;
    setExit(knew ? 1 : -1);
    setFlipped(false);
    sfx.pick();
    const rest = deck.slice(1);
    // "Still learning" cards come back a little later in the deck.
    const nextDeck = knew || card.kind === 'mnemonic' ? rest : [...rest.slice(0, 2), card, ...rest.slice(2)];
    if (card.kind === 'element') {
      if (knew) retry.current.delete(card.n);
      else retry.current.add(card.n);
    }
    if (knew) setSeen((s) => s + 1);
    setDeck(nextDeck);
    setTurn((t) => t + 1);
    moveFocus.current = true;
    const upcoming = nextDeck[0];
    if (!upcoming) {
      setPhase('ready');
      say('All cards done. Time for the game.');
    } else if (upcoming.kind === 'element') {
      const e = byNumber(upcoming.n);
      const pos = Math.max(1, Math.min(total, total - nextDeck.length + 1));
      const again = retry.current.has(e.number) ? ', one more try' : '';
      say(`Card ${pos} of ${total}${again}. What's this element called? Symbol ${spell(e.symbol)}, atomic number ${e.number}.`);
    }
  };

  // Keep keyboard users in place: the new card's flip button, or the start button once the deck is done.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    const target = phase === 'ready' ? startRef.current : flipRef.current;
    target?.focus({ preventScroll: true });
  }, [turn, phase]);

  useEffect(() => {
    if (phase !== 'cards') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      // Never hijack typing, or anything inside an open sheet or dialog.
      if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      const onControl = !!target.closest('button, a, input');
      if (e.key === ' ' || e.key === 'Enter') {
        // Real buttons and links handle their own Enter/Space.
        if (onControl) return;
        e.preventDefault();
        flip();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        // Arrows skip buttons and links, except the card's own controls, so the shortcut keeps working after a flip.
        if (onControl && !target.closest(LESSON_KEYS)) return;
        e.preventDefault();
        answer(e.key === 'ArrowRight');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!plan) return <LearnPath />;

  if (phase === 'play')
    return (
      <Game
        key={round}
        config={{ kind: 'lesson', title: plan.title, subtitle: plan.subtitle, targets: plan.numbers, difficulty: 'learner', regionId: plan.regionId }}
        onExit={() => go('/learn')}
        exitLabel="Back to path"
        onReplay={() => setRound((r) => r + 1)}
        onNext={next ? () => go(`/learn/${next.id}`, true) : () => go('/learn')}
        nextLabel={next ? `Next chapter: ${next.title}` : 'Back to the path'}
      />
    );

  const empty = plan.numbers.length === 0;

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pb-6 sm:px-6">
      <header className="flex min-h-14 items-center gap-2 py-1">
        <button onClick={() => go('/learn')} className="icon-btn -ml-3" aria-label="Back to learning path">
          <ArrowLeft size={18} strokeWidth={1.5} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="meta truncate">
            {empty ? (
              'Spaced review'
            ) : (
              <>
                {plan.kicker}
                <span className="max-[359px]:hidden">{plan.kickerCount}</span>
              </>
            )}
          </div>
          <h1 className="text-balance text-base font-medium leading-6">{plan.title}</h1>
        </div>
        {phase === 'cards' && !empty && (
          // Below 360px the button reads "Skip", so a two-word chapter title keeps one line and the card keeps its height.
          <button onClick={() => setPhase('ready')} className="btn btn-quiet -mr-3 px-3" aria-label="Skip to game">
            <span>
              Skip<span className="max-[359px]:hidden"> to game</span>
            </span>
          </button>
        )}
      </header>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </div>

      <main className="flex flex-1 flex-col">
      {empty ? (
        <ReviewEmpty next={next} />
      ) : phase === 'cards' && card ? (
        <>
          <div className="mt-2 flex items-center gap-3">
            <div className="meter flex-1" role="progressbar" aria-valuenow={seen} aria-valuemin={0} aria-valuemax={total} aria-label="Cards learned">
              <div className="meter-fill" style={{ transform: `scaleX(${seen / total})` }} />
            </div>
            <span className="meta" aria-hidden>
              {position}/{total}
            </span>
          </div>

          <div className="relative mt-6 flex flex-1 items-center justify-center" style={{ perspective: 1200 }}>
            <AnimatePresence mode="popLayout" custom={exit}>
              <motion.div
                key={turn}
                custom={exit}
                role="group"
                aria-label={`Card ${position} of ${total}`}
                className="w-full cursor-grab touch-pan-y active:cursor-grabbing"
                drag="x"
                dragSnapToOrigin
                dragElastic={0.6}
                dragTransition={{ bounceStiffness: 500, bounceDamping: 50 }}
                onDragEnd={(_, info: PanInfo) => {
                  if (info.offset.x > 110) answer(true);
                  else if (info.offset.x < -110 && card.kind === 'element') answer(false);
                }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, x: 0, rotate: 0 }}
                variants={{ out: (d: number) => ({ opacity: 0, x: d * 96, rotate: d * 3, transition: tween(DUR.menu) }) }}
                exit="out"
                transition={tween(DUR.enter)}
                whileDrag={{ rotate: 2 }}
              >
                {card.kind === 'mnemonic' && plan.trick ? <MnemonicCard chapter={plan.trick} /> : card.kind === 'element' ? <FlipCard e={byNumber(card.n)} flipped={flipped} onFlip={flip} /> : null}
              </motion.div>
            </AnimatePresence>
          </div>

          {card.kind === 'element' ? (
            <>
              <p className="mt-4 text-balance text-center text-[13px] leading-5 text-ink-3">
                <span className="md:[@media(pointer:fine)]:hidden">Have a guess, then flip. Swipe right if you knew it, left to see it again.</span>
                <span className="hidden items-center justify-center gap-1 md:[@media(pointer:fine)]:flex">
                  <kbd className="kbd">Space</kbd> flip <span className="px-1">·</span> <kbd className="kbd">→</kbd> got it <span className="px-1">·</span> <kbd className="kbd">←</kbd> still learning
                </span>
              </p>
              <button
                ref={flipRef}
                type="button"
                data-lesson-keys
                onClick={flip}
                aria-pressed={flipped}
                className={`btn btn-secondary mt-3 w-full ${flipped ? 'is-selected' : ''}`}
              >
                {flipped ? <EyeOff size={18} strokeWidth={1.5} aria-hidden /> : <Eye size={18} strokeWidth={1.5} aria-hidden />} Show answer
              </button>
            </>
          ) : (
            <p className="mt-4 text-balance text-center text-[13px] leading-5 text-ink-3">Read it once, out loud if you can</p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-3">
            <button type="button" data-lesson-keys onClick={() => answer(false)} className="btn btn-secondary btn-lg" disabled={card.kind === 'mnemonic'}>
              <RotateCcw size={18} strokeWidth={1.5} aria-hidden /> Still learning
            </button>
            <button type="button" data-lesson-keys onClick={() => answer(true)} className="btn btn-primary btn-lg">
              <Check size={18} strokeWidth={1.5} aria-hidden /> {card.kind === 'mnemonic' ? 'Got the trick' : 'Got it'}
            </button>
          </div>
        </>
      ) : (
        <motion.div {...rise} className="flex flex-1 flex-col items-center justify-center py-4 text-center sm:py-8">
          <MiniTable highlight={new Set(plan.numbers)} className="w-full max-w-[280px]" />
          <p className="meta mt-4">
            {plan.numbers.length} {plan.numbers.length === 1 ? 'element' : 'elements'} to place
          </p>
          <h2 className="t-title mt-6">{isReview ? 'Now put them back' : 'Now put them on the table'}</h2>
          <p className="mt-3 max-w-sm text-ink-2">Drag each element to its place. There is no clock, the colour hints are on, and the hint button shows the right cell if you get stuck.</p>
          <button ref={startRef} onClick={() => setPhase('play')} className="btn btn-primary btn-lg mt-6 w-full max-w-xs sm:mt-8">
            Let's go <ArrowRight size={18} strokeWidth={1.5} aria-hidden />
          </button>
          <button
            onClick={() => {
              retry.current.clear();
              setDeck(initialDeck);
              setSeen(0);
              setFlipped(false);
              setTurn((t) => t + 1);
              setPhase('cards');
            }}
            className="btn btn-quiet mt-2"
          >
            Review the cards again
          </button>
        </motion.div>
      )}
      </main>
    </div>
  );
}

function ReviewEmpty({ next }: { next?: Chapter }) {
  return (
    <motion.div {...rise} className="flex flex-1 flex-col items-center justify-center py-12 text-center">
      <p className="meta">0 elements due</p>
      <h2 className="t-title mt-3">All caught up</h2>
      <p className="mt-3 max-w-sm text-balance text-ink-2">Nothing to review right now. Come back tomorrow, or start the next chapter.</p>
      {next ? (
        <a href={`#/learn/${next.id}`} className="btn btn-primary btn-lg mt-8 w-full max-w-xs">
          <span className="truncate">{next.title}</span>
          <ArrowRight size={18} strokeWidth={1.5} aria-hidden className="shrink-0" />
        </a>
      ) : null}
      <a href="#/learn" className={`btn ${next ? 'btn-quiet mt-2' : 'btn-primary btn-lg mt-8 w-full max-w-xs'}`}>
        Back to the learning path
      </a>
    </motion.div>
  );
}

/** Shared card height: the viewport minus the 300px of header, meter, hint and buttons around it, so the answer buttons stay on screen. */
const CARD_H = 'h-[clamp(320px,calc(100dvh-300px),560px)]';

/** The ruled head of an index card: the category on the left, where it sits on the table on the right. */
function CardHead({ e }: { e: Element }) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-5">
      <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-ink-2">
        <span className="dot" style={{ '--c': catVar(e.category) } as CSSProperties} />
        <span className="truncate">{categoryLabel(e.category)}</span>
      </span>
      <span className="meta shrink-0">
        Group {e.group ?? '–'} · Period {e.period}
      </span>
    </div>
  );
}

/**
 * A two-sided index card. The front asks, the back answers. Only the face you can see is
 * exposed to assistive tech; the flip button below the card is the accessible control.
 */
function FlipCard({ e, flipped, onFlip }: { e: Element; flipped: boolean; onFlip: () => void }) {
  const face = 'card absolute inset-0 flex flex-col overflow-hidden [backface-visibility:hidden]';
  return (
    // Tapping the card is a pointer shortcut; keyboard and screen-reader users have the "Show answer" button.
    <div onClick={onFlip} className={`relative block ${CARD_H} w-full select-none text-left`}>
      <motion.div className="relative h-full w-full [transform-style:preserve-3d]" animate={{ rotateY: flipped ? 180 : 0 }} transition={tween(DUR.enter)}>
        <div aria-hidden={flipped} inert={flipped} className={face}>
          <CardHead e={e} />
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-4 text-center">
            <div className="h-36 w-36" aria-hidden>
              <ElementTile element={e} size={144} showName={false} />
            </div>
            <span className="sr-only">
              Symbol {spell(e.symbol)}, atomic number {e.number}.
            </span>
            <h2 className="mt-8 text-balance text-2xl font-medium leading-tight">What's this element called?</h2>
          </div>
        </div>
        <div aria-hidden={!flipped} inert={!flipped} className={`${face} [transform:rotateY(180deg)]`}>
          <CardHead e={e} />
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6 thin-scroll">
            <div className="flex shrink-0 items-center gap-4">
              <div className="h-16 w-16 shrink-0" aria-hidden>
                <ElementTile element={e} size={64} showName={false} />
              </div>
              <h2 className="t-title min-w-0 text-balance">{e.name}</h2>
            </div>
            {e.summary && <p className="text-[17px] leading-7 text-ink">{firstSentence(e.summary)}</p>}
            {e.fact && (
              <div className="rounded-control bg-surface-2 p-4">
                <div className="label">Fun fact</div>
                <p className="mt-1 text-[15px] leading-6 text-ink">{e.fact}</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function MnemonicCard({ chapter }: { chapter: Chapter }) {
  const words = chapter.mnemonic!;
  // Seven words get tighter rows. Ten-word rhymes read in two columns, top to bottom, on screens under 760px tall,
  // and in one column above that. Either way the whole trick and its button fit one 320x640 screen.
  const dense = words.length > 6;
  const twoCol = words.length > 7;
  const rows = Math.ceil(words.length / 2);
  return (
    // The trick step has no "Show answer" row, so it reserves 224px of chrome instead of the flip card's 300,
    // and may grow 64px past the flip card's 560 cap to take that row's place.
    <div className="card flex min-h-[clamp(320px,calc(100dvh-224px),624px)] flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-5">
        <span className="text-[13px] font-medium text-ink-2">Memory trick</span>
        <span className="meta">{words.length} words</span>
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <p className="text-sm text-ink-2">The first letters spell the elements in order</p>
        <ol
          className={`mt-4 flex-1 ${twoCol ? 'grid grid-flow-col content-center justify-start gap-x-3 gap-y-2 min-[375px]:gap-x-4 [@media(min-height:760px)]:flex [@media(min-height:760px)]:flex-col [@media(min-height:760px)]:justify-center' : `flex flex-col justify-center ${dense ? 'gap-2' : 'gap-3'}`}`}
          style={twoCol ? { gridTemplateRows: `repeat(${rows}, auto)` } : undefined}
        >
          {words.map(([word, symbol], i) => {
            const e = byNumber(chapter.numbers[i]);
            return (
              <li
                key={word + i}
                className={`flex min-w-0 items-center ${twoCol ? 'gap-2 min-[375px]:gap-3 [@media(min-height:760px)]:gap-3' : 'gap-3'}`}
                style={{ '--c': catVar(e.category) } as CSSProperties}
              >
                <ElementChip element={e} size={dense ? 32 : 36} />
                <span
                  className={
                    twoCol
                      ? // Below 340px the longest words (Measurements) break with a hyphen rather than push past the card.
                        'min-w-0 text-base leading-6 text-ink-2 hyphens-auto [overflow-wrap:anywhere] min-[375px]:text-lg min-[375px]:leading-7 [@media(min-height:760px)]:text-xl [@media(min-height:760px)]:leading-tight'
                      : 'text-xl leading-tight text-ink-2'
                  }
                >
                  <Highlight word={word} symbol={symbol} />
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** The letters of the word that match the symbol, printed in the element's ink. */
function Highlight({ word, symbol }: { word: string; symbol: string }) {
  const lower = word.toLowerCase();
  const s = symbol.toLowerCase();
  const mark = (t: string) => <span className="cat-ink font-medium">{t}</span>;
  if (lower.startsWith(s)) {
    return (
      <>
        {mark(word.slice(0, s.length))}
        {word.slice(s.length)}
      </>
    );
  }
  const i = lower.indexOf(s);
  if (i >= 0)
    return (
      <>
        {word.slice(0, i)}
        {mark(word.slice(i, i + s.length))}
        {word.slice(i + s.length)}
      </>
    );
  return (
    <>
      {mark(word[0])}
      {word.slice(1)}
    </>
  );
}
