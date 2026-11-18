import { create } from 'zustand';
import { ACHIEVEMENTS } from '../lib/achievements';
import { sfx } from '../lib/feedback';

export interface Toast {
  id: number;
  title: string;
  body: string;
  icon: string;
  tier?: 'bronze' | 'silver' | 'gold';
}

interface UiState {
  detail: number | null;
  settingsOpen: boolean;
  toasts: Toast[];
  openDetail: (n: number | null) => void;
  setSettings: (open: boolean) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
export const useUi = create<UiState>((set, get) => ({
  detail: null,
  settingsOpen: false,
  toasts: [],
  openDetail: (n) => set({ detail: n }),
  setSettings: (open) => set({ settingsOpen: open }),
  toast: (t) => {
    const id = ++seq;
    set({ toasts: [...get().toasts, { ...t, id }] });
    setTimeout(() => get().dismiss(id), 4200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export function announceAchievements(ids: string[]) {
  ids.forEach((id, i) => {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    setTimeout(() => {
      sfx.unlock();
      useUi.getState().toast({ title: a.name, body: a.desc, icon: a.icon, tier: a.tier });
    }, 600 + i * 900);
  });
}
