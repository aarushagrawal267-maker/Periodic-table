import { describe, expect, test } from 'vitest';
import { createGame, gameReducer, hand, summarize, timeLeft, HAND_SIZE } from '../src/lib/game';
import { ELEMENTS, byNumber, metallicCharacter } from '../src/lib/elements';
import { CHALLENGE_LEVELS, challengeUnlocked } from '../src/lib/challenge';
import { computeLayout } from '../src/lib/layout';

const place = (s: ReturnType<typeof createGame>, n: number, now: number) => {
  const e = byNumber(n);
  return gameReducer(s, { type: 'place', number: n, row: e.row, col: e.col, now });
};

describe('pause and resume', () => {
  test('paused time counts for nothing and blocks moves', () => {
    let s = gameReducer(createGame([1, 2], 'standard', [1, 2]), { type: 'start', now: 0 });
    s = gameReducer(s, { type: 'pause', now: 1000 });
    expect(s.phase).toBe('paused');
    // No placing, selecting, hinting or shuffling while paused.
    expect(place(s, 1, 2000)).toBe(s);
    expect(gameReducer(s, { type: 'select', number: 1 })).toBe(s);
    expect(gameReducer(s, { type: 'hint' })).toBe(s);
    expect(gameReducer(s, { type: 'shuffle' })).toBe(s);
    s = gameReducer(s, { type: 'resume', now: 61_000 });
    expect(s.phase).toBe('playing');
    s = place(s, 1, 62_000);
    s = place(s, 2, 63_000);
    // 3 s of play; the 60 s pause is not counted.
    expect(summarize(s, 'place').timeMs).toBe(3000);
  });

  test('a pause does not cost the speed bonus', () => {
    const quick = place(gameReducer(createGame([1, 2], 'standard', [1, 2]), { type: 'start', now: 0 }), 1, 1000);
    let paused = gameReducer(createGame([1, 2], 'standard', [1, 2]), { type: 'start', now: 0 });
    paused = gameReducer(paused, { type: 'pause', now: 500 });
    paused = gameReducer(paused, { type: 'resume', now: 100_500 });
    paused = place(paused, 1, 101_000);
    expect(paused.score).toBe(quick.score);
  });

  test('pause only works while playing', () => {
    const s = createGame([1], 'standard');
    expect(gameReducer(s, { type: 'pause', now: 0 })).toBe(s);
    expect(gameReducer(s, { type: 'resume', now: 0 })).toBe(s);
  });
});

describe('shuffle', () => {
  test('reorders the remaining tiles without losing or adding any', () => {
    const targets = Array.from({ length: 20 }, (_, i) => i + 1);
    let s = gameReducer(createGame(targets, 'standard', targets), { type: 'start', now: 0 });
    s = gameReducer(s, { type: 'select', number: 1 });
    const t = gameReducer(s, { type: 'shuffle' });
    expect([...t.queue].sort((a, b) => a - b)).toEqual(targets);
    expect(t.queue).not.toEqual(s.queue);
    expect(hand(t)).toHaveLength(HAND_SIZE);
    expect(t.selected).toBeNull();
    // Shuffling is free: no score, combo or mistake changes.
    expect([t.score, t.combo, t.mistakes, t.hints]).toEqual([s.score, s.combo, s.mistakes, s.hints]);
  });
});

describe('time limit', () => {
  test('rounds have no limit unless asked', () => {
    const s = gameReducer(createGame([1, 2], 'standard'), { type: 'start', now: 0 });
    expect(timeLeft(s, 999_999)).toBe(Infinity);
    expect(gameReducer(s, { type: 'timeout', now: 5 })).toBe(s);
  });

  test("time's up ends the round as not completed", () => {
    let s = gameReducer(createGame([1, 2], 'standard', { order: [1, 2], timeLimitMs: 60_000 }), { type: 'start', now: 0 });
    expect(timeLeft(s, 15_000)).toBe(45_000);
    s = place(s, 1, 20_000);
    s = gameReducer(s, { type: 'timeout', now: 60_000 });
    expect(s.phase).toBe('done');
    const r = summarize(s, 'challenge');
    expect(r.timedOut).toBe(true);
    expect(r.completed).toBe(false);
    expect(r.correct).toBe(1);
  });

  test('pausing stops the clock', () => {
    let s = gameReducer(createGame([1, 2], 'standard', { timeLimitMs: 60_000 }), { type: 'start', now: 0 });
    s = gameReducer(s, { type: 'pause', now: 10_000 });
    expect(timeLeft(s, 500_000)).toBe(50_000);
    s = gameReducer(s, { type: 'resume', now: 500_000 });
    expect(timeLeft(s, 505_000)).toBe(45_000);
  });

  test('the old order argument still works', () => {
    expect(createGame([1, 2, 3], 'standard', [3, 2, 1]).queue).toEqual([3, 2, 1]);
  });
});

describe('timed challenge', () => {
  test('six levels: 10, 25, 50, 75, 100 then all 118, with less time per element', () => {
    expect(CHALLENGE_LEVELS.map((l) => l.numbers.length)).toEqual([10, 25, 50, 75, 100, 118]);
    expect(CHALLENGE_LEVELS.map((l) => l.secondsPerElement)).toEqual([30, 25, 20, 15, 10, 8]);
    for (const l of CHALLENGE_LEVELS) {
      expect(l.numbers).toEqual(Array.from({ length: l.numbers.length }, (_, i) => i + 1));
      expect(l.timeLimitMs).toBe(l.numbers.length * l.secondsPerElement * 1000);
    }
  });

  test('every level can be completed: each element has its own cell', () => {
    for (const l of CHALLENGE_LEVELS) {
      const cells = new Set(l.numbers.map((n) => `${byNumber(n).row},${byNumber(n).col}`));
      expect(cells.size).toBe(l.numbers.length);
    }
  });

  test('levels unlock in order', () => {
    const [l1, l2, l3] = CHALLENGE_LEVELS;
    expect(challengeUnlocked({}, l1)).toBe(true);
    expect(challengeUnlocked({}, l2)).toBe(false);
    const best = { 'challenge_level-1_learner': { score: 1, stars: 1, timeMs: 1 } };
    expect(challengeUnlocked(best, l2)).toBe(true);
    expect(challengeUnlocked(best, l3)).toBe(false);
    // Region results never unlock challenge levels.
    expect(challengeUnlocked({ 'level-1:standard': { score: 1, stars: 1, timeMs: 1 } }, l2)).toBe(false);
  });
});

describe('board zoom', () => {
  test('zooming in makes cells bigger and zooming out smaller', () => {
    const nums = ELEMENTS.map((e) => e.number);
    const fit = computeLayout(nums, 1000, { min: 34, max: 72 }).cell;
    const big = computeLayout(nums, 1000 * 1.5, { min: 34 * 1.5, max: 72 * 1.5 }).cell;
    const small = computeLayout(nums, 1000 * 0.6, { min: 34 * 0.6, max: 72 * 0.6 }).cell;
    expect(big).toBeGreaterThan(fit);
    expect(small).toBeLessThan(fit);
  });
});

describe('extra element facts', () => {
  test('every element has a discoverer and a stable isotope count', () => {
    for (const e of ELEMENTS) {
      expect(e.discoveredBy, e.name).toBeTruthy();
      expect(Number.isInteger(e.stableIsotopes), e.name).toBe(true);
    }
  });

  test('stable isotopes add up to the 251 known stable nuclides', () => {
    expect(ELEMENTS.reduce((s, e) => s + (e.stableIsotopes ?? 0), 0)).toBe(251);
    expect(byNumber(50).stableIsotopes).toBe(10); // tin has the most
    expect(byNumber(43).stableIsotopes).toBe(0); // technetium: none
    expect(byNumber(83).stableIsotopes).toBe(0); // bismuth: radioactive
    expect(ELEMENTS.filter((e) => e.number > 82).every((e) => e.stableIsotopes === 0)).toBe(true);
  });

  test('metallic character follows the category', () => {
    expect(metallicCharacter(byNumber(26).category)).toBe('Metal');
    expect(metallicCharacter(byNumber(14).category)).toBe('Metalloid');
    expect(metallicCharacter(byNumber(17).category)).toBe('Nonmetal');
    expect(metallicCharacter(byNumber(2).category)).toBe('Nonmetal');
  });
});
