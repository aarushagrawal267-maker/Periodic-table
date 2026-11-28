import { motion } from 'motion/react';
import { Lock, Star } from 'lucide-react';
import { ElementTile, Plate } from '../components/ElementTile';
import { Icon, TIER_COLOR } from '../components/Icon';
import { PeriodicGrid } from '../components/PeriodicGrid';
import { ACHIEVEMENTS } from '../lib/achievements';
import { REGIONS } from '../lib/regions';
import { formatTime, levelFromXp, titleForLevel } from '../lib/scoring';
import { DIFFICULTIES } from '../store/settings';
import { masteredCount, masteryPercent, useProgress } from '../store/progress';
import { useUi } from '../store/ui';

export function ProgressScreen() {
  const p = useProgress();
  const openDetail = useUi((s) => s.openDetail);
  const lvl = levelFromXp(p.xp);
  const mastered = masteredCount(p.mastery);
  const attempts = p.stats.placements + p.stats.mistakes;
  const acc = attempts ? Math.round((p.stats.placements / attempts) * 100) : 0;
  const unlocked = ACHIEVEMENTS.filter((a) => p.achievements[a.id]).length;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div className="relative flex flex-col items-center gap-6 sm:flex-row">
          <Plate size={112} corner="Lv" label={titleForLevel(lvl.level)}>
            {lvl.level}
          </Plate>
          <div className="w-full text-center sm:w-auto sm:text-left">
            <p className="text-sm text-ink-3">Level {lvl.level}</p>
            <h1 className="font-display mt-1 text-4xl font-medium">Your progress</h1>
            <p className="mt-2 tabular-nums text-ink-2">
              {p.xp.toLocaleString('en-US')} XP · {lvl.toNext.toLocaleString('en-US')} XP to level {lvl.level + 1}
            </p>
            <div className="mx-auto mt-3 h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-line sm:mx-0" role="progressbar" aria-valuenow={Math.round(lvl.progress * 100)} aria-valuemax={100} aria-label="Progress to next level">
              <div className="h-full rounded-full bg-accent" style={{ width: `${lvl.progress * 100}%` }} />
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 sm:ml-auto sm:w-auto sm:grid-cols-3">
            {[
              ['Mastered', `${mastered}/118`],
              ['Rounds', p.stats.rounds],
              ['Accuracy', attempts ? `${acc}%` : '—'],
              ['Best combo', p.stats.bestCombo],
              ['Best streak', `${p.daily.bestStreak} day${p.daily.bestStreak === 1 ? '' : 's'}`],
              ['Time played', formatTime(p.stats.playMs)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line px-4 py-3">
                <div className="text-xs text-ink-3">{k}</div>
                <div className="font-display mt-0.5 text-xl font-medium tabular-nums">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-medium">Mastery map</h2>
            <p className="mt-1 text-sm text-ink-2">Elements light up as you get them right first time. Four correct in a row (net) marks one mastered.</p>
          </div>
          <span className="font-display shrink-0 text-3xl font-medium tabular-nums">{Math.round(masteryPercent(p.mastery) * 100)}%</span>
        </div>
        <div className="card mt-4 p-3 sm:p-5">
          <PeriodicGrid
            minCell={32}
            maxCell={64}
            showAxes
            renderCell={(e, rect) => {
              const s = p.mastery[e.number]?.s ?? 0;
              return (
                <button onClick={() => openDetail(e.number)} className="relative block h-full w-full transition-opacity hover:opacity-80" aria-label={`${e.name}: mastery ${s} of 5`}>
                  <ElementTile element={e} size={rect.size} showName={false} color={s ? undefined : 'var(--ink-3)'} style={{ opacity: s ? 0.35 + s * 0.13 : 0.3 }} />
                  {s >= 4 && <span className="absolute right-[8%] top-[8%] h-1.5 w-1.5 rounded-full bg-ink" />}
                </button>
              );
            }}
          />
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="font-display text-2xl font-medium">Region records</h2>
          <div className="card mt-4 divide-y divide-line">
            {REGIONS.map((r) => (
              <a key={r.id} href={`#/play/${r.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.accent }} />
                <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                <span className="flex gap-3">
                  {DIFFICULTIES.map((d) => {
                    const b = p.best[`${r.id}:${d.id}`];
                    return (
                      <span key={d.id} className="flex items-center gap-1 text-xs tabular-nums text-ink-3" title={`${d.name}: ${b ? `${b.score} pts` : 'not cleared'}`}>
                        <Star size={14} strokeWidth={1.75} className={b ? 'fill-gold text-gold' : ''} />
                        {b ? b.stars : '–'}
                      </span>
                    );
                  })}
                </span>
              </a>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">Stars shown for Learner · Standard · Expert</p>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-medium">Achievements</h2>
            <span className="text-sm text-ink-3">
              {unlocked}/{ACHIEVEMENTS.length}
            </span>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {ACHIEVEMENTS.map((a, i) => {
              const at = p.achievements[a.id];
              const color = TIER_COLOR[a.tier];
              return (
                <motion.li key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.04 }} className={`flex items-center gap-4 rounded-xl border p-3 ${at ? 'border-line bg-surface' : 'border-dashed border-line'}`}>
                  <Plate size={48} corner={i + 1} muted={!at}>
                    {at ? <Icon name={a.icon} size={18} /> : <Lock size={16} strokeWidth={1.75} />}
                  </Plate>
                  <div className="min-w-0">
                    <div className={`font-display flex items-center gap-2 font-medium ${at ? '' : 'text-ink-2'}`}>
                      {a.name}
                      {at && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} title={a.tier} aria-label={`${a.tier} tier`} />}
                    </div>
                    <div className="text-xs text-ink-3">{a.desc}</div>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
