import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useEffect, useState, type MouseEvent } from 'react';
import { ElementDetailSheet } from './components/ElementDetail';
import { Shell } from './components/Shell';
import { SettingsSheet } from './components/SettingsSheet';
import { Toasts } from './components/Toasts';
import { CHAPTERS } from './lib/chapters';
import { REGIONS } from './lib/regions';
import { useRoute, type Route } from './lib/router';
import { Daily } from './screens/Daily';
import { Explore } from './screens/Explore';
import { Home } from './screens/Home';
import { LearnPath, Lesson } from './screens/Learn';
import { Life } from './screens/Life';
import { Match } from './screens/Match';
import { PlayHub, RegionGame } from './screens/Play';
import { ProgressScreen } from './screens/Progress';
import { Quiz } from './screens/Quiz';
import { useSettings } from './store/settings';

export function App() {
  const route = useRoute();
  const { theme, colorblind, reduceMotion } = useSettings();
  const systemLight = useMediaQuery('(prefers-color-scheme: light)');

  useEffect(() => {
    const root = document.documentElement;
    const light = theme === 'light' || (theme === 'system' && systemLight);
    root.dataset.theme = light ? 'light' : 'dark';
    root.dataset.colorblind = String(colorblind);
    root.classList.toggle('reduce-motion', reduceMotion);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f5f5fa' : '#07070d');
  }, [theme, systemLight, colorblind, reduceMotion]);

  const immersive = route.name === 'game' || route.name === 'daily' || route.name === 'quiz' || route.name === 'life' || route.name === 'match' || (route.name === 'learn' && !!route.chapter);
  const key = route.name === 'game' ? `game-${route.region}` : route.name === 'learn' ? `learn-${route.chapter ?? ''}` : route.name;

  // Each screen has its own title, so screen-reader users and browser tabs know where they are (WCAG 2.4.2).
  const title = titleFor(route);
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
  }

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>
      <div className="grain relative min-h-dvh">
        <div className="aurora" aria-hidden />
        {/* Moves focus without touching the URL: "#main" would otherwise be read as a route by the hash router. */}
        <a href="#main" onClick={skipToMain} className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-surface-2 focus:px-4 focus:py-2">
          Skip to content
        </a>
        <Shell immersive={immersive} route={route.name}>
          <AnimatePresence mode="wait">
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              {screen}
              <RouteFocus />
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

function useMediaQuery(q: string) {
  const [match, setMatch] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return match;
}

function skipToMain(e: MouseEvent) {
  e.preventDefault();
  const main = document.getElementById('main');
  main?.focus();
  main?.scrollIntoView({ block: 'start' });
}

const SITE = 'Periodica';

function titleFor(route: Route) {
  const t = (name: string) => `${name} · ${SITE}`;
  switch (route.name) {
    case 'home':
      return `${SITE} — Master the Periodic Table`;
    case 'play':
      return t('Play');
    case 'game':
      return t(REGIONS.find((r) => r.id === route.region)?.name ?? 'Play');
    case 'daily':
      return t('Daily Challenge');
    case 'quiz':
      return t('Quick Quiz');
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
      return t('In Real Life');
    case 'match':
      return t('Match Pairs');
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
