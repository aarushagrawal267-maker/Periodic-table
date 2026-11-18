import { motion } from 'motion/react';
import { ArrowRight, Lock, Star } from 'lucide-react';
import { ElementTile } from '../components/ElementTile';
import { Icon, TIER_COLOR } from '../components/Icon';
import { PeriodicGrid } from '../components/PeriodicGrid';
import { Ring } from '../components/Stats';
import { ACHIEVEMENTS } from '../lib/achievements';
import { REGIONS } from '../lib/regions';
import { formatTime, levelFromXp, titleForLevel } from '../lib/scoring';
import { DIFFICULTIES } from '../store/settings';
import { masteredCount, useProgress } from '../store/progress';
import { useUi } from '../store/ui';

export function ProgressScreen() {
  const p = useProgress();
  const openDetail = useUi((s) => s.openDetail);
  const lvl = levelFromXp(p.xp);
  const mastered = masteredCount(p.mastery);
  const learning = Object.values(p.mastery).filter((m) => m.s >= 1 && m.s < 4).length;
  const fresh = learning + mastered === 0;
  const attempts = p.stats.placements + p.stats.mistakes;
  const acc = attempts ? Math.round((p.stats.placements / attempts) * 100) : 0;
  const unlocked = ACHIEVEMENTS.filter((a) => p.achievements[a.id]).length;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div className="grid-lines pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative flex flex-col items-center gap-6 sm:flex-row">
          <Ring value={lvl.progress} size={132} stroke={10}>
            <div className="text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Level</div>
              <div className="font-display text-4xl font-bold">{lvl.level}</div>
            </div>
          </Ring>
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold text-accent-2">{titleForLevel(lvl.level)}</p>
            <h1 className="font-display mt-1 text-4xl font-semibold">Your progress</h1>
            <p className="mt-2 text-ink-2">
              {p.xp.toLocaleString('en-US')} XP · {lvl.toNext.toLocaleString('en-US')} XP to level {lvl.level + 1}
            </p>
            <p className="mt-1 text-sm text-ink-3">{p.stats.playMs ? `${formatTime(p.stats.playMs)} played` : 'Every lesson and game adds XP.'}</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 sm:ml-auto sm:w-auto sm:grid-cols-3">
            {[
              ['Learning', learning],
              ['Mastered', mastered],
              ['Rounds', p.stats.rounds],
              ['Accuracy', attempts ? `${acc}%` : '—'],
              ['Best combo', p.stats.bestCombo],
              ['Best streak', `${p.daily.bestStreak}d`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-surface px-4 py-3">
                <div className="text-[11px] uppercase tracking-wider text-ink-3">{k}</div>
                <div className="font-display mt-0.5 text-xl font-semibold tabular-nums">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold">Mastery map</h2>
            <p className="mt-1 text-sm text-ink-2">Each right answer makes an element glow brighter, and a slip dims it a little. Four steps up and it&rsquo;s mastered.</p>
          </div>
          <p className="shrink-0 text-right text-sm text-ink-2">
            Learning <span className="font-display text-xl font-semibold tabular-nums text-ink">{learning}</span>
            <span className="mx-1.5 text-ink-3">·</span>
            Mastered <span className="font-display text-grad text-xl font-bold tabular-nums">{mastered}</span>
          </p>
        </div>
        {fresh && (
          <a href="#/learn" className="card card-hover group mt-4 flex items-center gap-4 p-4 sm:p-5" style={{ borderColor: 'color-mix(in oklab, var(--accent-2) 40%, transparent)' }}>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Your map is waiting to light up</span>
              <span className="mt-0.5 block text-sm text-ink-2">Finish your first lesson and hydrogen, helium and friends start to glow.</span>
            </span>
            <ArrowRight aria-hidden size={20} className="shrink-0 text-accent-2 transition-transform group-hover:translate-x-0.5" />
          </a>
        )}
        <div className="card mt-4 p-3 sm:p-5">
          <PeriodicGrid
            minCell={32}
            maxCell={64}
            showAxes
            renderCell={(e, rect) => {
              const s = p.mastery[e.number]?.s ?? 0;
              return (
                <button onClick={() => openDetail(e.number)} className="relative block h-full w-full transition-transform hover:z-10 hover:scale-110" aria-label={`${e.name}: ${s >= 4 ? 'mastered' : s ? `learning, ${s} of 4` : 'not started yet'}`}>
                  <ElementTile element={e} size={rect.size} showName={false} color={s ? undefined : 'var(--ink-3)'} style={{ opacity: s ? 0.45 + s * 0.11 : 0.42 }} />
                  {s >= 4 && <span className="absolute right-[8%] top-[8%] h-1.5 w-1.5 rounded-full bg-accent-3 shadow-[0_0_8px_var(--accent-3)]" />}
                </button>
              );
            }}
          />
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="font-display text-2xl font-semibold">Region records</h2>
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
                        <Star size={13} className={b ? 'fill-gold text-gold' : ''} />
                        {b ? b.stars : '–'}
                      </span>
                    );
                  })}
                </span>
              </a>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">{Object.keys(p.best).length ? 'Stars shown for Learner · Standard · Expert' : 'No stars yet. Every region starts here, so pick one and have a go.'}</p>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-semibold">Achievements</h2>
            <span className="text-sm text-ink-3">
              {unlocked ? `${unlocked}/${ACHIEVEMENTS.length}` : `${ACHIEVEMENTS.length} to discover`}
            </span>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {ACHIEVEMENTS.map((a, i) => {
              const at = p.achievements[a.id];
              const color = TIER_COLOR[a.tier];
              return (
                <motion.li key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }} className={`flex items-center gap-3 rounded-2xl border p-3.5 ${at ? 'border-line bg-surface' : 'border-dashed border-line'}`}>
                  <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${at ? 'shine' : ''}`} style={{ background: at ? `color-mix(in oklab, ${color} 18%, transparent)` : 'var(--surface)', color: at ? color : 'var(--ink-3)' }}>
                    {at ? <Icon name={a.icon} size={22} /> : <Lock size={18} />}
                  </div>
                  <div className="min-w-0">
                    <div className={`font-display font-semibold ${at ? '' : 'text-ink-2'}`}>{a.name}</div>
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
