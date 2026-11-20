import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { guardedStorage } from '../lib/syncMeta';
import { ACHIEVEMENTS } from '../lib/achievements';
import { CHAPTERS } from '../lib/chapters';
import { previousKey, todayKey } from '../lib/daily';
import { ELEMENTS } from '../lib/elements';
export { DAILY_GOAL_XP } from '../lib/scoring';
import type { Difficulty } from './settings';

export interface Mastery {
  /** Strength 0–5. 4+ counts as mastered. */
  s: number;
  c: number;
  w: number;
  t: number;
}

export interface RoundSummary {
  kind: 'place' | 'quiz' | 'daily' | 'lesson' | 'life' | 'match';
  regionId?: string;
  dailyKey?: string;
  difficulty: Difficulty;
  score: number;
  correct: number;
  mistakes: number;
  hints: number;
  timeMs: number;
  maxCombo: number;
  stars: number;
  completed: boolean;
  /** Per element: true if answered right first time without a hint. */
  results: Record<number, boolean>;
  /** Emoji-ready sequence of outcomes, in play order. */
  trail: ('hit' | 'miss' | 'hint')[];
}

export interface DailyResult {
  score: number;
  timeMs: number;
  mistakes: number;
  stars: number;
  trail: RoundSummary['trail'];
}

export interface ProgressData {
  xp: number;
  mastery: Record<number, Mastery>;
  best: Record<string, { score: number; stars: number; timeMs: number }>;
  stats: { rounds: number; placements: number; mistakes: number; quizzes: number; bestCombo: number; playMs: number };
  daily: { results: Record<string, DailyResult>; streak: number; bestStreak: number; lastKey: string | null; started?: string };
  achievements: Record<string, number>;
  explored: number[];
  /** Best stars per learning-path chapter. */
  chapters: Record<string, number>;
  /** XP earned on the current local day, for the daily goal. */
  today: { key: string; xp: number };
}

export interface RoundOutcome {
  xpGained: number;
  newBest: boolean;
  previousBest: number | null;
  unlocked: string[];
  masteryUp: number[];
}

interface ProgressState extends ProgressData {
  recordRound: (r: RoundSummary) => RoundOutcome;
  markExplored: (n: number) => string[];
  /** Marks today's daily as attempted, so quitting and retrying can't be used to practise it. */
  startDaily: (key: string) => void;
  /**
   * Unlocks badges the current state already qualifies for, with no round. Account sync calls it after
   * merging another device's progress, which can pass a check neither side passed alone.
   */
  reconcileAchievements: () => string[];
  reset: () => void;
}

/** A fresh start: what a new guest, a reset and a signed-out device hold. */
export const EMPTY_PROGRESS: ProgressData = {
  xp: 0,
  mastery: {},
  best: {},
  stats: { rounds: 0, placements: 0, mistakes: 0, quizzes: 0, bestCombo: 0, playMs: 0 },
  daily: { results: {}, streak: 0, bestStreak: 0, lastKey: null },
  achievements: {},
  explored: [],
  chapters: {},
  today: { key: '', xp: 0 },
};
const initial = EMPTY_PROGRESS;

function unlockNew(p: ProgressData, r?: RoundSummary) {
  const now = Date.now();
  const unlocked: string[] = [];
  const achievements = { ...p.achievements };
  for (const a of ACHIEVEMENTS) {
    if (!achievements[a.id] && a.check(p, r)) {
      achievements[a.id] = now;
      unlocked.push(a.id);
    }
  }
  return { achievements, unlocked };
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...initial,
      recordRound: (r) => {
        const p = get();
        const now = Date.now();
        const mastery = { ...p.mastery };
        const masteryUp: number[] = [];
        for (const [k, ok] of Object.entries(r.results)) {
          const n = Number(k);
          const m = mastery[n] ?? { s: 0, c: 0, w: 0, t: 0 };
          const s = ok ? Math.min(5, m.s + 1) : Math.max(0, m.s - 1);
          if (s >= 4 && m.s < 4) masteryUp.push(n);
          mastery[n] = { s, c: m.c + (ok ? 1 : 0), w: m.w + (ok ? 0 : 1), t: now };
        }

        const key = r.kind === 'place' ? `${r.regionId}:${r.difficulty}` : `${r.kind}:${r.regionId ?? r.dailyKey ?? r.difficulty}`;
        const prev = p.best[key];
        const newBest = r.completed && (!prev || r.score > prev.score);
        const best = newBest && r.kind === 'place' ? { ...p.best, [key]: { score: r.score, stars: r.stars, timeMs: r.timeMs } } : p.best;

        // Only real chapters of the path earn chapter stars; a spaced-review round ('review') does not.
        const isChapter = r.kind === 'lesson' && r.completed && !!r.regionId && CHAPTERS.some((c) => c.id === r.regionId);
        const chapters = isChapter ? { ...p.chapters, [r.regionId!]: Math.max(p.chapters[r.regionId!] ?? 0, r.stars) } : p.chapters;

        let daily = p.daily;
        if (r.kind === 'daily' && r.dailyKey && !p.daily.results[r.dailyKey]) {
          const results = { ...p.daily.results, [r.dailyKey]: { score: r.score, timeMs: r.timeMs, mistakes: r.mistakes, stars: r.stars, trail: r.trail } };
          if (r.completed) {
            const streak = p.daily.lastKey === previousKey(r.dailyKey) ? p.daily.streak + 1 : 1;
            daily = { ...p.daily, results, streak, bestStreak: Math.max(p.daily.bestStreak, streak), lastKey: r.dailyKey };
          } else {
            // A daily left before the end uses up the attempt but does not grow the streak.
            daily = { ...p.daily, results };
          }
        }

        const xpGained = Math.round(r.score / 10) + r.stars * 25 + masteryUp.length * 10;
        const dayKey = todayKey();
        const next: ProgressData = {
          ...p,
          xp: p.xp + xpGained,
          today: { key: dayKey, xp: (p.today.key === dayKey ? p.today.xp : 0) + xpGained },
          mastery,
          best,
          daily,
          chapters,
          stats: {
            rounds: p.stats.rounds + (r.completed ? 1 : 0),
            placements: p.stats.placements + r.correct,
            mistakes: p.stats.mistakes + r.mistakes,
            quizzes: p.stats.quizzes + (r.kind === 'quiz' ? 1 : 0),
            bestCombo: Math.max(p.stats.bestCombo, r.maxCombo),
            playMs: p.stats.playMs + r.timeMs,
          },
        };
        const { achievements, unlocked } = unlockNew(next, r);
        set({ ...next, achievements });
        return { xpGained, newBest: newBest && !!prev, previousBest: prev?.score ?? null, unlocked, masteryUp };
      },
      markExplored: (n) => {
        const p = get();
        if (p.explored.includes(n)) return [];
        const next = { ...p, explored: [...p.explored, n] };
        const { achievements, unlocked } = unlockNew(next);
        set({ explored: next.explored, achievements });
        return unlocked;
      },
      startDaily: (key) => set({ daily: { ...get().daily, started: key } }),
      reconcileAchievements: () => {
        const { achievements, unlocked } = unlockNew(get());
        if (unlocked.length) set({ achievements });
        return unlocked;
      },
      reset: () => set({ ...initial }),
    }),
    {
      name: 'periodica-progress',
      version: 2,
      migrate: (old) => ({ ...initial, ...(old as object) }) as ProgressState,
      // localStorage, except that a tab left over from before a sign out or sign in elsewhere cannot write (docs/ACCOUNTS.md 5.6.8).
      storage: createJSONStorage(() => guardedStorage),
    },
  ),
);

export const xpToday = (t: ProgressData['today'], key = todayKey()) => (t.key === key ? t.xp : 0);

export const masteredCount = (m: Record<number, Mastery>) => Object.values(m).filter((x) => x.s >= 4).length;
export const masteryPercent = (m: Record<number, Mastery>) =>
  Object.values(m).reduce((s, x) => s + x.s, 0) / (ELEMENTS.length * 5);

/**
 * The daily streak only counts if the last finished daily was today or yesterday.
 * Leaving today's daily early uses up today's try, so the streak is already broken.
 */
export function liveStreak(d: ProgressData['daily'], today: string) {
  if (!d.lastKey) return 0;
  if (d.lastKey !== today && d.results[today]) return 0;
  return d.lastKey === today || d.lastKey === previousKey(today) ? d.streak : 0;
}
