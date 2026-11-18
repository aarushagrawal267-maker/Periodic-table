import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useEffect, useState } from 'react';
import { ElementDetailSheet } from './components/ElementDetail';
import { Shell } from './components/Shell';
import { SettingsSheet } from './components/SettingsSheet';
import { Toasts } from './components/Toasts';
import { useRoute } from './lib/router';
import { Daily } from './screens/Daily';
import { Explore } from './screens/Explore';
import { Home } from './screens/Home';
import { LearnPath, Lesson } from './screens/Learn';
import { Life } from './screens/Life';
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

  const immersive = route.name === 'game' || route.name === 'daily' || route.name === 'quiz' || route.name === 'life' || (route.name === 'learn' && !!route.chapter);
  const key = route.name === 'game' ? `game-${route.region}` : route.name === 'learn' ? `learn-${route.chapter ?? ''}` : route.name;

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
  }

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>
      <div className="grain relative min-h-dvh">
        <div className="aurora" aria-hidden />
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-surface-2 focus:px-4 focus:py-2">
          Skip to content
        </a>
        <Shell immersive={immersive} route={route.name}>
          <AnimatePresence mode="wait">
            <motion.div
              key={key}
              id="main"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              {screen}
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
