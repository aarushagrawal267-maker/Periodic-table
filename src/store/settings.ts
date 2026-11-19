import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Difficulty = 'learner' | 'standard' | 'expert';

interface SettingsState {
  sound: boolean;
  haptics: boolean;
  reduceMotion: boolean;
  colorblind: boolean;
  difficulty: Difficulty;
  /** Quick Quiz question timer on Standard and Expert. Learner never has one. */
  quizTimer: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      sound: true,
      haptics: true,
      reduceMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
      colorblind: false,
      difficulty: 'standard',
      quizTimer: true,
      set: (patch) => set(patch),
    }),
    {
      name: 'periodica-settings',
      version: 3,
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
