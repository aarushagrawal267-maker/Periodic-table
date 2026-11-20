import { motion } from 'motion/react';
import { ArrowRight, BarChart3, CalendarDays, ChevronRight, GraduationCap, RefreshCw, Star } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { goalLabel, useDailyGoal } from '../components/DailyGoal';
import { ElementChip, ElementTile } from '../components/ElementTile';
import { MiniTable } from '../components/MiniTable';
import { PeriodicGrid } from '../components/PeriodicGrid';
import { SectionHeader } from '../components/SectionHeader';
import { TrailSquares } from '../components/Results';
import { Ring } from '../components/Stats';
import { DUR, STAGGER, rise, tween } from '../components/motion';
import { DAILY_SIZE, dailyNumber, todayKey } from '../lib/daily';
import { formatDate } from '../lib/date';
import { ELEMENTS, byNumber, bySymbol, catVar, categoryLabel, formatNumber, type Element } from '../lib/elements';
import { THINGS } from '../lib/everyday';
import { hashString } from '../lib/random';
import { REGIONS } from '../lib/regions';
import { CHAPTERS, type Chapter } from '../lib/chapters';
import { dueForReview } from '../lib/review';
import { levelFromXp, titleForLevel } from '../lib/scoring';
import { liveStreak, masteredCount, useProgress, type Mastery } from '../store/progress';
import { useUi } from '../store/ui';
import { Countdown } from './Daily';
import { MatchArt, QuizArt } from './Play';

/** Hydrogen to calcium: the first two chapters of the learning path. */
const FIRST_CHAPTERS = CHAPTERS.slice(0, 2);
const FIRST_20 = FIRST_CHAPTERS.flatMap((c) => c.numbers);

/** Elements you have started (strength 1 to 3) but not yet mastered. */
const learningCount = (m: Record<number, Mastery>) => Object.values(m).filter((x) => x.s >= 1 && x.s < 4).length;
/** Met: right at least once (strength 1 or more). The same rule lights up the first 20 and the table map. */
const isMet = (m: Record<number, Mastery>, n: number) => (m[n]?.s ?? 0) >= 1;

/** Two everyday objects from In real life, shown with the elements inside them. */
const LIFE_SAMPLES = ['phone', 'fireworks'].map((id) => THINGS.find((t) => t.id === id)!).filter(Boolean);

const PAGE = 'mx-auto max-w-7xl px-4 sm:px-6';

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
      {/* Hero: one first step for a new student, today's round for a returning one. The table is the visual. */}
      <section aria-labelledby="home-title" className={`${PAGE} grid gap-10 pt-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:items-center lg:pt-16`}>
        <motion.div {...rise}>
          {starter ? (
            <>
              <h1 id="home-title" className="t-display max-w-xl">
                Learn the first 20 elements. Three minutes at a time
              </h1>
              <p className="mt-4 max-w-lg text-lg leading-7 text-ink-2">
                {returning
                  ? 'Pick up where you left off. Periodica remembers what you find hard and brings it back until it sticks.'
                  : 'Short lessons with memory tricks, then quick games to make them stick. Start with hydrogen to calcium: the elements in air, water, salt and you.'}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href={`#/learn/${firstChapter.id}`} className="btn btn-primary btn-lg">
                  {firstChapter === FIRST_CHAPTERS[0] && !p.mastery[1] ? 'Start the first lesson' : `Continue: ${firstChapter.title}`}
                </a>
                <a href="#/match" className="btn btn-secondary btn-lg">
                  Try a quick game
                </a>
              </div>
            </>
          ) : (
            <>
              <h1 id="home-title" className="t-display">
                Next: {next.name}
              </h1>
              <p className="mt-4 max-w-lg text-lg leading-7 text-ink-2">Pick up where you left off. Periodica remembers what you find hard and brings it back until it sticks.</p>
              <a href={`#/play/${next.id}`} className="btn btn-primary btn-lg mt-8 w-full sm:w-auto">
                Play {next.name}
              </a>
            </>
          )}
        </motion.div>

        <motion.div initial={rise.initial} animate={rise.animate} transition={tween(DUR.enter, STAGGER)}>
          {starter ? (
            <FirstTwenty done={firstDone} mastery={p.mastery} />
          ) : (
            <>
              <TableMap mastery={p.mastery} met={learning + mastered} />
              <LevelStrip level={lvl.level} progress={lvl.progress} toNext={lvl.toNext} learning={learning} mastered={mastered} achievements={achievements} />
            </>
          )}
        </motion.div>
      </section>

      {/* Today: the goal, a review if one is due, the next lesson and the daily, as one strip below the hero. */}
      <section aria-labelledby="today-title" className={`${PAGE} mt-16`}>
        <SectionHeader id="today-title" title="Today" aside={<span className="meta">{formatDate()}</span>} />
        {today}
      </section>

      {/* Regions */}
      <section aria-labelledby="regions-title" className={`${PAGE} mt-16`}>
        <SectionHeader id="regions-title" title="Pick a region" sub="Start small, then take on the whole table" action={{ href: '#/play', label: 'All modes' }} />
        {/* A sideways row on phones and tablets. From lg, two even rows of four: the full table takes two places. */}
        <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-48px),transparent)] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:pb-0 lg:[mask-image:none]">
          {REGIONS.map((r) => {
            const bestStars = Math.max(0, ...Object.entries(p.best).filter(([k]) => k.startsWith(r.id + ':')).map(([, v]) => v.stars));
            const wide = r.id === 'full';
            return (
              <a
                key={r.id}
                href={`#/play/${r.id}`}
                className={`card card-link relative w-64 shrink-0 snap-start p-4 lg:w-auto ${wide ? 'lg:col-span-2 lg:flex lg:items-end lg:gap-6' : ''}`}
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

      <section aria-labelledby="eotd-title" className={`${PAGE} mt-16`}>
        <SectionHeader id="eotd-title" title="Element of the day" />
        <ElementOfTheDay e={featured} />
      </section>

      {/* More ways to practise: three cards with one anatomy, title, line, content, and the action on one shared bottom line. */}
      <section aria-labelledby="practise-title" className={`${PAGE} mt-16`}>
        <SectionHeader id="practise-title" title="More ways to practise" sub="Quick rounds for when you have five minutes" />
        <div className="grid gap-4 md:grid-cols-3">
          <PracticeCard href="#/life" title="In real life" action="Spot the elements" body="What’s inside your phone? Why are fireworks red? Spot the elements hiding in everyday things.">
            <ul className="flex h-24 flex-col divide-y divide-line border-y border-line" aria-hidden>
              {LIFE_SAMPLES.map((t) => (
                <li key={t.id} className="flex flex-1 items-center justify-between gap-4">
                  <span className="text-sm text-ink-2">{t.name}</span>
                  <span className="flex gap-1">
                    {t.contains.map(([sym]) => (
                      <ElementChip key={sym} element={bySymbol.get(sym.toLowerCase())!} size={28} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </PracticeCard>
          <PracticeCard href="#/quiz" title="Quick quiz" action="Take a quiz" body="Ten fast questions on symbols, numbers, families and facts, weighted towards the elements you haven’t nailed yet.">
            <span aria-hidden className="grid h-24 place-items-center rounded-control bg-surface-2">
              <QuizArt />
            </span>
          </PracticeCard>
          <PracticeCard href="#/match" title="Match pairs" action="Find the pairs" body="A relaxed memory game. Flip the cards and pair each symbol with its name. No rush.">
            <span aria-hidden className="grid h-24 place-items-center rounded-control bg-surface-2">
              <MatchArt />
            </span>
          </PracticeCard>
        </div>
      </section>

      {!returning && <HowItWorks />}
      <ForTeachers />
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
    <ul className={`card grid overflow-hidden divide-y divide-line ${layout === 'strip' ? `${cols} lg:divide-x lg:divide-y-0` : ''}`}>
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
      </span>
      {meta && <span className="meta shrink-0 leading-[22px]">{meta}</span>}
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
          {/* Six chips fit one line on phones, eight from sm. */}
          {due.slice(0, 8).map((n, i) => (
            <ElementChip key={n} element={byNumber(n)} size={28} className={i >= 6 ? 'max-sm:hidden' : ''} />
          ))}
          {due.length > 6 && <span className="meta px-1 sm:hidden">+{due.length - 6}</span>}
          {due.length > 8 && <span className="meta px-1 max-sm:hidden">+{due.length - 8}</span>}
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
          <span className="meta mt-2 block">
            {streak} day streak · next in <Countdown />
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
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="text-sm text-ink-2">Hydrogen to calcium</span>
          <a href="#/explore" className="-my-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink transition-colors hover:text-ink-2">
            Explore the full periodic table <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}

/** A square of the first-20 fragment. Keeps the corner number at every size, down to phone cells. */
function FragmentCell({ el, size, on }: { el: Element; size: number; on: boolean }) {
  const radius = Math.min(12, Math.max(4, Math.round(size * 0.14)));
  const named = on && size >= 54;
  return (
    <div
      className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden ${on ? 'tile' : 'slot text-ink-3'}`}
      style={{ '--c': catVar(el.category), borderRadius: radius } as CSSProperties}
    >
      <span className="tile-number absolute" style={{ left: Math.max(3, Math.round(size * 0.09)), top: Math.max(3, Math.round(size * 0.08)), fontSize: size < 48 ? 9 : Math.round(size * 0.16) }}>
        {el.number}
      </span>
      <span className="font-medium leading-none" style={{ fontSize: Math.round(size * (named ? 0.34 : 0.38)), marginTop: Math.round(size * (named ? 0.08 : 0.14)) }}>
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

/**
 * The whole table as your map: elements you have met in their category colours, the rest in plain ink.
 * Below 28px a cell cannot hold readable text, so the phone map is plain printed squares, no symbols or markers.
 */
function TableMap({ mastery, met }: { mastery: Record<number, Mastery>; met: number }) {
  const [cell, setCell] = useState(0);
  const compact = cell > 0 && cell < 28;
  return (
    <a href="#/explore" className="card card-link block p-4 sm:p-5">
      <div aria-hidden>
        <PeriodicGrid
          minCell={12}
          maxCell={36}
          gap={2}
          showMarkers={!compact}
          onLayout={setCell}
          renderCell={(el, rect) => (
            <ElementTile
              element={el}
              size={rect.size}
              showName={false}
              showNumber={false}
              showSymbol={rect.size >= 28}
              color={isMet(mastery, el.number) ? undefined : 'var(--ink-3)'}
            />
          )}
        />
      </div>
      <span className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-sm text-ink-2">
          In colour: the <span className="num text-ink">{met}</span> of 118 you have met
        </span>
        <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
          Explore the full periodic table <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
        </span>
      </span>
    </a>
  );
}

function LevelStrip({ level, progress, toNext, learning, mastered, achievements }: { level: number; progress: number; toNext: number } & Omit<LevelInfo, 'level'>) {
  return (
    <a href="#/progress" className="card card-link mt-4 flex shrink-0 items-center gap-4 p-4 sm:px-5">
      <Ring value={progress} size={40} stroke={3}>
        <span className="num text-sm font-medium">{level}</span>
      </Ring>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">
          Level {level} · {titleForLevel(level)}
        </span>
        <span className="meta mt-1 block">
          {toNext.toLocaleString('en-US')} XP to next level · {achievements} {achievements === 1 ? 'achievement' : 'achievements'}
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
  const place = e.group ? `Group ${e.group} · period ${e.period}` : `Period ${e.period}`;
  const facts: [string, string][] = [
    ['State at 20 °C', e.state],
    ['Discovered', e.ancient ? 'Ancient' : (e.year?.toString() ?? '—')],
  ];
  return (
    <article className="card grid gap-5 p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-8 sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,20rem)] lg:gap-x-12">
      <div className="h-28 w-28">
        <ElementTile element={e} size={112} />
      </div>
      <div className="min-w-0">
        <h3 className="t-heading">{e.name}</h3>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
          <span className="flex items-center gap-2">
            <span className="dot" style={{ '--c': c } as CSSProperties} aria-hidden />
            {categoryLabel(e.category)}
          </span>
          <span className="mono text-[13px]">{formatNumber(e.mass, 6)} u</span>
          <span className="mono text-[13px]">{place}</span>
        </p>
        {e.summary && <p className="mt-4 max-w-2xl text-[15px] leading-6 text-ink-2">{e.summary}</p>}
        {e.fact && <p className="mt-4 max-w-2xl border-l-2 border-line-strong pl-4 text-[15px] leading-6 text-ink">{e.fact}</p>}
        <button onClick={() => openDetail(e.number)} className="btn btn-secondary mt-6">
          Open the full card
        </button>
      </div>
      <aside aria-label={`More about ${e.name}`} className="min-w-0 sm:col-start-2 lg:col-start-3 lg:border-l lg:border-line lg:pl-8">
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
    <a href={href} className="card card-link flex flex-col p-5">
      <span className="block text-base font-medium leading-6">{title}</span>
      <span className="mt-1 block text-sm text-ink-2">{body}</span>
      {children && <span className="mt-auto block pt-4">{children}</span>}
      <ActionLine className="mt-6">{action}</ActionLine>
    </a>
  );
}

function HowItWorks() {
  const steps = [
    { title: 'Place', body: 'Drag tiles onto the table, or tap a tile and then its cell. Fast, correct moves build your combo.' },
    { title: 'Learn', body: 'Every element opens into a card: what it is, where you meet it, and one fact worth remembering.' },
    { title: 'Master', body: 'Periodica tracks each element. Get it right first time, again and again, and it lights up on your map.' },
  ];
  return (
    <section aria-labelledby="how-title" className={`${PAGE} mt-16`}>
      <SectionHeader id="how-title" title="How it works" />
      <ol className="grid gap-6 border-t border-line pt-6 md:grid-cols-3 md:gap-8">
        {steps.map((s, i) => (
          <li key={s.title}>
            <h3 className="text-base font-medium leading-6">
              <span className="mono mr-3 text-sm text-ink-3">{i + 1}</span>
              {s.title}
            </h3>
            <p className="mt-1 text-sm text-ink-2">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A short, honest note for teachers and parents deciding whether to recommend the app. Quiet, like a colophon. */
function ForTeachers() {
  const points = [
    { title: 'What it covers', body: 'Starts with elements 1 to 20, then the groups: alkali metals, halogens, noble gases and more, through to the whole table.' },
    { title: 'No accounts', body: 'No sign-up, no email, no names. Progress is saved only in this browser, on this device, and the app works offline.' },
    { title: 'Easy to check', body: 'Students can open Progress and show you a summary of the elements they have started and mastered.' },
  ];
  return (
    <section aria-labelledby="teachers-title" className={`${PAGE} mt-16`}>
      <SectionHeader id="teachers-title" title="For teachers and parents" sub="Free, private, and built around short practice" />
      <dl className="grid gap-6 border-t border-line pt-6 md:grid-cols-3 md:gap-8">
        {points.map((pt) => (
          <div key={pt.title}>
            <dt className="text-base font-medium leading-6">{pt.title}</dt>
            <dd className="mt-1 text-sm text-ink-2">{pt.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
