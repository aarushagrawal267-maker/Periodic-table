import { describe, expect, test } from 'vitest';
import { dueForReview, INTERVAL_DAYS } from '../src/lib/review';

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 18, 12);

describe('spaced review', () => {
  test('wrong answers are due now, strong ones wait', () => {
    const m = {
      1: { s: 0, c: 0, w: 1, t: now - 1000 },
      2: { s: 3, c: 3, w: 0, t: now - 1 * DAY },
      3: { s: 3, c: 3, w: 0, t: now - 5 * DAY },
      4: { s: 5, c: 5, w: 0, t: now - 10 * DAY },
    };
    expect(dueForReview(m, now)).toEqual([1, 3]);
  });
  test('weakest first when the deck is capped, returned in table order', () => {
    const m: Record<number, { s: number; c: number; w: number; t: number }> = {};
    for (let n = 1; n <= 30; n++) m[n] = { s: n % 3, c: 0, w: 0, t: now - 30 * DAY };
    const due = dueForReview(m, now, 10);
    expect(due).toHaveLength(10);
    expect(due.every((n) => n % 3 === 0)).toBe(true);
    expect([...due].sort((a, b) => a - b)).toEqual(due);
  });
  test('intervals grow with strength', () => {
    for (let i = 1; i < INTERVAL_DAYS.length; i++) expect(INTERVAL_DAYS[i]).toBeGreaterThan(INTERVAL_DAYS[i - 1]);
  });
});
