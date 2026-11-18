import { useSyncExternalStore } from 'react';

/** Hash routes so the app works on any static host without rewrite rules. */
export type Route =
  | { name: 'home' }
  | { name: 'play' }
  | { name: 'game'; region: string }
  | { name: 'daily' }
  | { name: 'quiz' }
  | { name: 'explore'; symbol?: string }
  | { name: 'progress' }
  | { name: 'learn'; chapter?: string }
  | { name: 'life' }
  | { name: 'match' };

export function parse(hash: string): Route {
  const [, a, b] = hash.replace(/^#/, '').split('/');
  switch (a) {
    case 'play':
      return b ? { name: 'game', region: b } : { name: 'play' };
    case 'daily':
      return { name: 'daily' };
    case 'quiz':
      return { name: 'quiz' };
    case 'explore':
      return { name: 'explore', symbol: b };
    case 'progress':
      return { name: 'progress' };
    case 'learn':
      return { name: 'learn', chapter: b };
    case 'life':
      return { name: 'life' };
    case 'match':
      return { name: 'match' };
    default:
      return { name: 'home' };
  }
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parse(hash);
}

export function go(path: string, replace = false) {
  const hash = '#' + path;
  if (replace) history.replaceState(null, '', hash);
  else history.pushState(null, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
}
