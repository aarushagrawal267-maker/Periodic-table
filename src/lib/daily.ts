import { ELEMENTS } from './elements';
import { hashString, sample, seeded } from './random';

/** Day #1 of the daily challenge. */
const EPOCH = Date.UTC(2026, 10, 18);
export const DAILY_SIZE = 12;

/** Local calendar date as YYYY-MM-DD, so the challenge rolls over at the player's midnight. */
export function todayKey(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dailyNumber(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - EPOCH) / 86400000) + 1;
}

export function previousKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d - 1));
}

/**
 * The daily set: one element from each part of the table plus random extras,
 * so every day is a spread across the whole table rather than a cluster.
 */
export function dailyElements(key: string): number[] {
  const rand = seeded(hashString('periodica:' + key));
  const pools = [
    ELEMENTS.filter((e) => e.block === 's'),
    ELEMENTS.filter((e) => e.block === 'p'),
    ELEMENTS.filter((e) => e.block === 'd'),
    ELEMENTS.filter((e) => e.block === 'f'),
  ];
  const chosen = new Set<number>();
  for (const pool of pools) for (const e of sample(pool, 2, rand)) chosen.add(e.number);
  const rest = sample(ELEMENTS, ELEMENTS.length, rand);
  for (const e of rest) {
    if (chosen.size >= DAILY_SIZE) break;
    chosen.add(e.number);
  }
  return [...chosen];
}
