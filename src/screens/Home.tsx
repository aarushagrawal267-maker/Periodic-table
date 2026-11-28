import { motion } from 'motion/react';
import { ArrowRight, Banana, Bone, BrainCircuit, CalendarDays, Flame, GraduationCap, PartyPopper, Play, Smartphone, Star, Trophy } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { ElementTile, Plate } from '../components/ElementTile';
import { MiniTable } from '../components/MiniTable';
import { PeriodicGrid } from '../components/PeriodicGrid';
import { DAILY_SIZE, dailyNumber, todayKey } from '../lib/daily';
import { ELEMENTS, catVar, categoryLabel, formatNumber } from '../lib/elements';
import { hashString } from '../lib/random';
import { REGIONS } from '../lib/regions';
import { CHAPTERS } from '../lib/chapters';
import { levelFromXp, titleForLevel } from '../lib/scoring';
import { liveStreak, masteredCount, useProgress } from '../store/progress';
import { useUi } from '../store/ui';
import { Countdown } from './Daily';

const EASE = [0.22, 1, 0.36, 1] as const;
const enter = { duration: 0.4, ease: EASE } as const;

export function Home() {
  const p = useProgress();
  const key = todayKey();
  const today = p.daily.results[key];
  const streak = liveStreak(p.daily, key);
  const lvl = levelFromXp(p.xp);
  const mastered = masteredCount(p.mastery);
  const returning = p.stats.rounds > 0 || p.stats.quizzes > 0;
  const next = REGIONS.find((r) => !Object.keys(p.best).some((k) => k.startsWith(r.id + ':'))) ?? REGIONS[REGIONS.length - 1];
  const nextChapter = CHAPTERS.find((c) => !p.chapters[c.id]) ?? CHAPTERS[0];
  const featured = useMemo(() => ELEMENTS[hashString('eotd:' + key) % ELEMENTS.length], [key]);

  return (
    <motion.div className="overflow-x-clip" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={enter}>
      {/* Hero */}
      <section className="mx-auto grid max-w-7xl gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:pt-16">
        <div>
          <a href="#/daily" className="group inline-flex items-center gap-2 text-sm text-ink-2 transition-colors hover:text-ink">
            <CalendarDays size={16} strokeWidth={1.75} className="text-ink-3" />
            Daily #{dailyNumber(key)} is ready
            <ArrowRight size={14} strokeWidth={1.75} className="text-ink-3" />
          </a>
          <h1 className="font-display mt-6 max-w-[14ch] text-[40px] font-medium leading-[1.06] sm:text-[56px] lg:text-[64px]" style={{ letterSpacing: '-0.025em' }}>
            {returning ? `Next up: ${next.name}` : 'Learn the periodic table by building it'}
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-[1.6] text-ink-2">
            Drag elements into place, build combos, and learn the story behind all 118. Periodica remembers what you find hard and brings it back until it sticks.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {returning ? (
              <a href={`#/play/${next.id}`} className="btn-primary flex h-12 items-center justify-center gap-2 rounded-[10px] px-6 text-base">
                <Play size={16} strokeWidth={1.75} /> Play {next.name}
              </a>
            ) : (
              <a href={`#/learn/${nextChapter.id}`} className="btn-primary flex h-12 items-center justify-center gap-2 rounded-[10px] px-6 text-base">
                <GraduationCap size={18} strokeWidth={1.75} /> Start learning
              </a>
            )}
            <a href={returning ? `#/learn/${nextChapter.id}` : `#/play/${next.id}`} className="btn-ghost flex h-12 items-center justify-center gap-2 rounded-[10px] px-6 text-base font-medium">
              {returning ? (
                <>
                  <GraduationCap size={18} strokeWidth={1.75} /> Next lesson
                </>
              ) : (
                <>
                  <Play size={16} strokeWidth={1.75} /> Jump straight in
                </>
              )}
            </a>
          </div>
          <p className="mt-6 text-sm text-ink-3">Free, no sign-up, works offline. Lessons take about three minutes.</p>
        </div>

        <HeroTable featured={featured.number} />
      </section>

      {/* Today */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <a href="#/daily" className="card card-hover group relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8 lg:col-span-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm text-ink-2">
                <CalendarDays size={16} strokeWidth={1.75} className="text-ink-3" /> Daily Challenge #{dailyNumber(key)}
              </div>
              <h2 className="font-display mt-2 text-[28px] font-medium leading-tight">{today ? 'Done for today' : `${DAILY_SIZE} elements, one shot`}</h2>
              <p className="mt-2 max-w-md text-ink-2">
                {today ? `You scored ${today.score.toLocaleString('en-US')}. Share your grid and come back tomorrow to keep your streak.` : 'The same puzzle for every player today, scattered across the whole table. Keep your streak alive.'}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                <span className="btn-primary inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-sm">
                  {today ? 'See result' : 'Play now'} <ArrowRight size={16} strokeWidth={1.75} />
                </span>
                <span className="flex items-center gap-2 text-sm text-ink-2">
                  <Flame size={16} strokeWidth={1.75} className={streak ? 'text-accent-ink' : 'text-ink-3'} /> <span className="tabular-nums">{streak}</span> day streak
                </span>
                <span className="text-sm text-ink-3">
                  Next in <Countdown />
                </span>
              </div>
            </div>
            <div className="relative w-full sm:w-64">
              <MiniTable className="w-full" highlight={new Set()} color={() => undefined} />
              {today && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="solid flex flex-wrap justify-center gap-1 rounded-lg border border-line p-2">
                    {today.trail.map((t, i) => (
                      <span key={i} className="h-4 w-4 rounded" style={{ background: t === 'hit' ? 'var(--good)' : t === 'hint' ? 'var(--gold)' : 'var(--bad)' }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </a>

          <a href="#/progress" className="card card-hover group flex flex-col justify-between gap-6 p-6">
            <div className="flex items-center gap-4">
              <Plate size={72} corner="Lv" label={titleForLevel(lvl.level)}>
                {lvl.level}
              </Plate>
              <div>
                <div className="font-display text-xl font-medium">Level {lvl.level}</div>
                <div className="mt-1 text-sm tabular-nums text-ink-3">{lvl.toNext.toLocaleString('en-US')} XP to next</div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-ink-2">Elements mastered</span>
                <span className="font-medium tabular-nums">{mastered}/118</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(mastered / 118) * 100}%` }} />
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-ink-2">
                  <Trophy size={16} strokeWidth={1.75} className="text-ink-3" /> <span className="tabular-nums">{Object.keys(p.achievements).length}</span> achievements
                </span>
                <span className="inline-flex items-center gap-1 font-medium text-accent-ink">
                  View progress <ArrowRight size={14} strokeWidth={1.75} />
                </span>
              </div>
            </div>
          </a>
        </div>
      </section>

      {/* Regions */}
      <section className="mx-auto mt-16 max-w-7xl px-4 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-[28px] font-medium leading-tight">Pick a region</h2>
            <p className="mt-1 text-ink-2">Start small, then take on the whole table</p>
          </div>
          <a href="#/play" className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
            All modes <ArrowRight size={14} strokeWidth={1.75} />
          </a>
        </div>
        <div className="no-scrollbar -mx-4 mt-6 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:scroll-px-0 sm:px-0">
          {REGIONS.map((r) => {
            const bestStars = Math.max(0, ...Object.entries(p.best).filter(([k]) => k.startsWith(r.id + ':')).map(([, v]) => v.stars));
            return (
              <a key={r.id} href={`#/play/${r.id}`} className="card card-hover group w-[256px] shrink-0 snap-start p-5">
                <MiniTable highlight={new Set(r.numbers)} className="w-full" />
                <div className="mt-4 flex items-center justify-between gap-2">
                  <h3 className="font-display truncate font-medium">{r.name}</h3>
                  <span className="shrink-0 text-xs tabular-nums text-ink-3">{r.short}</span>
                </div>
                <div className="mt-2 flex gap-1" aria-label={`${bestStars} of 3 stars`}>
                  {[0, 1, 2].map((s) => (
                    <Star key={s} size={14} strokeWidth={1.75} className={s < bestStars ? 'fill-gold text-gold' : 'text-line-strong'} />
                  ))}
                </div>
              </a>
            );
          })}
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl px-4 sm:px-6">
        <ElementOfTheDay n={featured.number} />
      </section>

      {/* Real life + quiz */}
      <section className="mx-auto mt-16 grid max-w-7xl gap-4 px-4 sm:px-6 lg:grid-cols-2">
        <a href="#/life" className="card card-hover group flex flex-col p-6 sm:p-8">
          <div className="flex gap-2 text-ink-2" aria-hidden>
            {[Smartphone, PartyPopper, Banana, Bone].map((I, i) => (
              <span key={i} className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-bg">
                <I size={18} strokeWidth={1.5} />
              </span>
            ))}
          </div>
          <h2 className="font-display mt-6 text-[28px] font-medium leading-tight">In Real Life</h2>
          <p className="mt-2 text-ink-2">What's inside your phone? Why are fireworks red? Spot the elements hiding in everyday things.</p>
          <span className="mt-auto inline-flex items-center gap-1 pt-6 font-medium text-accent-ink">
            Spot the elements <ArrowRight size={16} strokeWidth={1.75} />
          </span>
        </a>
        <a href="#/quiz" className="card card-hover group flex flex-col p-6 sm:p-8">
          <span className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-bg text-ink-2" aria-hidden>
            <BrainCircuit size={18} strokeWidth={1.5} />
          </span>
          <h2 className="font-display mt-6 text-[28px] font-medium leading-tight">Quick Quiz</h2>
          <p className="mt-2 text-ink-2">Ten fast questions on symbols, numbers, families and facts, weighted towards the elements you haven't nailed yet.</p>
          <span className="mt-auto inline-flex items-center gap-1 pt-6 font-medium text-accent-ink">
            Take a quiz <ArrowRight size={16} strokeWidth={1.75} />
          </span>
        </a>
      </section>

      {/* How it works */}
      {!returning && (
        <section className="mx-auto mt-16 max-w-7xl px-4 sm:px-6">
          <h2 className="font-display text-[28px] font-medium leading-tight">How it works</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              { sym: 'Pl', title: 'Place', body: 'Drag tiles onto the table, or tap a tile and then its cell. Fast, correct moves build your combo.' },
              { sym: 'Le', title: 'Learn', body: 'Every element opens into a card: what it is, where you meet it, and one fact worth remembering.' },
              { sym: 'Ma', title: 'Master', body: 'Periodica tracks each element. Get it right first time, again and again, and it fills in on your map.' },
            ].map((s, i) => (
              <div key={s.title} className="card flex gap-5 p-6">
                <Plate size={56} corner={i + 1}>
                  {s.sym}
                </Plate>
                <div>
                  <h3 className="font-display text-xl font-medium">{s.title}</h3>
                  <p className="mt-2 text-ink-2">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="h-16" />
    </motion.div>
  );
}

function HeroTable({ featured }: { featured: number }) {
  const openDetail = useUi((s) => s.openDetail);
  return (
    <div className="card p-3 sm:p-5">
      <PeriodicGrid
        minCell={12}
        maxCell={40}
        gap={2}
        renderCell={(el, rect) => (
          <button
            onClick={() => openDetail(el.number)}
            className="block h-full w-full rounded-[inherit] transition-opacity hover:opacity-80"
            aria-label={el.name}
            tabIndex={-1}
          >
            <ElementTile element={el} size={rect.size} showName={false} showNumber={false} className={el.number === featured ? 'outline outline-2 outline-offset-1 outline-[var(--ink)]' : ''} />
          </button>
        )}
      />
    </div>
  );
}

/** The element of the day, set like a printed specimen label. */
function ElementOfTheDay({ n }: { n: number }) {
  const openDetail = useUi((s) => s.openDetail);
  const e = ELEMENTS[n - 1];
  const c = catVar(e.category);
  const facts: [string, string][] = [
    ['Atomic mass', formatNumber(e.mass, 6)],
    ['Group · Period', `${e.group ?? '—'} · ${e.period}`],
    ['State at 20 °C', e.state],
  ];
  return (
    <article className="card overflow-hidden" style={{ '--c': c } as CSSProperties}>
      <div className="grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:gap-8 sm:p-8">
        <button onClick={() => openDetail(e.number)} className="h-32 w-32 shrink-0 rounded-[20px]" aria-label={`Open ${e.name}`}>
          <ElementTile element={e} size={128} />
        </button>
        <div className="min-w-0">
          <p className="text-sm text-ink-3">
            Element of the day · <span className="cat-ink">{categoryLabel(e.category)}</span>
          </p>
          <h2 className="font-display mt-1 text-[28px] font-medium leading-tight">{e.name}</h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-ink-2">{e.summary}</p>
          <p className="mt-4 max-w-3xl leading-relaxed">
            <span className="cat-ink font-medium">Did you know? </span>
            {e.fact}
          </p>
          <button onClick={() => openDetail(e.number)} className="mt-6 inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">
            Open the full card <ArrowRight size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
      <dl className="grid grid-cols-3 border-t border-dashed border-line-strong">
        {facts.map(([k, v], i) => (
          <div key={k} className={`px-6 py-4 sm:px-8 ${i ? 'border-l border-dashed border-line-strong' : ''}`}>
            <dt className="text-xs text-ink-3">{k}</dt>
            <dd className="mt-1 font-mono text-sm tabular-nums capitalize">{v}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
