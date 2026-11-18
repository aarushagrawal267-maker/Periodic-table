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
  /** Toasts on screen. Only one is shown at a time; the rest wait in `queue`. */
  toasts: Toast[];
  queue: Toast[];
  openDetail: (n: number | null) => void;
  setSettings: (open: boolean) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

const SHOW_MS = 3200;
const GAP_MS = 350;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

export const useUi = create<UiState>((set, get) => {
  const showNext = () => {
    const [next, ...rest] = get().queue;
    if (!next) return;
    sfx.unlock();
    set({ toasts: [next], queue: rest });
    timer = setTimeout(() => get().dismiss(next.id), SHOW_MS);
  };
  return {
    detail: null,
    settingsOpen: false,
    toasts: [],
    queue: [],
    openDetail: (n) => set({ detail: n }),
    setSettings: (open) => set({ settingsOpen: open }),
    toast: (t) => {
      set({ queue: [...get().queue, { ...t, id: ++seq }] });
      if (get().toasts.length === 0) showNext();
    },
    dismiss: (id) => {
      if (!get().toasts.some((t) => t.id === id)) return;
      clearTimeout(timer);
      set({ toasts: [] });
      setTimeout(showNext, GAP_MS);
    },
  };
});

/** Queue achievement toasts after a short pause so they don't cover the moment of finishing. */
export function announceAchievements(ids: string[]) {
  const found = ids.map((id) => ACHIEVEMENTS.find((x) => x.id === id)).filter((a) => !!a);
  if (!found.length) return;
  setTimeout(() => {
    for (const a of found) useUi.getState().toast({ title: a.name, body: a.desc, icon: a.icon, tier: a.tier });
  }, 1600);
}
