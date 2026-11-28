import { formatDate } from '../lib/date';
import { ArrowRight, Lock, Star } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { SectionHeader } from '../components/SectionHeader';
import { ElementChip, ElementTile, tileRadius } from '../components/ElementTile';
import { Icon, TIER_COLOR } from '../components/Icon';
import { PeriodicGrid } from '../components/PeriodicGrid';
import { useGridRoving } from '../components/useGridRoving';
import { ACHIEVEMENTS } from '../lib/achievements';
import { CHAPTERS } from '../lib/chapters';
import { ELEMENTS, byNumber, catVar } from '../lib/elements';
import { familyCounts, fillStep, improvedSince, readSeen, stepWords, sweepDelay, writeSeen } from '../lib/masteryMap';
import { REGIONS } from '../lib/regions';
import { readMeta } from '../lib/syncMeta';
import { formatTime, levelFromXp, titleForLevel } from '../lib/scoring';
import { DIFFICULTIES, useSettings } from '../store/settings';
import { masteredCount, useProgress } from '../store/progress';
import { useUi } from '../store/ui';
import '../styles/progress.css';

const fmt = (n: number) => n.toLocaleString('en-US');
/** Strip the period from one-line data captions (copy rule: captions end without one). */
const caption = (s: string) => s.replace(/\.$/, '');

/**
 * One column template for the records header and every row, so names and stars sit in straight columns at every width.
 * Phones: the name takes its own line and the three difficulties sit under it in equal columns, matching the header.
 * From sm: name, then three narrow star columns. From lg: wider columns.
 */
const RECORD_COLS =
  'grid grid-cols-3 items-center gap-x-2 gap-y-1 px-2 sm:grid-cols-[minmax(0,1fr)_repeat(3,3.5rem)] sm:gap-2 sm:px-3 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] lg:gap-6';

/** This device's localStorage, or nothing where it is blocked. Only the map's UI-only "last seen" snapshot uses it. */
function deviceStore() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Whose map the "moved up" snapshot belongs to: changes when the device changes hands (sign in or out) or progress is reset. */
function seenOwner() {
  try {
    const m = readMeta();
    return `${m.gen}:${m.epoch}`;
  } catch {
    return '';
  }
}

/** How many symbols the "moved up" line names before it sums up the rest. */
const UP_NAMED = 8;

export function ProgressScreen() {
  const p = useProgress();
  const openDetail = useUi((s) => s.openDetail);
  const lvl = levelFromXp(p.xp);
  const mastered = masteredCount(p.mastery);
  const learning = Object.values(p.mastery).filter((m) => m.s >= 1 && m.s < 4).length;
  const fresh = learning + mastered === 0;
  const attempts = p.stats.placements + p.stats.mistakes;
  const acc = attempts ? Math.round((p.stats.placements / attempts) * 100) : 0;
  const roving = useGridRoving();
  const unlocked = ACHIEVEMENTS.filter((a) => p.achievements[a.id]).length;
  const streak = p.daily.bestStreak;

  // The map's motion: the opening sweep and the "moved up" ring. Both are off with the app setting or the OS setting.
  const reduceSetting = useSettings((s) => s.reduceMotion);
  const animate = !(useReducedMotion() || reduceSetting);
  // What moved up since the map was last shown, read once as the page opens. The snapshot is UI-only (not progress, never synced).
  const [improved] = useState(() => new Set(improvedSince(readSeen(deviceStore(), seenOwner()), p.mastery)));
  useEffect(() => writeSeen(deviceStore(), p.mastery, seenOwner()), [p.mastery]);
  const upList = [...improved];

  // The next lesson's elements that are not started yet are outlined in their family colour: where the colouring starts.
  const nextChapter = CHAPTERS.find((c) => !p.chapters[c.id]);
  const nextUp = new Set((nextChapter?.numbers ?? []).filter((n) => fillStep(p.mastery[n]?.s) === 0));
  const families = familyCounts(p.mastery);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <h1 className="t-title">Your progress</h1>

      {/* Numbers first: a label, a figure and what it is measured against. Every row shares one height, so the stat cards line up on phones too. */}
      <section aria-label="Summary" className="mt-8 grid auto-rows-fr grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <div className="card col-span-2 flex flex-col p-4 sm:p-5 lg:min-h-36">
          <div className="flex items-baseline justify-between gap-4">
            <p className="label">Level</p>
            <p className="meta">{fmt(p.xp)} XP in total</p>
          </div>
          <p className="mt-2 flex items-baseline gap-3">
            <span className="num text-[32px] font-medium leading-none">{lvl.level}</span>
            <span className="text-ink-2">{titleForLevel(lvl.level)}</span>
          </p>
          <div className="mt-auto pt-4 sm:pt-5">
            <div className="meter" role="progressbar" aria-label={`Progress to level ${lvl.level + 1}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(lvl.progress * 100)}>
              <div className="meter-fill" style={{ transform: `scaleX(${lvl.progress})` }} />
            </div>
            <p className="meta mt-2">
              {fmt(lvl.toNext)} XP to level {lvl.level + 1}
            </p>
          </div>
        </div>
        <Stat label="Mastered" value={fmt(mastered)} note={`of ${ELEMENTS.length} elements`} />
        <Stat label="Learning" value={fmt(learning)} note="in progress" />
        <Stat label="Rounds" value={fmt(p.stats.rounds)} note={p.stats.playMs ? `${formatTime(p.stats.playMs)} (min:s) played` : 'Finished rounds count here'} />
        <Stat label="Accuracy" value={attempts ? `${acc}%` : '–'} note={attempts ? `${fmt(p.stats.placements)} of ${fmt(attempts)} right` : 'No placements yet'} />
        <Stat label="Best combo" value={fmt(p.stats.bestCombo)} note="answers in a row" />
        <Stat label="Best streak" value={fmt(streak)} note={streak === 1 ? 'day in a row' : 'days in a row'} />
      </section>

      <TeacherSummary />

      {/* The one main chart: mastery across the table. The wall chart prints itself in as you learn. */}
      <section className="mt-12 md:mt-16" aria-labelledby="mastery-map">
        {/*
          The shared section header, then the key 16px under it. From lg the key moves to the right of the header, its last
          line level with the sub line (both keep their 16px bottom margin, so the bottoms meet).
        */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-x-8">
          <SectionHeader
            id="mastery-map"
            title="Mastery map"
            sub="Each right answer colours an element in a step, and a slip takes it a step back. Four steps and it is mastered."
          />
          {/* Phones: two equal columns, so the entries line up instead of wrapping ragged. From sm one line. */}
          <ul className="mb-4 grid shrink-0 grid-cols-2 gap-x-4 gap-y-2 text-sm text-ink-2 sm:flex sm:flex-wrap sm:gap-x-5" aria-label="Key">
            <KeyItem swatch={<Swatch step={0} />} label="Not started" count={ELEMENTS.length - learning - mastered} />
            <KeyItem
              swatch={
                <span className="flex gap-0.5">
                  <Swatch step={1} />
                  <Swatch step={2} />
                  <Swatch step={3} />
                </span>
              }
              label="Learning"
              count={learning}
            />
            <KeyItem swatch={<Swatch step={4} />} label="Mastered" count={mastered} />
          </ul>
        </div>
        {fresh && (
          <a href={`#/learn/${nextChapter?.id ?? ''}`} className="card card-link mb-4 flex items-center gap-4 p-4 sm:p-5">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Your map is empty</span>
              <span className="mt-1 block text-sm text-ink-2">Start the first lesson: hydrogen to neon, outlined below, colour in as you get them right</span>
            </span>
            <ArrowRight aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-ink-3" />
          </a>
        )}
        {!fresh && (upList.length > 0 || nextUp.size > 0) && (
          <div className="mb-4 grid gap-1 text-sm text-ink-2">
            {upList.length > 0 && (
              <p>
                Since your last visit, {upList.length === 1 ? '1 element' : `${fmt(upList.length)} elements`} moved up:{' '}
                <span className="text-ink">
                  {upList
                    .slice(0, UP_NAMED)
                    .map((n) => byNumber(n).symbol)
                    .join(', ')}
                </span>
                {upList.length > UP_NAMED && ` and ${fmt(upList.length - UP_NAMED)} more`}
              </p>
            )}
            {nextChapter && nextUp.size > 0 && (
              <p>
                Outlined: {nextUp.size === 1 ? 'the element' : `the ${fmt(nextUp.size)} elements`} still to start in your next lesson,{' '}
                <a href={`#/learn/${nextChapter.id}`} className="text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink-2">
                  {nextChapter.title}
                </a>
              </p>
            )}
          </div>
        )}
        <div className="card p-4 sm:p-5" data-roving role="group" aria-label="Mastery map. Use the arrow keys to move between elements.">
          <PeriodicGrid
            minCell={32}
            maxCell={64}
            showAxes
            renderCell={(e, rect) => {
              const step = fillStep(p.mastery[e.number]?.s);
              const radius = tileRadius(rect.size);
              const next = step === 0 && nextUp.has(e.number);
              const up = improved.has(e.number);
              return (
                <button
                  {...roving.cellProps(e)}
                  onFocus={() => roving.setActive(e.number)}
                  onClick={() => openDetail(e.number)}
                  className="pm-cell group focus-visible:z-10"
                  data-step={step}
                  data-next={next || undefined}
                  style={{ borderRadius: radius, '--c': catVar(e.category), '--fill': step / 4, '--d': `${sweepDelay(e)}ms`, '--r': `${radius}px` } as CSSProperties}
                  aria-label={`${e.symbol}, ${e.name}, ${e.number}: ${stepWords(step)}${up ? ', moved up since your last visit' : ''}${next ? ', in your next lesson' : ''}`}
                >
                  {step > 0 && (
                    <span aria-hidden className="pm-clip">
                      <span className={`pm-fill${animate ? ' pm-sweep' : ''}`} />
                    </span>
                  )}
                  <ElementTile element={e} size={rect.size} showName={false} quietNumber className="transition-colors duration-150 ease-out group-hover:border-ink-2!" />
                  {step >= 4 && <Star aria-hidden className="pm-star" size={Math.max(8, Math.round(rect.size * 0.2))} strokeWidth={2} />}
                  {up && animate && <span aria-hidden className="pm-up" />}
                </button>
              );
            }}
          />
        </div>

        {/* The same colouring, counted per family: a quiet row each, with a thin bar in the family colour. */}
        <h3 className="label mt-6">By family</h3>
        {/* Phones: two columns, a long name wraps and the bars stay level along each row. */}
        <ul className="card mt-2 grid grid-cols-2 gap-x-4 gap-y-4 p-4 sm:gap-x-8 sm:p-5 lg:grid-cols-5">
          {families.map((f) => (
            <li key={f.category} className="flex min-w-0 flex-col justify-end" style={{ '--c': catVar(f.category) } as CSSProperties}>
              <p className="text-[13px] leading-5 text-ink sm:text-sm">
                {f.name}
                <span className="sr-only">
                  : {f.mastered} of {f.total} mastered{f.learning ? `, ${f.learning} learning` : ''}
                </span>
              </p>
              <div aria-hidden className="mt-1 flex items-center gap-2">
                <div className="pm-bar min-w-0 flex-1">
                  <span className="pm-bar-learning" style={{ transform: `scaleX(${(f.mastered + f.learning) / f.total})` }} />
                  <span className="pm-bar-mastered" style={{ transform: `scaleX(${f.mastered / f.total})` }} />
                </div>
                <span className="meta shrink-0">
                  {f.mastered}/{f.total}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* min-w-0 lets the columns shrink at 320px instead of pushing the page sideways (WCAG 1.4.10). */}
      <section className="mt-12 grid gap-12 md:mt-16 md:gap-16">
        <div className="min-w-0">
          <SectionHeader title="Region records" sub="Your best stars in each region, by difficulty" />
          <div className="card p-2">
            <div className={`${RECORD_COLS} pb-1 pt-2 text-xs text-ink-3`} aria-hidden>
              <span className="hidden sm:block">Stars by difficulty</span>
              {DIFFICULTIES.map((d) => (
                <span key={d.id} className="sm:text-right lg:text-left">
                  {d.name}
                </span>
              ))}
            </div>
            <ul>
              {REGIONS.map((r) => (
                <li key={r.id}>
                  <a
                    href={`#/play/${r.id}`}
                    className={`row ${RECORD_COLS} rounded-[8px] py-2`}
                    aria-label={`${r.name}: ${DIFFICULTIES.map((d) => {
                      const b = p.best[`${r.id}:${d.id}`];
                      return `${d.name} ${b ? `${b.stars} ${b.stars === 1 ? 'star' : 'stars'}` : 'not cleared'}`;
                    }).join(', ')}`}
                  >
                    <span className="col-span-3 min-w-0 text-[15px] leading-5 sm:col-span-1 sm:truncate">{r.name}</span>
                    {DIFFICULTIES.map((d) => {
                        const b = p.best[`${r.id}:${d.id}`];
                        return (
                          <span key={d.id} className="num flex h-5 items-center gap-1 text-sm text-ink-2 sm:justify-end lg:justify-start" title={`${d.name}: ${b ? `${fmt(b.score)} pts` : 'not cleared'}`}>
                            {b ? (
                              <>
                                <Star size={14} strokeWidth={1.5} aria-hidden style={{ fill: 'var(--star)', color: 'var(--star-line)' }} />
                                {b.stars}
                              </>
                            ) : (
                              <span className="text-ink-3">–</span>
                            )}
                          </span>
                        );
                      })}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          {!Object.keys(p.best).some((k) => REGIONS.some((r) => k.startsWith(`${r.id}:`))) && <p className="mt-2 text-sm text-ink-3">No stars yet. Pick any region to play its first round.</p>}
        </div>

        <div className="min-w-0">
          <SectionHeader title="Achievements" aside={<span className="meta">{unlocked ? `${unlocked} of ${ACHIEVEMENTS.length}` : `${ACHIEVEMENTS.length} to discover`}</span>} />
          <ul className="card grid divide-y divide-line p-2 sm:auto-rows-fr sm:grid-cols-2 sm:gap-x-2 sm:divide-y-0 xl:grid-cols-3">
            {ACHIEVEMENTS.map((a) => {
              const at = p.achievements[a.id];
              return (
                <li key={a.id} className="flex min-h-16 items-center gap-3 px-2 py-3 sm:px-3 sm:py-2">
                  <span className="grid w-5 shrink-0 place-items-center">{at ? <Icon name={a.icon} size={18} className="text-ink-2" /> : <Lock size={16} strokeWidth={1.5} aria-hidden className="text-ink-3" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`flex items-center gap-2 text-[15px] leading-6 ${at ? 'text-ink' : 'text-ink-2'}`}>
                      <span className="truncate">{a.name}</span>
                      <span className="dot" style={{ '--c': TIER_COLOR[a.tier] } as CSSProperties} title={`${a.tier[0].toUpperCase()}${a.tier.slice(1)} tier`} aria-hidden />
                      <span className="sr-only">
                        , {a.tier} tier, {at ? 'unlocked' : 'locked'}
                      </span>
                    </p>
                    <p className="text-[13px] leading-5 text-ink-3">{caption(a.desc)}</p>
                    {/* Phones: the date goes under the description, so the text keeps the full width. */}
                    {at && <p className="meta mt-1 sm:hidden">{formatDate(at)}</p>}
                  </div>
                  {at && <span className="meta hidden shrink-0 sm:block">{formatDate(at)}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card flex flex-col p-4 sm:p-5 lg:min-h-36">
      <p className="label">{label}</p>
      <p className="num mt-2 text-[28px] font-medium leading-none">{value}</p>
      <p className="meta mt-auto pt-3">{note}</p>
    </div>
  );
}

function KeyItem({ swatch, label, count }: { swatch: ReactNode; label: string; count: number }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden className="grid">
        {swatch}
      </span>
      {label}
      <span className="meta">{fmt(count)}</span>
    </li>
  );
}

/** A key swatch: the map's fill steps on a neutral tile (the map itself uses each family's colour). */
function Swatch({ step }: { step: number }) {
  return (
    <span className="pm-swatch" data-step={step} style={{ '--fill': step / 4 } as CSSProperties}>
      {step > 0 && (
        <span className="pm-clip">
          <span className="pm-fill" />
        </span>
      )}
      {step >= 4 && <Star className="pm-star" size={10} strokeWidth={2} />}
    </span>
  );
}

/** A plain summary a student can screenshot or show to a teacher. Everything here comes from the progress this browser holds (the account's, when signed in). */
function TeacherSummary() {
  const mastery = useProgress((s) => s.mastery);
  const chapters = useProgress((s) => s.chapters);
  const started = Object.entries(mastery).filter(([, m]) => m.s >= 1);
  const masteredList = started
    .filter(([, m]) => m.s >= 4)
    .map(([n]) => Number(n))
    .sort((a, b) => a - b);
  const first20 = CHAPTERS.slice(0, 2).flatMap((c) => c.numbers);
  const first20Started = first20.filter((n) => (mastery[n]?.s ?? 0) >= 1).length;
  const first20Mastered = first20.filter((n) => (mastery[n]?.s ?? 0) >= 4).length;
  const done = CHAPTERS.filter((c) => chapters[c.id]);
  const date = formatDate(new Date(), true);
  return (
    <section className="card mt-12 p-4 sm:p-6 md:mt-16" aria-labelledby="teacher-summary">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="teacher-summary" className="t-heading">
          Show my teacher
        </h2>
        <span className="meta">{date}</span>
      </div>
      <p className="mt-1 text-sm text-ink-2">A summary of your work, ready for a screenshot</p>
      <dl className="mt-4 grid gap-px sm:mt-5 overflow-hidden rounded-control border border-line bg-line sm:grid-cols-3">
        {[
          ['First 20 elements', `${first20Started} of 20 started · ${first20Mastered} mastered`],
          ['All elements', `${started.length} started · ${masteredList.length} mastered`],
          ['Lessons finished', `${done.length} of ${CHAPTERS.length}`],
        ].map(([k, v]) => (
          <div key={k} className="bg-surface px-4 py-3">
            <dt className="label">{k}</dt>
            <dd className="num mt-1 text-[15px] font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {done.length > 0 && (
        <p className="mt-4 text-sm text-ink-2">
          <span className="text-ink">Lessons</span> {done.map((c) => c.title).join(', ')}
        </p>
      )}
      {masteredList.length ? (
        <div className="mt-4">
          <p className="text-sm text-ink">Mastered</p>
          <p className="sr-only">{masteredList.map((n) => byNumber(n).symbol).join(', ')}</p>
          <div className="mt-2 flex flex-wrap gap-1" aria-hidden>
            {masteredList.map((n) => (
              <ElementChip key={n} element={byNumber(n)} size={32} />
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-2">Nothing mastered yet. Get an element right four times to master it.</p>
      )}
    </section>
  );
}
