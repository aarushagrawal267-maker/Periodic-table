import { BarChart3, CalendarDays, Flame, Gamepad2, GraduationCap, House, Settings, Telescope } from 'lucide-react';
import type { ReactNode } from 'react';
import { todayKey } from '../lib/daily';
import type { Route } from '../lib/router';
import { levelFromXp } from '../lib/scoring';
import { liveStreak, useProgress } from '../store/progress';
import { useUi } from '../store/ui';
import { GoalRingBadge } from './DailyGoal';
import { Ring } from './Stats';

const NAV = [
  { path: '/', name: 'home', label: 'Home', icon: House, mobile: true },
  { path: '/learn', name: 'learn', label: 'Learn', icon: GraduationCap, mobile: true },
  { path: '/play', name: 'play', label: 'Play', icon: Gamepad2, mobile: true },
  { path: '/daily', name: 'daily', label: 'Daily', icon: CalendarDays, mobile: true },
  { path: '/explore', name: 'explore', label: 'Explore', icon: Telescope, mobile: true },
  { path: '/progress', name: 'progress', label: 'Progress', icon: BarChart3, mobile: false },
] as const;

/** Flat mark: the product's own element square, "Pa". The app icon adds its atomic number, 91, in the corner. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className="shrink-0 text-ink">
      <rect x="0.75" y="0.75" width="26.5" height="26.5" rx="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x="14" y="18.5" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="11" fontWeight="600" fill="currentColor">
        Pa
      </text>
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <a href="#/" className="-mx-2 flex h-11 items-center gap-2 rounded-control px-2 md:h-9" aria-label="Periodica home">
      <LogoMark size={size} />
      <span className="text-[17px] font-semibold leading-none">Periodica</span>
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

  // Immersive screens (games, lessons) bring their own <main>, so the skip-link target here is a plain wrapper.
  if (immersive)
    return (
      <div id="main" tabIndex={-1} className="relative z-10 outline-none">
        {children}
      </div>
    );

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6 md:h-16 md:gap-8">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => {
              const on = active === n.name;
              return (
                <a
                  key={n.path}
                  href={`#${n.path}`}
                  aria-current={on ? 'page' : undefined}
                  className={`flex h-9 items-center rounded-control px-3 text-[15px] font-medium transition-colors duration-150 ease-out ${on ? 'bg-surface-2 text-ink shadow-[var(--highlight)]' : 'text-ink-2 hover:text-ink'}`}
                >
                  {n.label}
                </a>
              );
            })}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-0 sm:gap-1">
            <a
              href="#/daily"
              className={`flex h-11 items-center gap-2 rounded-control px-2 text-[15px] transition-colors duration-150 ease-out hover:bg-surface-2 md:h-9 md:px-3 ${streak ? 'text-ink' : 'text-ink-3'}`}
              aria-label={`Daily streak: ${streak} days`}
            >
              <Flame size={18} strokeWidth={1.5} className={streak ? 'text-ink-2' : 'text-ink-3'} />
              <span className="mono">{streak}</span>
            </a>
            {/* Below 375px (and at 400% zoom) there is no room; the goal is on Home anyway (WCAG 1.4.10). On phones the settings
                icon sits on the page gutter (its 44px target reaches into the padding), which leaves room for the goal from 375px. */}
            <div className="hidden min-[375px]:contents">
              <GoalRingBadge />
            </div>
            <a
              href="#/progress"
              className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-control px-1 transition-colors duration-150 ease-out hover:bg-surface-2 sm:pr-3 md:h-9"
              aria-label={`Level ${lvl.level}, ${xp.toLocaleString('en-US')} XP, ${Math.round(lvl.progress * 100)} percent to next level`}
            >
              <Ring value={lvl.progress} size={28} stroke={2.5}>
                <span className="mono text-[11px] leading-none text-ink">{lvl.level}</span>
              </Ring>{' '}
              <span className="mono hidden text-[13px] text-ink-2 sm:inline">{xp.toLocaleString('en-US')} XP</span>
            </a>
            <button onClick={() => setSettings(true)} className="icon-btn max-md:-mr-3" aria-label="Settings">
              <Settings size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="pb-tabbar flex-1 outline-none">
        {children}
      </main>

      <footer className="hidden border-t border-line py-8 md:block">
        <p className="mx-auto max-w-7xl px-6 text-[13px] text-ink-3">Periodica · Property data from PubChem (NCBI)</p>
      </footer>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg md:hidden" aria-label="Main">
        <ul className="mx-auto flex max-w-md">
          {NAV.filter((n) => n.mobile).map((n) => {
            const on = active === n.name;
            const I = n.icon;
            return (
              <li key={n.path} className="flex-1">
                <a
                  href={`#${n.path}`}
                  aria-current={on ? 'page' : undefined}
                  className={`relative flex h-14 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors duration-150 ease-out ${on ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`}
                >
                  {on && <span aria-hidden className="absolute inset-x-0 top-0 mx-auto h-0.5 w-6 rounded-full bg-accent" />}
                  <I size={20} strokeWidth={1.5} />
                  <span>{n.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
