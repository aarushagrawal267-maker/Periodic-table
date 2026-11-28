import { BarChart3, CalendarDays, Flame, Gamepad2, GraduationCap, House, Settings, Telescope } from 'lucide-react';
import type { ReactNode } from 'react';
import { MARK_HEIGHT, MARK_SQUARES, MARK_WIDTH, markRect } from '../lib/brand';
import { todayKey } from '../lib/daily';
import { catVar } from '../lib/elements';
import type { Route } from '../lib/router';
import { levelFromXp } from '../lib/scoring';
import { liveStreak, useProgress } from '../store/progress';
import { useUi } from '../store/ui';
import { AccountEntry, useAccountSlot } from './account/AccountEntry';
import { GoalRingBadge } from './DailyGoal';
import { Ring } from './Stats';
import '../styles/brand.css';

const NAV = [
  { path: '/', name: 'home', label: 'Home', icon: House, mobile: true },
  { path: '/learn', name: 'learn', label: 'Learn', icon: GraduationCap, mobile: true },
  { path: '/play', name: 'play', label: 'Play', icon: Gamepad2, mobile: true },
  { path: '/daily', name: 'daily', label: 'Daily', icon: CalendarDays, mobile: true },
  { path: '/explore', name: 'explore', label: 'Explore', icon: Telescope, mobile: true },
  { path: '/progress', name: 'progress', label: 'Progress', icon: BarChart3, mobile: false },
] as const;

/**
 * Widths at which the header has room for the daily goal ring, by what the account entry shows. From md to lg the
 * top nav takes the room, so the ring waits for lg there (at 768px the header would otherwise push Settings off screen).
 */
const GOAL_SHOWN = {
  none: 'hidden min-[375px]:max-md:contents lg:contents',
  guest: 'hidden min-[375px]:max-[399px]:contents min-[460px]:max-md:contents lg:contents',
  avatar: 'hidden min-[430px]:max-md:contents lg:contents',
} as const;

/**
 * The account entry and what it shows: nothing, "Sign in" from 400px, or a 44px avatar (AccountEntry). In a build
 * without accounts both are constants, so the bundler leaves the account code out. The env check is written out
 * for that, rather than isConfigured() (docs/ACCOUNTS.md 8.3).
 */
const HeaderAccount = import.meta.env.VITE_FIREBASE_PROJECT_ID ? AccountEntry : () => null;
const useHeaderAccount = import.meta.env.VITE_FIREBASE_PROJECT_ID ? useAccountSlot : (): keyof typeof GOAL_SHOWN => 'none';

/**
 * The mark: the periodic table's silhouette as flat squares in the chart's category colours, tall at both ends and
 * low in the middle (geometry in src/lib/brand.ts, shared with the app icons). The fills are the theme's category
 * variables, so it follows light, dark and the colour-blind palette. `size` is its height; it is wider than tall,
 * like the chart.
 */
export function LogoMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={Math.round((size * MARK_WIDTH) / MARK_HEIGHT)}
      height={size}
      viewBox={`0 0 ${MARK_WIDTH} ${MARK_HEIGHT}`}
      aria-hidden
      focusable="false"
      className="logo-mark shrink-0"
    >
      {MARK_SQUARES.map((s) => {
        const r = markRect(s);
        return <rect key={s.z} x={r.x} y={r.y} width={r.size} height={r.size} rx={r.radius} fill={catVar(s.category)} />;
      })}
    </svg>
  );
}

/** `compact`: below 340px only the mark shows, to leave room for the account avatar in the header. */
export function Logo({ size = 18, compact = false }: { size?: number; compact?: boolean }) {
  return (
    <a href="#/" className="-mx-2 flex h-11 items-center gap-2 rounded-control px-2 md:h-9" aria-label="Periodica home">
      <LogoMark size={size} />
      <span className={`text-[17px] font-semibold leading-none ${compact ? 'max-[339px]:hidden' : ''}`}>Periodica</span>
    </a>
  );
}

export function Shell({ children, immersive, route }: { children: ReactNode; immersive: boolean; route: Route['name'] }) {
  const xp = useProgress((s) => s.xp);
  const daily = useProgress((s) => s.daily);
  const setSettings = useUi((s) => s.setSettings);
  const lvl = levelFromXp(xp);
  const streak = liveStreak(daily, todayKey());
  const active = route === 'game' || route === 'challenge' ? 'play' : route;
  const account = useHeaderAccount();

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
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6 md:h-16 md:gap-4 lg:gap-8">
          <Logo compact={account === 'avatar'} />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => {
              const on = active === n.name;
              return (
                <a
                  key={n.path}
                  href={`#${n.path}`}
                  aria-current={on ? 'page' : undefined}
                  className={`relative flex h-9 items-center rounded-control px-2 text-[15px] font-medium lg:px-3 transition-colors duration-150 ease-out ${on ? 'text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}
                >
                  {n.label}
                  {/* The current section: a 2px cobalt bar on the header's bottom edge, the top bar's twin of the tab bar marker. */}
                  {on && <span aria-hidden className="nav-mark" />}
                </a>
              );
            })}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-0 sm:gap-1">
            <a
              href="#/daily"
              className={`flex h-11 items-center gap-2 rounded-control px-2 text-[15px] transition-colors duration-150 ease-out hover:bg-surface-2 md:h-9 md:px-3 ${streak ? 'text-ink' : 'text-ink-3'}`}
              aria-label={`Daily streak: ${streak} days`}
              title={`Daily streak: ${streak} ${streak === 1 ? 'day' : 'days'}`}
            >
              <Flame size={18} strokeWidth={1.5} className={streak ? 'text-ink-2' : 'text-ink-3'} />
              <span className="mono">{streak}</span>
              <span className="hidden text-[13px] text-ink-3 xl:inline">day streak</span>
            </a>
            {/* Below 375px (and at 400% zoom) there is no room; the goal is on Home anyway (WCAG 1.4.10). On phones the settings
                icon sits on the page gutter (its 44px target reaches into the padding), which leaves room for the goal from 375px.
                With the account entry in the header it needs more: from 430px beside the avatar, and beside "Sign in" (from 400px)
                from 460px, so a three-digit streak and "140/150" still fit without squeezing a 44px target (see GOAL_SHOWN). */}
            <div className={account === 'none' ? GOAL_SHOWN.none : account === 'guest' ? GOAL_SHOWN.guest : GOAL_SHOWN.avatar}>
              <GoalRingBadge />
            </div>
            <a
              href="#/progress"
              className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-control px-1 transition-colors duration-150 ease-out hover:bg-surface-2 sm:pr-3 md:h-9"
              aria-label={`Level ${lvl.level}, ${xp.toLocaleString('en-US')} XP, ${Math.round(lvl.progress * 100)} percent to next level`}
              title={`Level ${lvl.level} · ${xp.toLocaleString('en-US')} XP`}
            >
              <Ring value={lvl.progress} size={28} stroke={2.5}>
                <span className="mono text-[11px] leading-none text-ink">{lvl.level}</span>
              </Ring>{' '}
              <span className="mono hidden whitespace-nowrap text-[13px] text-ink-2 sm:max-md:inline lg:inline">{xp.toLocaleString('en-US')} XP</span>
            </a>
            <HeaderAccount />
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
