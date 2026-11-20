import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { guardedStorage } from '../lib/syncMeta';

export type Difficulty = 'learner' | 'standard' | 'expert';

export interface SettingsState {
  sound: boolean;
  haptics: boolean;
  reduceMotion: boolean;
  colorblind: boolean;
  difficulty: Difficulty;
  /** Quick Quiz question timer on Standard and Expert. Learner never has one. */
  quizTimer: boolean;
  set: (patch: Partial<SettingsData>) => void;
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
      set: (patch) => set(patch),
      reset: () => set(defaultSettings()),
    }),
    {
      name: 'periodica-settings',
      version: 3,
      // localStorage, except that a tab left over from before a sign out or sign in elsewhere cannot write (docs/ACCOUNTS.md 5.6.8).
      storage: createJSONStorage(() => guardedStorage),
      // v3: Periodica has one theme, dark, so the old theme choice is dropped.
      migrate: (persisted) => {
        const { theme: _theme, ...rest } = (persisted ?? {}) as Record<string, unknown>;
        return rest as unknown as SettingsState;
      },
    },
  ),
);

export const DIFFICULTIES: { id: Difficulty; name: string; desc: string }[] = [
  { id: 'learner', name: 'Learner', desc: 'Atomic numbers on tiles and colour hints on the table' },
  { id: 'standard', name: 'Standard', desc: 'Symbol and name only' },
  { id: 'expert', name: 'Expert', desc: 'Symbols only, and three lives: each wrong drop costs one' },
];
