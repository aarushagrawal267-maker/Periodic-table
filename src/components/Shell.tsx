import { motion } from 'motion/react';
import { BarChart3, CalendarDays, Flame, Gamepad2, GraduationCap, House, Settings, Telescope } from 'lucide-react';
import type { ReactNode } from 'react';
import { todayKey } from '../lib/daily';
import type { Route } from '../lib/router';
import { levelFromXp } from '../lib/scoring';
import { liveStreak, useProgress } from '../store/progress';
import { useUi } from '../store/ui';
import { Ring } from './Stats';

const NAV = [
  { path: '/', name: 'home', label: 'Home', icon: House, mobile: true },
  { path: '/learn', name: 'learn', label: 'Learn', icon: GraduationCap, mobile: true },
  { path: '/play', name: 'play', label: 'Play', icon: Gamepad2, mobile: true },
  { path: '/daily', name: 'daily', label: 'Daily', icon: CalendarDays, mobile: true },
  { path: '/explore', name: 'explore', label: 'Explore', icon: Telescope, mobile: true },
  { path: '/progress', name: 'progress', label: 'Progress', icon: BarChart3, mobile: false },
] as const;

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <a href="#/" className="flex items-center gap-2.5" aria-label="Periodica home">
      <div className="relative grid place-items-center rounded-[10px] p-[1.5px]" style={{ width: size, height: size, background: 'var(--grad)' }}>
        <div className="font-display grid h-full w-full place-items-center rounded-[9px] bg-bg text-[13px] font-bold">
          <span className="text-grad">Pa</span>
        </div>
      </div>
      <span className="font-display text-lg font-semibold tracking-tight">Periodica</span>
    </a>
  );
}

export function Shell({ children, immersive, route }: { children: ReactNode; immersive: boolean; route: Route['name'] }) {
  const xp = useProgress((s) => s.xp);
  const daily = useProgress((s) => s.daily);
  const setSettings = useUi((s) => s.setSettings);
  const lvl = levelFromXp(xp);
  const streak = liveStreak(daily, todayKey());
  const active = route === 'game' ? 'play' : route;

  if (immersive) return <div className="relative z-10">{children}</div>;

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => {
              const on = active === n.name;
              return (
                <a key={n.path} href={`#${n.path}`} aria-current={on ? 'page' : undefined} className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors ${on ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}>
                  {on && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-surface-2" transition={{ type: 'spring', damping: 30, stiffness: 400 }} />}
                  <span className="relative">{n.label}</span>
                </a>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <a href="#/daily" className="btn-ghost flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold" aria-label={`Daily streak: ${streak} days`}>
              <Flame size={17} className={streak ? 'fill-[#ff9f43] text-[#ff9f43]' : 'text-ink-3'} />
              <span className="tabular-nums">{streak}</span>
            </a>
            <a href="#/progress" className="btn-ghost flex h-10 items-center gap-2 rounded-full pl-1 pr-3 text-sm font-semibold" aria-label={`Level ${lvl.level}, ${Math.round(lvl.progress * 100)} percent to next level`}>
              <Ring value={lvl.progress} size={32} stroke={3}>
                <span className="text-[11px] font-bold">{lvl.level}</span>
              </Ring>
              <span className="hidden tabular-nums sm:inline">{xp.toLocaleString('en-US')} XP</span>
            </a>
            <button onClick={() => setSettings(true)} className="btn-ghost grid h-10 w-10 place-items-center rounded-full" aria-label="Settings">
              <Settings size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 pb-24 md:pb-0">{children}</div>

      <footer className="hidden border-t border-line py-8 text-center text-xs text-ink-3 md:block">
        Periodica · Property data from PubChem (NCBI) · Made for curious minds
      </footer>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/80 px-2 pt-2 backdrop-blur-xl md:hidden" aria-label="Main">
        <ul className="mx-auto flex max-w-md justify-between">
          {NAV.filter((n) => n.mobile).map((n) => {
            const on = active === n.name;
            const I = n.icon;
            return (
              <li key={n.path} className="flex-1">
                <a href={`#${n.path}`} aria-current={on ? 'page' : undefined} className="relative flex flex-col items-center gap-1 py-1.5 text-[11px] font-medium">
                  {on && <motion.span layoutId="tab-pill" className="absolute -top-2 h-[3px] w-8 rounded-full" style={{ background: 'var(--grad)' }} />}
                  <I size={22} className={on ? 'text-ink' : 'text-ink-3'} strokeWidth={on ? 2.2 : 1.8} />
                  <span className={on ? 'text-ink' : 'text-ink-3'}>{n.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
