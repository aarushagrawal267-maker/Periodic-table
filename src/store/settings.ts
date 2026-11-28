import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { guardedStorage } from '../lib/syncMeta';

export type Difficulty = 'learner' | 'standard' | 'expert';
/** Colour theme. 'system' follows the device. */
export type Theme = 'system' | 'light' | 'dark';

export interface SettingsState {
  sound: boolean;
  haptics: boolean;
  reduceMotion: boolean;
  colorblind: boolean;
  difficulty: Difficulty;
  /** Quick Quiz question timer on Standard and Expert. Learner never has one. */
  quizTimer: boolean;
  set: (patch: Partial<SettingsData>) => void;
  /**
   * Size of the puzzle board, 1 = fit to the screen. A per-device view preference:
   * it is saved on this device but deliberately not one of SETTING_KEYS, so it never syncs.
   */
  boardZoom: number;
  setBoardZoom: (zoom: number) => void;
  /**
   * Light, dark or the device's choice. Like boardZoom it is a per-device view preference (a classroom projector
   * wants light, the same student's phone at night wants dark): saved on this device, never one of SETTING_KEYS.
   */
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Back to the defaults. Used when a signed-in device signs out (docs/ACCOUNTS.md 5.6.4). */
  reset: () => void;
}

/** The settings that are data (saved, and synced to an account). Order is stable. */
export const SETTING_KEYS = ['sound', 'haptics', 'reduceMotion', 'colorblind', 'difficulty', 'quizTimer'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
export type SettingsData = Pick<SettingsState, SettingKey>;

export function defaultSettings(): SettingsData {
  return {
    sound: true,
    haptics: true,
    reduceMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    colorblind: false,
    difficulty: 'standard',
    quizTimer: true,
  };
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings(),
      boardZoom: 1,
      theme: 'system',
      set: (patch) => set(patch),
      setBoardZoom: (boardZoom) => set({ boardZoom }),
      setTheme: (theme) => set({ theme }),
      reset: () => set(defaultSettings()),
    }),
    {
      name: 'periodica-settings',
      version: 4,
      // localStorage, except that a tab left over from before a sign out or sign in elsewhere cannot write (docs/ACCOUNTS.md 5.6.8).
      storage: createJSONStorage(() => guardedStorage),
      // v3 dropped the old (v1, v2) theme choice when Periodica was dark only. v4 brings a theme back as a new,
      // device-only choice that starts at 'system', so a choice saved before v3 is still dropped rather than revived.
      // index.html reads the saved theme before the first paint and trusts it only from v3 on: keep the two in step.
      migrate: (persisted, version) => {
        const rest = { ...((persisted ?? {}) as Record<string, unknown>) };
        if (version < 3) delete rest.theme;
        return rest as unknown as SettingsState;
      },
    },
  ),
);

export const BOARD_ZOOM_STEPS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2] as const;

export const DIFFICULTIES: { id: Difficulty; name: string; desc: string }[] = [
  { id: 'learner', name: 'Learner', desc: 'Atomic numbers on tiles and colour hints on the table' },
  { id: 'standard', name: 'Standard', desc: 'Symbol and name only' },
  { id: 'expert', name: 'Expert', desc: 'Symbols only, and three lives: each wrong drop costs one' },
];

export const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

/** Page colour per theme, for <meta name="theme-color"> (the browser and phone chrome). Keep in step with --bg. */
export const THEME_COLOR = { light: '#f7f4ee', dark: '#161513' } as const;
