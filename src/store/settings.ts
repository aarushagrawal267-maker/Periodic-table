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
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      sound: true,
      haptics: true,
      reduceMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
      colorblind: false,
      difficulty: 'standard',
      set: (patch) => set(patch),
    }),
    { name: 'periodica-settings', version: 1 },
  ),
);

export const DIFFICULTIES: { id: Difficulty; name: string; desc: string }[] = [
  { id: 'learner', name: 'Learner', desc: 'Atomic numbers on tiles and colour hints on the table.' },
  { id: 'standard', name: 'Standard', desc: 'Symbol and name only. The classic challenge.' },
  { id: 'expert', name: 'Expert', desc: 'Symbols only and three lives. One wrong drop costs a life.' },
];
