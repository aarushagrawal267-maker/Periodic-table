import { describe, expect, test } from 'vitest';
import { createGame, gameReducer, hand, summarize, HAND_SIZE } from '../src/lib/game';
import { byNumber } from '../src/lib/elements';
import { multiplier, placementPoints, levelFromXp, xpForLevel, stars } from '../src/lib/scoring';
import { dailyElements, dailyNumber, previousKey, DAILY_SIZE } from '../src/lib/daily';
import { computeLayout } from '../src/lib/layout';
import { buildQuiz, QUIZ_LENGTH } from '../src/lib/quiz';

const place = (s: ReturnType<typeof createGame>, n: number, now: number, wrong = false) => {
  const e = byNumber(n);
  return gameReducer(s, { type: 'place', number: n, row: e.row, col: wrong ? (e.col % 18) + 1 : e.col, now });
};

describe('game reducer', () => {
  test('correct placements score, build combo and finish the round', () => {
    let s = gameReducer(createGame([1, 2, 3], 'standard', [1, 2, 3]), { type: 'start', now: 0 });
    expect(hand(s)).toEqual([1, 2, 3]);
    s = place(s, 1, 1000);
    s = place(s, 2, 2000);
    s = place(s, 3, 3000);
    expect(s.phase).toBe('done');
    expect(s.correct).toBe(3);
    expect(s.combo).toBe(3);
    expect(s.score).toBeGreaterThan(300);
    const r = summarize(s, 'place');
    expect(r.completed).toBe(true);
    expect(r.stars).toBe(3);
    expect(r.results).toEqual({ 1: true, 2: true, 3: true });
    expect(r.trail).toEqual(['hit', 'hit', 'hit']);
  });

  test('a wrong drop resets the combo and marks the element as slipped', () => {
    let s = gameReducer(createGame([1, 2], 'standard', [1, 2]), { type: 'start', now: 0 });
    s = place(s, 1, 500);
    s = place(s, 2, 900, true);
    expect(s.combo).toBe(0);
    expect(s.mistakes).toBe(1);
    expect(s.queue).toEqual([2]);
    s = place(s, 2, 1200);
    expect(summarize(s, 'place').results).toEqual({ 1: true, 2: false });
    expect(s.trail).toEqual(['hit', 'miss']);
  });

  test('expert ends the round after three mistakes', () => {
    let s = gameReducer(createGame([1, 2], 'expert', [1, 2]), { type: 'start', now: 0 });
    for (let i = 0; i < 3; i++) s = place(s, 1, 100 * i, true);
    expect(s.phase).toBe('done');
    expect(summarize(s, 'place').completed).toBe(false);
    expect(summarize(s, 'place').stars).toBe(0);
  });

  test('hints select the next tile and break the combo', () => {
    let s = gameReducer(createGame([1, 2], 'standard', [1, 2]), { type: 'start', now: 0 });
    s = place(s, 1, 100);
    s = gameReducer(s, { type: 'hint' });
    expect(s.hint).toBe(2);
    expect(s.selected).toBe(2);
    expect(s.combo).toBe(0);
    s = place(s, 2, 200);
    expect(s.trail).toEqual(['hit', 'hint']);
  });

  test('hand shows at most five tiles', () => {
    const s = createGame(Array.from({ length: 20 }, (_, i) => i + 1), 'standard');
    expect(hand(s)).toHaveLength(HAND_SIZE);
  });
});

describe('scoring', () => {
  test('multiplier tiers', () => {
    expect([1, 3, 6, 10, 30].map(multiplier)).toEqual([1, 1.5, 2, 3, 3]);
    expect(placementPoints(1, 100)).toBe(100);
    expect(placementPoints(1, 0)).toBe(150);
  });
  test('stars', () => {
    expect(stars(1, true)).toBe(3);
    expect(stars(0.85, true)).toBe(2);
    expect(stars(0.5, true)).toBe(1);
    expect(stars(1, false)).toBe(0);
  });
  test('levels', () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(xpForLevel(5)).level).toBe(5);
    expect(levelFromXp(xpForLevel(5) - 1).level).toBe(4);
  });
});

describe('daily challenge', () => {
  test('is deterministic, unique and spans every block', () => {
    const a = dailyElements('2026-11-20');
    expect(a).toEqual(dailyElements('2026-11-20'));
    expect(new Set(a).size).toBe(DAILY_SIZE);
    expect(new Set(a.map((n) => byNumber(n).block))).toEqual(new Set(['s', 'p', 'd', 'f']));
    expect(dailyElements('2026-11-21')).not.toEqual(a);
  });
  test('numbering and previous day', () => {
    expect(dailyNumber('2026-11-18')).toBe(1);
    expect(dailyNumber('2027-01-01')).toBe(45);
    expect(previousKey('2026-03-01')).toBe('2026-02-28');
  });
});

describe('layout', () => {
  test('collapses unused columns but keeps the table shape', () => {
    const l = computeLayout(Array.from({ length: 20 }, (_, i) => i + 1), 800);
    expect(l.cols.get(1)!.active).toBe(true);
    expect(l.cols.get(5)!.active).toBe(false);
    expect(l.cols.get(5)!.size).toBeLessThan(l.cell);
    expect(l.width).toBeLessThanOrEqual(800);
  });
  test('respects the minimum cell size on narrow screens', () => {
    const l = computeLayout(Array.from({ length: 118 }, (_, i) => i + 1), 320, { min: 34 });
    expect(l.cell).toBe(34);
    expect(l.rows.get(8)!.active).toBe(false);
  });
});

describe('quiz', () => {
  test('builds ten valid questions with four unique options', () => {
    for (let i = 0; i < 300; i++) for (const d of ['learner', 'standard', 'expert'] as const) {
      const qs = buildQuiz(d, {});
      expect(qs).toHaveLength(QUIZ_LENGTH);
      for (const q of qs) {
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.answer).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
