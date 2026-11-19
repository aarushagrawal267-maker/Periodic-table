import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Difficulty = 'learner' | 'standard' | 'expert';
export type Theme = 'system' | 'dark' | 'light';

interface SettingsState {
  theme: Theme;
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
      theme: 'light',
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
      version: 2,
      // v2: the chart's paper became the default theme. 'system' was the old default, so it moves to paper;
      // anyone who picked light or dark keeps it.
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Partial<SettingsState>;
        if (version < 2 && (s.theme === 'system' || s.theme === undefined)) s.theme = 'light';
        return s as SettingsState;
      },
    },
  ),
);

export const DIFFICULTIES: { id: Difficulty; name: string; desc: string }[] = [
  { id: 'learner', name: 'Learner', desc: 'Atomic numbers on tiles and colour hints on the table' },
  { id: 'standard', name: 'Standard', desc: 'Symbol and name only' },
  { id: 'expert', name: 'Expert', desc: 'Symbols only, and three lives: each wrong drop costs one' },
];
