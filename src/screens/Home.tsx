import { motion } from 'motion/react';
import { ArrowRight, BrainCircuit, CalendarDays, Check, Flame, GraduationCap, Hand, Lightbulb, Play, Sparkles, Star, Trophy } from 'lucide-react';
import { useMemo } from 'react';
import { ElementTile } from '../components/ElementTile';
import { MiniTable } from '../components/MiniTable';
import { PeriodicGrid } from '../components/PeriodicGrid';
import { Ring } from '../components/Stats';
import { DAILY_SIZE, dailyNumber, todayKey } from '../lib/daily';
import { ELEMENTS, catVar, categoryLabel } from '../lib/elements';
import { hashString } from '../lib/random';
import { REGIONS } from '../lib/regions';
import { CHAPTERS } from '../lib/chapters';
import { levelFromXp, titleForLevel } from '../lib/scoring';
import { liveStreak, masteredCount, useProgress } from '../store/progress';
import { useUi } from '../store/ui';
import { Countdown } from './Daily';

const spring = { type: 'spring', damping: 24, stiffness: 220 } as const;

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

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
    <div className="overflow-x-clip">
      {/* Hero */}
      <section className="relative">
        <div className="grid-lines pointer-events-none absolute inset-x-0 top-0 h-[520px]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-10 pt-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:pt-16">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
            <a href="#/daily" className="group inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-sm text-ink-2 transition-colors hover:border-line-strong">
              <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-bg" style={{ background: 'var(--grad)' }}>
                Today
              </span>
              Daily #{dailyNumber(key)} is live
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </a>
            <h1 className="font-display mt-6 text-[44px] font-semibold leading-[1.02] sm:text-6xl lg:text-[68px]">
              {returning ? (
                <>
                  {greeting()}.<br />
                  <span className="text-grad">Ready for round {p.stats.rounds + 1}?</span>
                </>
              ) : (
                <>
                  Master every element.
                  <br />
                  <span className="text-grad">One perfect move at a time.</span>
                </>
              )}
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-2">
              Drag elements into place, build combos, and learn the story behind all 118. Periodica remembers what you find hard and brings it back until it sticks.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {returning ? (
                <a href={`#/play/${next.id}`} className="btn-primary shine flex h-14 items-center justify-center gap-2 rounded-2xl px-7 text-base">
                  <Play size={18} className="fill-current" /> Play {next.name}
                </a>
              ) : (
                <a href={`#/learn/${nextChapter.id}`} className="btn-primary shine flex h-14 items-center justify-center gap-2 rounded-2xl px-7 text-base">
                  <GraduationCap size={19} /> Start learning
                </a>
              )}
              <a href={returning ? `#/learn/${nextChapter.id}` : `#/play/${next.id}`} className="btn-ghost flex h-14 items-center justify-center gap-2 rounded-2xl px-7 text-base font-medium">
                {returning ? (
                  <>
                    <GraduationCap size={18} /> Next lesson
                  </>
                ) : (
                  <>
                    <Play size={17} /> Jump straight in
                  </>
                )}
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-3">
              {['3-minute lessons', 'Works offline', 'No sign-up', 'Free'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check size={15} className="text-accent-3" /> {t}
                </li>
              ))}
            </ul>
          </motion.div>

          <HeroTable featured={featured.number} />
        </div>
      </section>

      {/* Dashboard */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <motion.a href="#/daily" className="group relative overflow-hidden rounded-[28px] p-[1.5px] lg:col-span-2" style={{ background: 'var(--grad)' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
            <div className="solid relative flex h-full flex-col gap-6 overflow-hidden rounded-[27px] p-6 sm:flex-row sm:items-center sm:p-8">
              <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-30 blur-3xl" style={{ background: 'var(--accent-2)' }} />
              <div className="relative flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-accent-2">
                  <CalendarDays size={16} /> Daily Challenge #{dailyNumber(key)}
                </div>
                <h2 className="font-display mt-2 text-3xl font-semibold">{today ? 'Done for today. Nice.' : `${DAILY_SIZE} elements. One shot.`}</h2>
                <p className="mt-2 max-w-md text-ink-2">
                  {today ? `You scored ${today.score.toLocaleString('en-US')}. Share your grid and come back tomorrow to keep your streak.` : 'The same puzzle for every player today, scattered across the whole table. Keep your streak alive.'}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-4">
                  <span className="btn-primary inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm">
                    {today ? 'See result' : 'Play now'} <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-ink-2">
                    <Flame size={16} className={streak ? 'fill-[#ff9f43] text-[#ff9f43]' : ''} /> {streak} day streak
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
                    <div className="flex flex-wrap justify-center gap-1 rounded-xl bg-bg/80 p-2 backdrop-blur">
                      {today.trail.map((t, i) => (
                        <span key={i} className="h-4 w-4 rounded" style={{ background: t === 'hit' ? 'var(--good)' : t === 'hint' ? 'var(--gold)' : 'var(--bad)' }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.a>

          <motion.a href="#/progress" className="card group flex flex-col justify-between p-6 transition-colors hover:bg-surface-2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }}>
            <div className="flex items-center gap-4">
              <Ring value={lvl.progress} size={72} stroke={7}>
                <span className="font-display text-xl font-bold">{lvl.level}</span>
              </Ring>
              <div>
                <div className="text-sm text-ink-3">Level {lvl.level}</div>
                <div className="font-display text-xl font-semibold">{titleForLevel(lvl.level)}</div>
                <div className="text-xs text-ink-3">{lvl.toNext.toLocaleString('en-US')} XP to next</div>
              </div>
            </div>
            <div className="mt-6">
              <div className="flex justify-between text-sm">
                <span className="text-ink-2">Elements mastered</span>
                <span className="font-semibold tabular-nums">{mastered}/118</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full" style={{ width: `${(mastered / 118) * 100}%`, background: 'var(--grad)' }} />
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-ink-2">
                  <Trophy size={15} className="text-gold" /> {Object.keys(p.achievements).length} achievements
                </span>
                <span className="font-medium text-accent-2">View progress →</span>
              </div>
            </div>
          </motion.a>
        </div>
      </section>

      {/* Regions */}
      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-semibold">Pick a region</h2>
            <p className="mt-1 text-ink-2">Start small, then take on the whole table.</p>
          </div>
          <a href="#/play" className="shrink-0 text-sm font-semibold text-accent-2 hover:underline">
            All modes →
          </a>
        </div>
        <div className="no-scrollbar -mx-4 mt-3 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-4 pt-3 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-56px),transparent)] sm:-mx-6 sm:scroll-px-6 sm:px-6">
          {REGIONS.map((r, i) => {
            const bestStars = Math.max(0, ...Object.entries(p.best).filter(([k]) => k.startsWith(r.id + ':')).map(([, v]) => v.stars));
            return (
              <motion.a
                key={r.id}
                href={`#/play/${r.id}`}
                className="card group w-[260px] shrink-0 snap-start p-5 transition-[background,transform] duration-300 hover:-translate-y-1 hover:bg-surface-2"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...spring, delay: i * 0.04 }}
              >
                <MiniTable highlight={new Set(r.numbers)} className="w-full" />
                <div className="mt-4 flex items-center justify-between">
                  <h3 className="font-display font-semibold">{r.name}</h3>
                  <span className="text-xs tabular-nums text-ink-3">{r.short}</span>
                </div>
                <div className="mt-2 flex gap-0.5">
                  {[0, 1, 2].map((s) => (
                    <Star key={s} size={14} className={s < bestStars ? 'fill-gold text-gold' : 'text-line-strong'} />
                  ))}
                </div>
              </motion.a>
            );
          })}
        </div>
      </section>

      <section className="mx-auto mt-4 max-w-7xl px-4 sm:px-6">
        <ElementOfTheDay n={featured.number} />
      </section>

      {/* Real life + quiz */}
      <section className="mx-auto mt-14 grid max-w-7xl gap-4 px-4 sm:px-6 lg:grid-cols-2">
        <motion.a href="#/life" className="card group relative overflow-hidden p-6 transition-colors hover:bg-surface-2 sm:p-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full opacity-25 blur-3xl" style={{ background: 'var(--accent-3)' }} />
          <div className="relative flex gap-2 text-4xl" aria-hidden>
            <span>📱</span>
            <span>🎆</span>
            <span>🍌</span>
            <span>🦴</span>
          </div>
          <h2 className="font-display relative mt-6 text-3xl font-semibold">In Real Life</h2>
          <p className="relative mt-2 text-ink-2">What's inside your phone? Why are fireworks red? Spot the elements hiding in everyday things.</p>
          <span className="relative mt-5 inline-flex items-center gap-1.5 font-semibold text-accent-3">
            Spot the elements <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </span>
        </motion.a>
        <motion.a href="#/quiz" className="card group relative flex flex-col justify-between overflow-hidden p-6 transition-colors hover:bg-surface-2 sm:p-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          <div className="pointer-events-none absolute -bottom-16 -right-10 h-56 w-56 rounded-full opacity-25 blur-3xl" style={{ background: 'var(--accent)' }} />
          <div className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: 'color-mix(in oklab, var(--accent) 18%, transparent)', color: 'var(--accent)' }}>
            <BrainCircuit size={28} />
          </div>
          <div className="relative mt-8">
            <h2 className="font-display text-3xl font-semibold">Quick Quiz</h2>
            <p className="mt-2 text-ink-2">Ten fast questions — symbols, numbers, families and facts — weighted towards the elements you haven't nailed yet.</p>
            <span className="mt-5 inline-flex items-center gap-1.5 font-semibold text-accent">
              Take a quiz <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </motion.a>
      </section>

      {/* How it works */}
      {!returning && (
        <section className="mx-auto mt-16 max-w-7xl px-4 sm:px-6">
          <h2 className="font-display text-center text-3xl font-semibold">How it works</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { icon: Hand, title: 'Place', body: 'Drag tiles onto the table — or tap a tile, then its cell. Fast, correct moves build your combo.' },
              { icon: Lightbulb, title: 'Learn', body: 'Every element opens into a card: what it is, where you meet it, and one fact worth remembering.' },
              { icon: Sparkles, title: 'Master', body: 'Periodica tracks each element. Get it right first time, again and again, and it lights up on your map.' },
            ].map((s, i) => (
              <motion.div key={s.title} className="card p-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.08 }}>
                <div className="flex items-center gap-3">
                  <span className="font-display text-grad text-sm font-bold">0{i + 1}</span>
                  <s.icon size={20} className="text-ink-2" />
                </div>
                <h3 className="font-display mt-4 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-ink-2">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </section>
      )}
      <div className="h-16" />
    </div>
  );
}

function HeroTable({ featured }: { featured: number }) {
  const openDetail = useUi((s) => s.openDetail);
  const e = ELEMENTS[featured - 1];
  return (
    <motion.div className="relative" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring, delay: 0.1 }}>
      <div className="pointer-events-none absolute -inset-10 rounded-[48px] opacity-60 blur-3xl" style={{ background: 'radial-gradient(closest-side, color-mix(in oklab, var(--accent) 30%, transparent), transparent)' }} />
      <div className="glass relative rounded-[28px] p-3 sm:p-5" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <PeriodicGrid
          minCell={12}
          maxCell={40}
          gap={2}
          renderCell={(el, rect) => (
            <motion.button
              onClick={() => openDetail(el.number)}
              className="block h-full w-full transition-transform duration-200 hover:z-10 hover:scale-[1.35]"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 + (el.col + el.row * 1.6) * 0.022, type: 'spring', damping: 16, stiffness: 260 }}
              aria-label={el.name}
              tabIndex={-1}
            >
              <ElementTile element={el} size={rect.size} showName={false} showNumber={false} className={el.number === featured ? 'ring-2 ring-white/70' : ''} />
            </motion.button>
          )}
        />
      </div>
      <motion.button
        onClick={() => openDetail(e.number)}
        className="glass absolute left-[22%] top-[9%] hidden items-center gap-3 rounded-2xl p-3 pr-5 text-left sm:flex"
        style={{ boxShadow: 'var(--shadow-lg)' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: [0, -6, 0] }}
        transition={{ opacity: { delay: 1.2 }, y: { delay: 1.2, duration: 5, repeat: Infinity, ease: 'easeInOut' } }}
      >
        <div className="h-12 w-12">
          <ElementTile element={e} size={48} showName={false} />
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Element of the day</div>
          <div className="font-display font-semibold">{e.name}</div>
        </div>
      </motion.button>
    </motion.div>
  );
}

function ElementOfTheDay({ n }: { n: number }) {
  const openDetail = useUi((s) => s.openDetail);
  const e = ELEMENTS[n - 1];
  const c = catVar(e.category);
  return (
    <motion.article className="card relative overflow-hidden p-6 sm:p-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full opacity-25 blur-3xl" style={{ background: c }} />
      <div className="relative flex flex-col gap-6 sm:flex-row">
        <div className="h-28 w-28 shrink-0" style={{ filter: `drop-shadow(0 16px 30px color-mix(in oklab, ${c} 40%, transparent))` }}>
          <ElementTile element={e} size={112} showName={false} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: c }}>
            Element of the day · {categoryLabel(e.category)}
          </p>
          <h2 className="font-display mt-1 text-3xl font-semibold">{e.name}</h2>
          <p className="mt-3 leading-relaxed text-ink-2">{e.summary}</p>
          <p className="mt-4 border-l-2 pl-4 text-[15px] italic leading-relaxed" style={{ borderColor: c }}>
            {e.fact}
          </p>
          <button onClick={() => openDetail(e.number)} className="mt-5 inline-flex items-center gap-1.5 font-semibold" style={{ color: c }}>
            Open the full card <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </motion.article>
  );
}
