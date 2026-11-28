import { motion } from 'motion/react';
import { ArrowRight, BarChart3, BookOpen, CalendarDays, ChevronRight, ClipboardCheck, GraduationCap, Hand, Layers, RefreshCw, ShieldCheck, Star, Trophy } from 'lucide-react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { goalLabel, useDailyGoal } from '../components/DailyGoal';
import { ElementChip, ElementTile } from '../components/ElementTile';
import { MiniTable } from '../components/MiniTable';
import { HeroTable } from '../components/HeroTable';
import { SectionHeader } from '../components/SectionHeader';
import { TrailSquares } from '../components/Results';
import { Ring } from '../components/Stats';
import { rise } from '../components/motion';
import { DAILY_SIZE, dailyNumber, todayKey } from '../lib/daily';
import { formatDate } from '../lib/date';
import { ELEMENTS, byNumber, catVar, categoryLabel, formatNumber, type Element } from '../lib/elements';
import { hashString } from '../lib/random';
import { REGIONS } from '../lib/regions';
import { CHAPTERS, type Chapter } from '../lib/chapters';
import { dueForReview } from '../lib/review';
import { levelFromXp, titleForLevel } from '../lib/scoring';
import { liveStreak, masteredCount, useProgress, type Mastery } from '../store/progress';
import { useUi } from '../store/ui';
import { Countdown } from './Daily';
import { LifeArt, MatchArt, QuizArt } from '../components/ModeArt';

/** Hydrogen to calcium: the first two chapters of the learning path. */
const FIRST_CHAPTERS = CHAPTERS.slice(0, 2);
const FIRST_20 = FIRST_CHAPTERS.flatMap((c) => c.numbers);

/** Elements you have started (strength 1 to 3) but not yet mastered. */
const learningCount = (m: Record<number, Mastery>) => Object.values(m).filter((x) => x.s >= 1 && x.s < 4).length;
/** Met: right at least once (strength 1 or more). The same rule lights up the first 20 and the table map. */
const isMet = (m: Record<number, Mastery>, n: number) => (m[n]?.s ?? 0) >= 1;


/**
 * Every Home section shares the hero's column: 1088px is the width at which the whole table, the headline and both
 * buttons fit a 1280x900 first screen, and the sections below line up with the table's edges.
 */
const PAGE = 'mx-auto max-w-[1088px] px-4 sm:px-6';

export function Home() {
  const p = useProgress();
  const key = todayKey();
  const lvl = levelFromXp(p.xp);
  const mastered = masteredCount(p.mastery);
  const learning = learningCount(p.mastery);
  const returning = p.stats.rounds > 0 || p.stats.quizzes > 0;
  const next = REGIONS.find((r) => !Object.keys(p.best).some((k) => k.startsWith(r.id + ':'))) ?? REGIONS[REGIONS.length - 1];
  const nextChapter = CHAPTERS.find((c) => !p.chapters[c.id]) ?? CHAPTERS[0];
  const firstChapter = FIRST_CHAPTERS.find((c) => !p.chapters[c.id]);
  const starter = !!firstChapter;
  const firstDone = FIRST_20.filter((n) => isMet(p.mastery, n)).length;
  const featured = useMemo(() => ELEMENTS[hashString('eotd:' + key) % ELEMENTS.length], [key]);
  // Recomputed when mastery changes; "now" is read at render.
  const due = useMemo(() => dueForReview(p.mastery), [p.mastery]);
  const lessonHref = `#/learn/${(firstChapter ?? nextChapter).id}`;
  const achievements = Object.keys(p.achievements).length;

  const metFn = useCallback((n: number) => isMet(p.mastery, n), [p.mastery]);
  const todayStack = (
    <TodayList layout="stack" due={due} lessonHref={lessonHref} level={{ level: lvl.level, learning, mastered, achievements }} />
  );
  const today = (
    <TodayList
      layout="strip"
      due={due}
      lessonHref={lessonHref}
      nextChapter={starter ? undefined : nextChapter}
      level={starter ? { level: lvl.level, learning, mastered, achievements } : undefined}
    />
  );

  return (
    <div className="overflow-x-clip">
      {/*
        Hero: the whole wall chart is the first thing you see. A compact text row (headline left; the line and the actions right)
        sits above the table, so at 1280x900 both fit the first screen. The hero is as wide as the table at its largest (54px cells).
      */}
      <section aria-labelledby="home-title" className={`${PAGE} pt-8`}>
        <motion.div {...rise} className="grid gap-x-12 gap-y-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
          {starter ? (
            <>
              <h1 id="home-title" className="t-display max-w-xl">
                Learn the first 20 elements, three minutes at a time
              </h1>
              <div>
                <p className="max-w-lg text-base leading-6 text-ink-2 sm:text-lg sm:leading-7">
                  {returning
                    ? 'Pick up where you left off. Periodica remembers what you find hard and brings it back until it sticks.'
                    : 'Short lessons with memory tricks, then quick games to make them stick. Start with hydrogen to calcium: the elements in air, water, salt and you.'}
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <a href={`#/learn/${firstChapter.id}`} className="btn btn-primary btn-lg">
                    {firstChapter === FIRST_CHAPTERS[0] && !p.mastery[1] ? 'Start the first lesson' : `Continue: ${firstChapter.title}`}
                  </a>
                  <a href="#/match" className="btn btn-secondary btn-lg">
                    Try a quick game
                  </a>
                </div>
              </div>
            </>
          ) : (
            <>
              <h1 id="home-title" className="t-display">
                Next: {next.name}
              </h1>
              <div>
                <p className="max-w-lg text-base leading-6 text-ink-2 sm:text-lg sm:leading-7">Pick up where you left off. Periodica remembers what you find hard and brings it back until it sticks.</p>
                <a href={`#/play/${next.id}`} className="btn btn-primary btn-lg mt-6 w-full sm:w-auto">
                  Play {next.name}
                </a>
              </div>
            </>
          )}
        </motion.div>

        {/* The table prints itself with its own sweep (hero.css), so it takes no motion entrance here. */}
        <div className="mt-8">
          {starter ? (
            <HeroTable caption="All 118 elements, in the colours of their families" />
          ) : (
            <>
              <HeroTable
                met={metFn}
                caption={
                  <>
                    In colour: the <span className="num text-ink">{learning + mastered}</span> of 118 you have met
                  </>
                }
              />
              <LevelStrip level={lvl.level} progress={lvl.progress} toNext={lvl.toNext} learning={learning} mastered={mastered} achievements={achievements} />
            </>
          )}
        </div>
      </section>

      {/*
        Today: the goal, a review if one is due, the next lesson and the daily. A new student's first 20 sit beside it,
        so their progress is the first thing under the table; a returning student gets one strip.
      */}
      <section aria-labelledby="today-title" className={`${PAGE} mt-12 md:mt-16`}>
        <SectionHeader id="today-title" title="Today" aside={<span className="meta">{formatDate()}</span>} />
        {starter ? (
          <div className="grid gap-3 md:gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
            <FirstTwenty done={firstDone} mastery={p.mastery} />
            {todayStack}
          </div>
        ) : (
          today
        )}
      </section>

      {/* Regions */}
      <section aria-labelledby="regions-title" className={`${PAGE} mt-12 md:mt-16`}>
        <SectionHeader id="regions-title" title="Pick a region" sub="Start small, then take on the whole table" action={{ href: '#/play', label: 'All modes' }} />
        {/* A sideways row on phones and tablets, each card narrow enough that the next one shows. From lg, two even rows of four: the full table takes two places. */}
        <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto md:gap-4 px-4 pb-1 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-48px),transparent)] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:pb-0 lg:[mask-image:none]">
          {REGIONS.map((r) => {
            const bestStars = Math.max(0, ...Object.entries(p.best).filter(([k]) => k.startsWith(r.id + ':')).map(([, v]) => v.stars));
            const wide = r.id === 'full';
            return (
              <a
                key={r.id}
                href={`#/play/${r.id}`}
                className={`card card-link relative w-[calc(100vw-6rem)] max-w-64 shrink-0 snap-start p-4 lg:w-auto lg:max-w-none ${wide ? 'lg:col-span-2 lg:flex lg:items-end lg:gap-6' : ''}`}
              >
                <MiniTable highlight={new Set(r.numbers)} className={wide ? 'w-full lg:w-[calc(50%-12px)] lg:shrink-0' : 'w-full'} />
                <span className={`block ${wide ? 'lg:min-w-0 lg:flex-1' : ''}`}>
                <span className="mt-4 flex items-baseline justify-between gap-3">
                  <span className="text-balance text-[15px] font-medium">{r.name}</span>
                  <span className="meta shrink-0">{r.short}</span>
                </span>
                <span className="mt-2 flex gap-1" aria-hidden>
                  {[0, 1, 2].map((s) => (
                    <Star
                      key={s}
                      size={16}
                      strokeWidth={1.5}
                      style={s < bestStars ? { fill: 'var(--star)', color: 'var(--star-line)' } : { color: 'var(--ink-3)' }}
                    />
                  ))}
                </span>
                </span>
                <span className="sr-only">{bestStars ? `, best ${bestStars} of 3 stars` : ', not played yet'}</span>
              </a>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="eotd-title" className={`${PAGE} mt-12 md:mt-16`}>
        <SectionHeader id="eotd-title" title="Element of the day" />
        <ElementOfTheDay e={featured} />
      </section>

      {/* More ways to practise: three cards with one anatomy, title, line, content, and the action on one shared bottom line. */}
      <section aria-labelledby="practise-title" className={`${PAGE} mt-12 md:mt-16`}>
        <SectionHeader id="practise-title" title="More ways to practise" sub="Quick rounds for when you have five minutes" />
        <div className="grid gap-3 md:grid-cols-3 md:gap-4">
          <PracticeCard href="#/life" title="In real life" action="Spot the elements" body="What’s inside your phone? Why are fireworks red? Spot the elements hiding in everyday things.">
            <span aria-hidden className="grid h-16 place-items-center rounded-control bg-surface-2 sm:h-20 md:h-24">
              <LifeArt />
            </span>
          </PracticeCard>
          <PracticeCard href="#/quiz" title="Quick quiz" action="Take a quiz" body="Ten fast questions on symbols, numbers, families and facts, weighted towards the elements you haven’t nailed yet.">
            <span aria-hidden className="grid h-16 place-items-center rounded-control bg-surface-2 sm:h-20 md:h-24">
              <QuizArt />
            </span>
          </PracticeCard>
          <PracticeCard href="#/match" title="Match pairs" action="Find the pairs" body="A relaxed memory game. Flip the cards and pair each symbol with its name. No rush.">
            <span aria-hidden className="grid h-16 place-items-center rounded-control bg-surface-2 sm:h-20 md:h-24">
              <MatchArt />
            </span>
          </PracticeCard>
        </div>
      </section>

      {!returning && <HowItWorks />}
      <ForTeachers />
      {/* 64px under the last section, as every page ends (pb-16). */}
      <div className="h-16" />
    </div>
  );
}

/* ------------------------------------------------------------------ today */

interface LevelInfo {
  level: number;
  learning: number;
  mastered: number;
  achievements: number;
}

/**
 * What to do today as one list: the goal, a review if one is due, the next lesson and the daily.
 * Stacked in the hero for a returning student; a single strip under the first step for a new one.
 */
function TodayList({ layout, due, lessonHref, nextChapter, level }: { layout: 'stack' | 'strip'; due: number[]; lessonHref: string; nextChapter?: Chapter; level?: LevelInfo }) {
  const rows: ReactNode[] = [<GoalRow key="goal" lessonHref={lessonHref} />];
  if (due.length > 0) rows.push(<ReviewRow key="review" due={due} />);
  if (nextChapter)
    rows.push(
      <Row key="lesson" href={`#/learn/${nextChapter.id}`} icon={<GraduationCap size={18} strokeWidth={1.5} />} title="Next lesson">
        {nextChapter.title}
      </Row>,
    );
  rows.push(<DailyRow key="daily" bonus={!!level} />);
  if (level) rows.push(<LevelRow key="level" {...level} />);

  const cols = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }[rows.length] ?? 'lg:grid-cols-4';
  return (
    <ul className={`card grid overflow-hidden divide-y divide-line ${layout === 'strip' ? `today-strip ${cols} lg:divide-x lg:divide-y-0` : ''}`}>
      {rows.map((r, i) => (
        <li key={i} className="flex min-w-0">
          {r}
        </li>
      ))}
    </ul>
  );
}

/** One row of the today list: icon column, title and detail, a quiet meta, a chevron when it goes somewhere. */
function Row({ href, icon, title, children, meta, extra }: { href?: string; icon: ReactNode; title: ReactNode; children?: ReactNode; meta?: ReactNode; extra?: ReactNode }) {
  const body = (
    <>
      <span aria-hidden className="grid h-[22px] w-6 shrink-0 place-items-center text-ink-2">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-[22px] text-ink">{title}</span>
        {children && <span className="mt-1 block text-sm text-ink-2">{children}</span>}
        {extra}
        {/* On phones the meta drops under the text, so the title keeps the full width. */}
        {/* In the four-up strip each column is narrow too, so the meta drops under the text there as well. */}
        {meta && <span className="meta mt-2 block sm:hidden lg:[.today-strip_&]:block">{meta}</span>}
      </span>
      {meta && <span className="meta hidden shrink-0 leading-[22px] sm:block lg:[.today-strip_&]:hidden">{meta}</span>}
      {href && <ChevronRight aria-hidden size={16} strokeWidth={1.5} className="mt-[3px] shrink-0 text-ink-3" />}
    </>
  );
  const cls = 'flex w-full min-w-0 items-start gap-3 px-4 py-4';
  return href ? (
    <a href={href} className={`${cls} transition-colors hover:bg-surface-2 focus-visible:-outline-offset-2`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function GoalRow({ lessonHref }: { lessonHref: string }) {
  const { xp, goal, value, met } = useDailyGoal();
  const ring = (
    <span role="img" aria-label={goalLabel(xp, goal)}>
      <Ring value={met ? 1 : value} size={22} stroke={2.5} color={met ? 'var(--good)' : undefined} />
    </span>
  );
  return met ? (
    <Row icon={ring} title="Goal reached for today" meta={`${xp} XP`}>
      Anything extra is a bonus
    </Row>
  ) : (
    <Row href={lessonHref} icon={ring} title="Today’s goal: two quick activities" meta={`${xp}/${goal} XP`}>
      {xp === 0 ? 'Any two short lessons or games should get you there' : `${goal - xp} XP to go`}
    </Row>
  );
}

function ReviewRow({ due }: { due: number[] }) {
  return (
    <Row
      href="#/learn/review"
      icon={<RefreshCw size={18} strokeWidth={1.5} />}
      title={`${due.length} ${due.length === 1 ? 'element' : 'elements'} ready for a quick review`}
      extra={
        <span aria-hidden className="mt-2 flex flex-wrap items-center gap-1">
          {/* Five chips and the "+N" fit one line from a 320px phone up; a column of the four-up strip holds four. */}
          {due.slice(0, 5).map((n, i) => (
            <ElementChip key={n} element={byNumber(n)} size={28} className={i === 4 ? 'lg:[.today-strip_&]:hidden' : ''} />
          ))}
          {due.length > 5 && <span className="meta px-1 lg:[.today-strip_&]:hidden">+{due.length - 5}</span>}
          {due.length > 4 && <span className="meta hidden px-1 lg:[.today-strip_&]:inline">+{due.length - 4}</span>}
        </span>
      }
    />
  );
}

function DailyRow({ bonus }: { bonus: boolean }) {
  const p = useProgress();
  const key = todayKey();
  const today = p.daily.results[key];
  /** A finished daily has stars; a daily left early (0 stars) used the try but has nothing to show or share. */
  const done = !!today && today.stars > 0;
  const used = !!today && today.stars === 0;
  const streak = liveStreak(p.daily, key);
  return (
    <Row
      href="#/daily"
      icon={<CalendarDays size={18} strokeWidth={1.5} />}
      title={`Daily challenge #${dailyNumber(key)}`}
      meta={done ? <span className="font-sans text-sm text-ink-2">See result</span> : undefined}
      extra={
        <>
          {done && <TrailSquares trail={today!.trail} animate={false} className="mt-3 justify-start!" />}
          {/* Two parts that wrap as wholes: a narrow column never starts a line with a stray separator. */}
          <span className="meta mt-2 flex flex-wrap gap-x-3">
            <span>{streak ? `${streak}-day streak` : 'No streak yet'}</span>
            <span className="whitespace-nowrap">Next in <Countdown /></span>
          </span>
        </>
      }
    >
      {done ? (
        <>
          Done for today: <span className="num text-ink">{today!.score.toLocaleString('en-US')}</span> points
        </>
      ) : used ? (
        <span>Attempt used today</span>
      ) : bonus ? (
        `A bonus: ${DAILY_SIZE} elements from all over the table, the same for everyone today`
      ) : (
        `${DAILY_SIZE} elements from all over the table, one try`
      )}
    </Row>
  );
}

function LevelRow({ level, learning, mastered, achievements }: LevelInfo) {
  return (
    <Row href="#/progress" icon={<BarChart3 size={18} strokeWidth={1.5} />} title={`Level ${level} · ${titleForLevel(level)}`}>
      {learning + mastered === 0 ? (
        'Your first lesson lights up your first elements'
      ) : (
        <>
          Learning <span className="num text-ink">{learning}</span> · Mastered <span className="num text-ink">{mastered}</span> of 118 · {achievements} {achievements === 1 ? 'achievement' : 'achievements'}
        </>
      )}
    </Row>
  );
}

/* ------------------------------------------------------------------ the table */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * The first 20 as the real top of the table: groups 1 and 2, a gap where the transition metals will go,
 * then groups 13 to 18. Elements you have met are printed in their category colour; the rest are empty places.
 */
function FirstTwenty({ done, mastery }: { done: number; mastery: Record<number, Mastery> }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const gap = w >= 480 ? 6 : 4;
  const cell = w ? Math.min(64, Math.floor((w - 8 * gap) / 8.5)) : 0;
  return (
    <div>
      <div className="card p-4 sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="first-20-label" className="text-[15px] font-medium">
            Your first 20 elements
          </h2>
          <span className="mono text-sm text-ink-2">
            <span className="text-ink">{done}</span>/20
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-2">{done === 0 ? 'Each one lights up the first time you get it right' : done === 20 ? 'All twenty met, hydrogen to calcium' : `${20 - done} still to meet, up to calcium`}</p>
        <div
          ref={ref}
          role="progressbar"
          aria-labelledby="first-20-label"
          aria-valuemin={0}
          aria-valuemax={20}
          aria-valuenow={done}
          aria-valuetext={`${done} of 20 started`}
          className="mt-6"
          style={{ minHeight: cell ? undefined : 132 }}
        >
          {cell > 0 && (
            <div className="grid" style={{ gridTemplateColumns: `repeat(2, ${cell}px) ${Math.round(cell / 2)}px repeat(6, ${cell}px)`, gridAutoRows: `${cell}px`, gap }}>
              {FIRST_20.map((n) => {
                const el = byNumber(n);
                return (
                  <div key={n} style={{ gridColumn: el.col <= 2 ? el.col : el.col - 9, gridRow: el.row }}>
                    <FragmentCell el={el} size={cell} on={isMet(mastery, n)} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {/* The link to Explore sits under the hero table, just above this card. */}
        <p className="mt-4 text-sm text-ink-2">Hydrogen to calcium</p>
      </div>
    </div>
  );
}

/**
 * A square of the first-20 fragment. Same rule as ElementTile: the corner number from 34px up.
 * Smaller phone cells (320px screens) show a centred symbol only, never under 12px.
 */
function FragmentCell({ el, size, on }: { el: Element; size: number; on: boolean }) {
  const radius = Math.min(12, Math.max(4, Math.round(size * 0.14)));
  const named = on && size >= 54;
  const numbered = size >= 34;
  return (
    <div
      className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden ${on ? 'tile' : 'slot text-ink-3'}`}
      style={{ '--c': catVar(el.category), borderRadius: radius } as CSSProperties}
    >
      {numbered && (
        <span className="tile-number absolute" style={{ left: Math.max(3, Math.round(size * 0.09)), top: Math.max(3, Math.round(size * 0.08)), fontSize: size < 48 ? 9 : Math.round(size * 0.16) }}>
          {el.number}
        </span>
      )}
      <span
        className="font-medium leading-none"
        style={{ fontSize: Math.max(12, Math.round(size * (named ? 0.34 : 0.38))), marginTop: numbered ? Math.round(size * (named ? 0.08 : 0.14)) : 0 }}
      >
        {el.symbol}
      </span>
      {named && (
        <span className="tile-name max-w-[92%] truncate" style={{ fontSize: Math.max(9, Math.round(size * 0.14)), marginTop: Math.round(size * 0.06) }}>
          {el.name}
        </span>
      )}
    </div>
  );
}

function LevelStrip({ level, progress, toNext, learning, mastered, achievements }: { level: number; progress: number; toNext: number } & Omit<LevelInfo, 'level'>) {
  return (
    <a href="#/progress" className="card card-link mt-3 flex shrink-0 items-center gap-4 p-4 sm:px-5 md:mt-4">
      <Ring value={progress} size={40} stroke={3}>
        <span className="num text-sm font-medium">{level}</span>
      </Ring>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">
          Level {level} · {titleForLevel(level)}
        </span>
        <span className="meta mt-1 block">
          {toNext.toLocaleString('en-US')} XP to next level{' '}
          <span className="whitespace-nowrap">
            · {achievements} {achievements === 1 ? 'achievement' : 'achievements'}
          </span>
        </span>
      </span>
      <span className="hidden text-sm text-ink-2 sm:block">
        Learning <span className="num text-ink">{learning}</span> · Mastered <span className="num text-ink">{mastered}</span> of 118
      </span>
      <ChevronRight aria-hidden size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" />
    </a>
  );
}

/* ------------------------------------------------------------------ sections */

/**
 * A reference entry, the way a data book prints one: the square, the name, the figures, then the text.
 * From lg the uses and two plain facts sit in a second column, so the card has no empty half.
 */
function ElementOfTheDay({ e }: { e: Element }) {
  const openDetail = useUi((s) => s.openDetail);
  const c = catVar(e.category);
  const place = e.group ? `Group ${e.group} · Period ${e.period}` : `Period ${e.period}`;
  const facts: [string, string][] = [
    ['State at 20 °C', e.state],
    ['Discovered', e.ancient ? 'Ancient' : (e.year?.toString() ?? '—')],
  ];
  return (
    <article className="card grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-4 p-4 sm:gap-x-8 sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,20rem)] lg:grid-rows-[auto_1fr] lg:gap-x-12">
      {/* Phones: a 72px square beside the name, then the text across the card. From sm the square heads its own column. */}
      <div className="row-start-1 sm:row-span-3 lg:row-span-2">
        <div className="h-18 w-18 sm:hidden">
          <ElementTile element={e} size={72} showName={false} />
        </div>
        <div className="hidden h-28 w-28 sm:block">
          <ElementTile element={e} size={112} />
        </div>
      </div>
      <div className="col-start-2 row-start-1 min-w-0 self-center sm:self-start">
        <h3 className="t-heading">{e.name}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2 sm:mt-2">
          <span className="flex items-center gap-2">
            <span className="dot" style={{ '--c': c } as CSSProperties} aria-hidden />
            {categoryLabel(e.category)}
          </span>
          <span className="mono text-[13px]">{formatNumber(e.mass, 6)} u</span>
          <span className="mono text-[13px]">{place}</span>
        </p>
      </div>
      <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2">
        {e.summary && <p className="max-w-2xl text-[15px] leading-6 text-ink-2">{e.summary}</p>}
        {e.fact && <p className="mt-4 max-w-2xl border-l-2 border-line-strong pl-4 text-[15px] leading-6 text-ink">{e.fact}</p>}
        <button onClick={() => openDetail(e.number)} className="btn btn-secondary mt-4 w-full sm:mt-6 sm:w-auto">
          Open the full card
        </button>
      </div>
      <aside aria-label={`More about ${e.name}`} className="col-span-2 mt-2 min-w-0 border-t border-line pt-4 sm:col-span-1 sm:col-start-2 sm:mt-4 sm:border-t-0 sm:pt-0 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:border-l lg:border-line lg:pl-8">
        {e.uses.length > 0 && (
          <>
            <h3 className="label mb-2">Where you&rsquo;ll find it</h3>
            <ul className="flex flex-wrap gap-2">
              {e.uses.map((u) => (
                <li key={u} className="chip text-ink">
                  {u}
                </li>
              ))}
            </ul>
          </>
        )}
        <dl className={`grid grid-cols-2 gap-4 ${e.uses.length > 0 ? 'mt-6 border-t border-line pt-4' : ''}`}>
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[13px] text-ink-2">{k}</dt>
              <dd className="num mt-1 text-[15px] font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </article>
  );
}

function ActionLine({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-medium text-ink ${className}`}>
      {children} <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
    </span>
  );
}

function PracticeCard({ href, title, action, body, children }: { href: string; title: string; action: string; body: string; children?: ReactNode }) {
  return (
    <a href={href} className="card card-link flex flex-col p-4 sm:p-5">
      <span className="block text-base font-medium leading-6">{title}</span>
      <span className="mt-1 block text-sm text-ink-2">{body}</span>
      {children && <span className="mt-auto block pt-4">{children}</span>}
      <ActionLine className="mt-4 md:mt-6">{action}</ActionLine>
    </a>
  );
}

/** One point in the two closing sections: an icon tile, a title and two short lines, in a card like the rest of the page. */
function InfoCard({ icon, step, title, body }: { icon: ReactNode; step?: number; title: string; body: string }) {
  return (
    <li className="card flex h-full flex-col p-4 sm:p-5">
      <span className="flex items-center gap-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-surface-2 text-ink-2">
          {icon}
        </span>
        {step !== undefined && <span className="meta">Step {step}</span>}
      </span>
      <h3 className="mt-4 text-base font-medium leading-6">{title}</h3>
      <p className="mt-1 text-sm leading-5 text-ink-2">{body}</p>
    </li>
  );
}

function HowItWorks() {
  const steps = [
    { icon: <Hand size={18} strokeWidth={1.5} />, title: 'Place', body: 'Drag tiles onto the table, or tap a tile and then its cell. Fast, correct moves build your combo.' },
    { icon: <BookOpen size={18} strokeWidth={1.5} />, title: 'Learn', body: 'Every element opens into a card: what it is, where you meet it, and one fact worth remembering.' },
    { icon: <Trophy size={18} strokeWidth={1.5} />, title: 'Master', body: 'Periodica tracks each element. Get it right first time, again and again, and it lights up on your map.' },
  ];
  return (
    <section aria-labelledby="how-title" className={`${PAGE} mt-12 md:mt-16`}>
      <SectionHeader id="how-title" title="How it works" sub="Three steps, a few minutes a day" />
      <ol className="grid gap-3 md:grid-cols-3 md:gap-4">
        {steps.map((s, i) => (
          <InfoCard key={s.title} icon={s.icon} step={i + 1} title={s.title} body={s.body} />
        ))}
      </ol>
    </section>
  );
}

/** A short, honest note for teachers and parents deciding whether to recommend the app. */
function ForTeachers() {
  const points = [
    {
      icon: <Layers size={18} strokeWidth={1.5} />,
      title: 'What it covers',
      body: 'All 118 elements: names, symbols, atomic numbers and where each one sits, from hydrogen to the elements made in the lab.',
    },
    // Only promise sign-in when this build actually has accounts (a Firebase project is set).
    import.meta.env.VITE_FIREBASE_PROJECT_ID
      ? {
          icon: <ShieldCheck size={18} strokeWidth={1.5} />,
          title: 'Accounts are optional',
          body: 'Students can play without signing up. Signing in with Google or an email saves progress to their account, so it follows them to any device.',
        }
      : {
          icon: <ShieldCheck size={18} strokeWidth={1.5} />,
          title: 'No sign-up needed',
          body: 'Students start straight away, with no account or email. Progress is saved in this browser, and nothing is sent anywhere.',
        },
    {
      icon: <ClipboardCheck size={18} strokeWidth={1.5} />,
      title: 'Easy to check',
      body: 'Students can open Progress and show you a summary of the elements they have started and mastered.',
    },
  ];
  return (
    <section aria-labelledby="teachers-title" className={`${PAGE} mt-12 md:mt-16`}>
      <SectionHeader id="teachers-title" title="For teachers and parents" sub="Free, private, and built around short practice" />
      <ul className="grid gap-3 md:grid-cols-3 md:gap-4">
        {points.map((pt) => (
          <InfoCard key={pt.title} icon={pt.icon} title={pt.title} body={pt.body} />
        ))}
      </ul>
    </section>
  );
}
