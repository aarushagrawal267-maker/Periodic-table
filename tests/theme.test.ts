import { describe, expect, test, vi } from 'vitest';

// A small in-memory localStorage, so the settings store persists as it does in a browser.
vi.hoisted(() => {
  const g = globalThis as unknown as { localStorage: Storage };
  const data = new Map<string, string>();
  g.localStorage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  };
});

import { SYNC_SETTING_KEYS } from '../src/lib/merge';
import { SETTING_KEYS, THEMES, THEME_COLOR, useSettings } from '../src/store/settings';

describe('theme setting', () => {
  test('offers System, Light and Dark, and starts on System', () => {
    expect(THEMES.map((t) => t.label)).toEqual(['System', 'Light', 'Dark']);
    expect(useSettings.getState().theme).toBe('system');
  });

  test('is a device-only view preference: never one of the synced setting keys', () => {
    expect(SETTING_KEYS as readonly string[]).not.toContain('theme');
    expect(SYNC_SETTING_KEYS as string[]).not.toContain('theme');
  });

  test('is saved on this device', () => {
    useSettings.getState().setTheme('light');
    const saved = JSON.parse(localStorage.getItem('periodica-settings')!);
    expect(saved.state.theme).toBe('light');
    expect(saved.version).toBe(4);
  });

  test('signing out (reset to the defaults) keeps the device theme, like board zoom', () => {
    useSettings.getState().setTheme('dark');
    useSettings.getState().reset();
    expect(useSettings.getState().theme).toBe('dark');
  });

  test('a theme saved before Periodica went dark only (v2) is dropped; v3 settings keep everything else', async () => {
    const migrate = useSettings.persist.getOptions().migrate!;
    expect(await migrate({ theme: 'light', sound: false }, 2)).toEqual({ sound: false });
    expect(await migrate({ sound: false, difficulty: 'expert' }, 3)).toEqual({ sound: false, difficulty: 'expert' });
  });

  test('the browser chrome colour matches each theme page colour', () => {
    expect(THEME_COLOR).toEqual({ light: '#f7f4ee', dark: '#161513' });
  });
});
