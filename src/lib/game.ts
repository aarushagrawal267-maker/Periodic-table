import { byNumber } from './elements';
import { shuffle } from './random';
import { accuracy, placementPoints, stars } from './scoring';
import type { Difficulty } from '../store/settings';
import type { RoundSummary } from '../store/progress';

export const HAND_SIZE = 5;
export const EXPERT_LIVES = 3;

export interface GameEvent {
  id: number;
  kind: 'hit' | 'miss';
  number: number;
  row: number;
  col: number;
  points: number;
}

export interface GameState {
  phase: 'countdown' | 'playing' | 'paused' | 'done';
  targets: number[];
  queue: number[];
  placed: number[];
  selected: number | null;
  score: number;
  combo: number;
  maxCombo: number;
  correct: number;
  mistakes: number;
  hints: number;
  lives: number;
  startedAt: number;
  lastAt: number;
  endedAt: number;
  /** Elements that had a mistake or hint before being placed. */
  slipped: number[];
  hinted: number[];
  trail: RoundSummary['trail'];
  event: GameEvent | null;
  /** Element currently highlighted by a hint. */
  hint: number | null;
  difficulty: Difficulty;
  /** When the round was paused (0 while not paused). */
  pausedAt: number;
  /** Round time limit in ms. 0 means no limit. */
  timeLimitMs: number;
  /** True when the round ended because the time limit ran out. */
  timedOut: boolean;
}

export interface GameOptions {
  /** Fixed tile order (daily challenge). */
  order?: number[];
  /** Optional time limit for the whole round, in ms. */
  timeLimitMs?: number;
}

export type GameAction =
  | { type: 'start'; now: number }
  | { type: 'select'; number: number | null }
  | { type: 'place'; number: number; row: number; col: number; now: number }
  | { type: 'hint' }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'shuffle' }
  | { type: 'timeout'; now: number }
  | { type: 'end'; now: number };

let eventId = 0;

export function createGame(targets: number[], difficulty: Difficulty, orderOrOptions?: number[] | GameOptions): GameState {
  const opts: GameOptions = Array.isArray(orderOrOptions) ? { order: orderOrOptions } : (orderOrOptions ?? {});
  const order = opts.order;
  return {
    phase: 'countdown',
    targets,
    queue: order ?? shuffle(targets),
    placed: [],
    selected: null,
    score: 0,
    combo: 0,
    maxCombo: 0,
    correct: 0,
    mistakes: 0,
    hints: 0,
    lives: difficulty === 'expert' ? EXPERT_LIVES : Infinity,
    startedAt: 0,
    lastAt: 0,
    endedAt: 0,
    slipped: [],
    hinted: [],
    trail: [],
    event: null,
    hint: null,
    difficulty,
    pausedAt: 0,
    timeLimitMs: Math.max(0, opts.timeLimitMs ?? 0),
    timedOut: false,
  };
}

/** Milliseconds left on a timed round (Infinity when the round has no limit). */
export function timeLeft(s: GameState, now: number): number {
  if (!s.timeLimitMs) return Infinity;
  if (s.phase === 'countdown') return s.timeLimitMs;
  const at = s.phase === 'paused' ? s.pausedAt : s.phase === 'done' ? s.endedAt : now;
  return Math.max(0, s.timeLimitMs - (at - s.startedAt));
}

export const hand = (s: GameState) => s.queue.slice(0, HAND_SIZE);

export function gameReducer(s: GameState, a: GameAction): GameState {
  switch (a.type) {
    case 'start':
      return { ...s, phase: 'playing', startedAt: a.now, lastAt: a.now };
    case 'select':
      if (s.phase !== 'playing') return s;
      return { ...s, selected: a.number === s.selected ? null : a.number, hint: s.hint === a.number ? s.hint : null };
    case 'hint': {
      if (s.phase !== 'playing') return s;
      const target = s.selected ?? s.queue[0];
      if (target === undefined || s.hint === target) return s;
      return {
        ...s,
        selected: target,
        hint: target,
        hints: s.hints + 1,
        combo: 0,
        hinted: s.hinted.includes(target) ? s.hinted : [...s.hinted, target],
        slipped: s.slipped.includes(target) ? s.slipped : [...s.slipped, target],
      };
    }
    case 'place': {
      if (s.phase !== 'playing' || !s.queue.includes(a.number)) return s;
      const e = byNumber(a.number);
      const ok = e.row === a.row && e.col === a.col;
      if (!ok) {
        const lives = s.lives - 1;
        const done = lives <= 0;
        return {
          ...s,
          combo: 0,
          mistakes: s.mistakes + 1,
          lives,
          slipped: s.slipped.includes(a.number) ? s.slipped : [...s.slipped, a.number],
          event: { id: ++eventId, kind: 'miss', number: a.number, row: a.row, col: a.col, points: 0 },
          phase: done ? 'done' : s.phase,
          endedAt: done ? a.now : s.endedAt,
        };
      }
      const combo = s.combo + 1;
      const points = placementPoints(combo, (a.now - s.lastAt) / 1000);
      const queue = s.queue.filter((n) => n !== a.number);
      const clean = !s.slipped.includes(a.number);
      const done = queue.length === 0;
      return {
        ...s,
        queue,
        placed: [...s.placed, a.number],
        selected: null,
        hint: null,
        combo,
        maxCombo: Math.max(s.maxCombo, combo),
        score: s.score + points,
        correct: s.correct + 1,
        lastAt: a.now,
        trail: [...s.trail, clean ? 'hit' : s.hinted.includes(a.number) ? 'hint' : 'miss'],
        event: { id: ++eventId, kind: 'hit', number: a.number, row: a.row, col: a.col, points },
        phase: done ? 'done' : s.phase,
        endedAt: done ? a.now : s.endedAt,
      };
    }
    case 'pause':
      if (s.phase !== 'playing') return s;
      return { ...s, phase: 'paused', pausedAt: a.now, selected: null };
    case 'resume': {
      if (s.phase !== 'paused') return s;
      // Shift the clocks forward so paused time counts for nothing:
      // not for the round time, the speed bonus or the time limit.
      const away = Math.max(0, a.now - s.pausedAt);
      return { ...s, phase: 'playing', pausedAt: 0, startedAt: s.startedAt + away, lastAt: s.lastAt + away };
    }
    case 'shuffle': {
      if (s.phase !== 'playing' || s.queue.length < 2) return s;
      const before = s.queue.join(',');
      let queue = shuffle(s.queue);
      // Make sure the player actually sees a different order.
      for (let i = 0; i < 5 && queue.join(',') === before; i++) queue = shuffle(s.queue);
      return { ...s, queue, selected: null, hint: null };
    }
    case 'timeout':
      if (s.phase !== 'playing' || !s.timeLimitMs) return s;
      return { ...s, phase: 'done', endedAt: a.now, timedOut: true, selected: null };
    case 'end': {
      const endedAt = s.phase === 'paused' ? s.pausedAt : a.now;
      return { ...s, phase: 'done', endedAt };
    }
  }
}

export function summarize(s: GameState, kind: RoundSummary['kind'], extra: Partial<RoundSummary> = {}): RoundSummary {
  const completed = s.queue.length === 0;
  const acc = accuracy(s.correct, s.mistakes + s.hints);
  const results: Record<number, boolean> = {};
  for (const n of s.placed) results[n] = !s.slipped.includes(n);
  for (const n of s.slipped) if (!(n in results)) results[n] = false;
  return {
    kind,
    difficulty: s.difficulty,
    score: s.score,
    correct: s.correct,
    mistakes: s.mistakes,
    hints: s.hints,
    timeMs: Math.max(0, s.endedAt - s.startedAt),
    maxCombo: s.maxCombo,
    stars: stars(acc, completed),
    completed,
    results,
    trail: s.trail,
    ...(s.timedOut ? { timedOut: true } : {}),
    ...extra,
  };
}
