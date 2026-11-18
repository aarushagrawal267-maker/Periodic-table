import type { Mastery } from '../store/progress';

const DAY = 86_400_000;
/** Days to wait before an element comes back, by mastery strength 0–5. */
export const INTERVAL_DAYS = [0, 1, 2, 4, 7, 14];
export const REVIEW_SIZE = 10;

/**
 * Elements due for review, weakest first. An element you got wrong (strength 0)
 * is due straight away; one you know well waits up to two weeks.
 */
export function dueForReview(mastery: Record<number, Mastery>, now = Date.now(), limit = REVIEW_SIZE): number[] {
  return Object.entries(mastery)
    .map(([n, m]) => ({ n: Number(n), m, due: m.t + INTERVAL_DAYS[m.s] * DAY }))
    .filter((x) => x.due <= now)
    .sort((a, b) => a.m.s - b.m.s || a.due - b.due || a.n - b.n)
    .slice(0, limit)
    .map((x) => x.n)
    .sort((a, b) => a - b);
}
