import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, type MouseEvent } from 'react';
import { ElementDetailSheet } from './components/ElementDetail';
import { focusHeadingWhenSheetCloses } from './components/focusAfterSheet';
import { Shell } from './components/Shell';
import { SettingsSheet } from './components/SettingsSheet';
import { Toasts } from './components/Toasts';
import { CHAPTERS, chapterById } from './lib/chapters';
import { challengeLevelById, challengeUnlocked } from './lib/challenge';
import { regionById } from './lib/regions';
import { useRoute, type Route } from './lib/router';
import { DUR, EASE } from './components/motion';
import { ChallengeGame, ChallengeHub } from './screens/Challenge';
import { Daily } from './screens/Daily';
import { Explore } from './screens/Explore';
import { Home } from './screens/Home';
import { LearnPath, Lesson } from './screens/Learn';
import { Life } from './screens/Life';
import { Match } from './screens/Match';
import { PlayHub, RegionGame } from './screens/Play';
import { ProgressScreen } from './screens/Progress';
import { Quiz } from './screens/Quiz';
import { useProgress } from './store/progress';
import { useSettings } from './store/settings';
import { useUi } from './store/ui';

// The account screen and its forms load on first visit, so the guest bundle stays as it was (docs/ACCOUNTS.md 9).
// A build without accounts has only the "not set up yet" note. The env check is written out, rather than
// isConfigured(), so that the bundler leaves the account code out of such a build (section 8.3).
const Account = lazy(() =>
  import.meta.env.VITE_FIREBASE_PROJECT_ID
    ? import('./screens/Account').then((m) => ({ default: m.Account }))
    : import('./screens/AccountOff').then((m) => ({ default: m.AccountOff })),
);

export function App() {
  const route = useRoute();
  const { colorblind, reduceMotion } = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.colorblind = String(colorblind);
    root.classList.toggle('reduce-motion', reduceMotion);
  }, [colorblind, reduceMotion]);

  const best = useProgress((s) => s.best);
  const challengeLevel = route.name === 'challenge' && route.level ? challengeLevelById(route.level) : undefined;
  const challengePlayable = !!challengeLevel && challengeUnlocked(best, challengeLevel);

  // A puzzle or lesson link with an unknown id (mistyped, or saved before a rename) shows Home or the Learn path instead.
  // Those are ordinary pages, so they keep the header, the navigation and the <main> landmark.
  const immersive =
    (route.name === 'game' && !!regionById(route.region)) ||
    route.name === 'daily' ||
    route.name === 'quiz' ||
    route.name === 'life' ||
    route.name === 'match' ||
    (route.name === 'learn' && !!route.chapter && (route.chapter === 'review' || !!chapterById(route.chapter))) ||
    // A locked or unknown challenge level shows the Timed Challenge page instead, which keeps the header.
    (route.name === 'challenge' && challengePlayable);
  const key =
    route.name === 'game'
      ? `game-${route.region}`
      : route.name === 'learn'
        ? `learn-${route.chapter ?? ''}`
        : route.name === 'challenge'
          ? `challenge-${challengePlayable ? route.level : ''}`
          : route.name;

  // The element card and Settings are app-wide dialogs. Leaving the screen (browser or Android back, a link) closes
  // them, so a dialog never sits over a screen it was not opened on. A layout effect runs before the new screen's own
  // effects, so a screen that opens a card as it mounts (#/explore/Au) still shows it.
  // The new screen's heading then takes focus once the sheet has faded out; RouteFocus skips while a dialog is open.
  const wasImmersive = useRef(immersive);
  useLayoutEffect(() => {
    // Switching between the immersive and the page layout replaces the whole screen at once, so the heading on the
    // page is already the new one. Otherwise the old screen is still fading out and its heading is not the target.
    const sameLayout = wasImmersive.current === immersive;
    wasImmersive.current = immersive;
    const ui = useUi.getState();
    if (ui.detail === null && !ui.settingsOpen) return;
    const previous = sameLayout ? document.querySelector('#main h1') : null;
    if (ui.detail !== null) ui.openDetail(null);
    if (ui.settingsOpen) ui.setSettings(false);
    focusHeadingWhenSheetCloses(previous);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- immersive only changes along with key
  }, [key]);

  // Each screen has its own title, so screen-reader users and browser tabs know where they are (WCAG 2.4.2).
  const title = titleFor(route, challengePlayable);
  useEffect(() => {
    document.title = title;
  }, [title]);

  let screen;
  switch (route.name) {
    case 'home':
      screen = <Home />;
      break;
    case 'play':
      screen = <PlayHub />;
      break;
    case 'game':
      screen = <RegionGame regionId={route.region} />;
      break;
    case 'daily':
      screen = <Daily />;
      break;
    case 'quiz':
      screen = <Quiz />;
      break;
    case 'explore':
      screen = <Explore symbol={route.symbol} />;
      break;
    case 'progress':
      screen = <ProgressScreen />;
      break;
    case 'learn':
      screen = route.chapter ? <Lesson chapterId={route.chapter} /> : <LearnPath />;
      break;
    case 'life':
      screen = <Life />;
      break;
    case 'match':
      screen = <Match />;
      break;
    case 'account':
      // Lazy: rendered inside the <Suspense fallback={null}> below, together with RouteFocus.
      screen = <Account />;
      break;
    case 'challenge':
      screen = challengePlayable ? <ChallengeGame levelId={route.level!} /> : <ChallengeHub />;
      break;
  }

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
      <div className="relative min-h-dvh">
        {/* Moves focus without touching the URL: "#main" would otherwise be read as a route by the hash router. */}
        <a href="#main" onClick={skipToMain} className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-control focus:bg-surface-2 focus:px-4 focus:py-3 focus:text-ink focus:shadow-[var(--shadow-md)]">
          Skip to content
        </a>
        {/* An unknown puzzle shows Home, so the navigation marks Home as the current page, not Play. */}
        <Shell immersive={immersive} route={route.name === 'game' && !regionById(route.region) ? 'home' : route.name}>
          <AnimatePresence mode="wait">
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: DUR.menu, ease: EASE } }}
              transition={{ duration: DUR.enter, ease: EASE }}
            >
              {/* RouteFocus shares the boundary, so after a lazy screen loads it still finds that screen's h1. */}
              <Suspense fallback={null}>
                {screen}
                <RouteFocus />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </Shell>
        <ElementDetailSheet />
        <SettingsSheet />
        <Toasts />
      </div>
    </MotionConfig>
  );
}

function skipToMain(e: MouseEvent) {
  e.preventDefault();
  const main = document.getElementById('main');
  main?.focus();
  main?.scrollIntoView({ block: 'start' });
}

const SITE = 'Periodica';

function titleFor(route: Route, challengePlayable = false): string {
  const t = (name: string) => `${name} · ${SITE}`;
  switch (route.name) {
    case 'home':
      // Matches <title> in index.html, which search engines and link previews read (keep the two in step).
      return t('Periodic table game and quiz to learn the elements');
    case 'play':
      return t('Play');
    case 'game': {
      // An unknown puzzle shows Home (RegionGame), so it takes Home's title.
      const region = regionById(route.region);
      return region ? t(region.name) : titleFor({ name: 'home' });
    }
    case 'daily':
      return t('Daily challenge');
    case 'quiz':
      return t('Quick quiz');
    case 'explore':
      return t('Explore');
    case 'progress':
      return t('Your progress');
    case 'learn': {
      if (!route.chapter) return t('Learn');
      if (route.chapter === 'review') return t('Quick review');
      const i = CHAPTERS.findIndex((c) => c.id === route.chapter);
      return t(i >= 0 ? `Chapter ${i + 1}: ${CHAPTERS[i].title}` : 'Learn');
    }
    case 'life':
      return t('In real life');
    case 'match':
      return t('Match pairs');
    case 'account':
      return t('Your account');
    case 'challenge': {
      const level = challengePlayable && route.level ? challengeLevelById(route.level) : undefined;
      return level ? t(`Timed challenge, level ${level.level}`) : t('Timed challenge');
    }
  }
}

/** Set once the user has moved between screens; the very first screen keeps the browser's default focus. */
let navigated = false;
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => (navigated = true));

/**
 * After a route change, move focus to the new screen's main heading so it is announced (WCAG 2.4.3).
 * Skipped when a dialog is open, or when the screen already put focus somewhere inside itself.
 */
function RouteFocus() {
  useEffect(() => {
    if (!navigated || document.querySelector('[aria-modal="true"]')) return;
    const main = document.getElementById('main');
    if (!main) return;
    const a = document.activeElement;
    if (a && a !== document.body && main.contains(a)) return;
    const h1 = main.querySelector<HTMLElement>('h1');
    const target = h1 ?? main;
    if (h1 && !h1.hasAttribute('tabindex')) h1.tabIndex = -1;
    target.focus({ preventScroll: true });
  }, []);
  return null;
}
