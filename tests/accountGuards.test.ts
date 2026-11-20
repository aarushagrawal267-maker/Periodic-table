/**
 * Small guards of the account layer (docs/ACCOUNTS.md 5.6.8, 5.6.9, 6.3): which builds may use the
 * emulators, the stale-tab write guard, and when a shared computer's session is over.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.hoisted(() => {
  const mem = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;
  g.localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    clear: () => mem.clear(),
    get length() {
      return mem.size;
    },
  };
  let jar = '';
  g.document = {
    get cookie() {
      return jar;
    },
    set cookie(v: string) {
      jar = /max-age=0/i.test(v) ? '' : v.split(';')[0];
    },
  };
});


import { emulatorsAllowed } from '../src/lib/firebase';
import {
  SHARED_IDLE_MS,
  clearOwnership,
  clearSessionCookie,
  guardedStorage,
  markTabCurrent,
  readMeta,
  setSessionCookie,
  setStaleHandler,
  sharedSessionOver,
  tabIsStale,
  writeMeta,
} from '../src/lib/syncMeta';

beforeEach(() => {
  // A build with accounts (the stale-tab guard is off without them).
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-unit');
  setStaleHandler(null);
  clearSessionCookie();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('emulatorsAllowed', () => {
  test('only in a dev server or for a demo-* project', () => {
    expect(emulatorsAllowed('1', 'demo-periodica', false)).toBe(true);
    expect(emulatorsAllowed('1', 'periodica-prod', true)).toBe(true);
    // A production build of a real project never talks to 127.0.0.1, whatever env it was built with.
    expect(emulatorsAllowed('1', 'periodica-prod', false)).toBe(false);
    expect(emulatorsAllowed(undefined, 'demo-periodica', true)).toBe(false);
    expect(emulatorsAllowed('0', 'demo-periodica', true)).toBe(false);
  });
});

describe('stale tabs', () => {
  test('without accounts the guard is off', () => {
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
    localStorage.setItem('periodica-sync', JSON.stringify({ ...readMeta(), gen: 'changed-elsewhere' }));
    expect(tabIsStale()).toBe(false);
    markTabCurrent();
  });

  test('a tab that missed a change of hands may not write the stores, and reloads instead', async () => {
    markTabCurrent();
    expect(tabIsStale()).toBe(false);
    const reload = vi.fn(() => markTabCurrent());
    setStaleHandler(reload);
    guardedStorage.setItem('periodica-progress', 'mine');
    expect(localStorage.getItem('periodica-progress')).toBe('mine');

    // Another tab signs out: it resets the stores and starts a new generation.
    localStorage.setItem('periodica-progress', 'fresh');
    const m = JSON.parse(localStorage.getItem('periodica-sync')!);
    localStorage.setItem('periodica-sync', JSON.stringify({ ...m, gen: 'from-another-tab' }));
    expect(tabIsStale()).toBe(true);

    // This tab's old copy is refused, and it reloads.
    guardedStorage.setItem('periodica-progress', 'old copy');
    expect(localStorage.getItem('periodica-progress')).toBe('fresh');
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(tabIsStale()).toBe(false);
    guardedStorage.setItem('periodica-progress', 'after reload');
    expect(localStorage.getItem('periodica-progress')).toBe('after reload');
  });

  test("this tab's own change of hands never makes it stale", () => {
    readMeta();
    markTabCurrent();
    clearOwnership();
    expect(tabIsStale()).toBe(false);
  });
});

describe('shared computer sessions', () => {
  test('over when the browser was closed (no session cookie) or after 30 minutes without use', () => {
    const now = 1_800_000_000_000;
    writeMeta({ owner: 'u1', shared: true, activeAt: now });
    setSessionCookie();
    const m = readMeta();
    expect(sharedSessionOver(m, now + 60_000)).toBe(false);
    expect(sharedSessionOver(m, now + SHARED_IDLE_MS + 1)).toBe(true);
    clearSessionCookie();
    expect(sharedSessionOver(m, now + 60_000)).toBe(true);
    // Not shared, or nobody signed in: never.
    expect(sharedSessionOver({ ...m, shared: false }, now + 10 * SHARED_IDLE_MS)).toBe(false);
    expect(sharedSessionOver({ ...m, owner: null }, now + 10 * SHARED_IDLE_MS)).toBe(false);
  });
});
