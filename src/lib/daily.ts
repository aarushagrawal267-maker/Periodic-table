import { ELEMENTS } from './elements';
import { hashString, sample, seeded, shuffle } from './random';

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

/** Well-known elements beyond Ba (56) that most students have heard of: Ag, Sn, I, W, Pt, Au, Hg, Pb, U, Pu. */
const FAMOUS = [47, 50, 53, 74, 78, 79, 80, 82, 92, 94];
/** The friendliest f-block elements: La, Ce, Nd (magnets), Eu (banknote ink), U, Pu. */
export const DAILY_F_PICKS = [57, 58, 60, 63, 92, 94];
/** How many of the daily elements are "common" ones. */
export const DAILY_COMMON = 10;
/** Stretch picks stay at or below radium, so no superheavy surprises. */
const STRETCH_MAX = 88;

/** A common element: the first 56, plus a handful of famous heavier ones. */
export const isCommonElement = (n: number) => n <= 56 || FAMOUS.includes(n);

/**
 * The daily set, identical for everyone on the same day. It always touches the
 * s, p, d and f blocks, but stays approachable: ten common elements, one
 * friendly f-block pick, and a stretch element or two from further down.
 */
export function dailyElements(key: string): number[] {
  const rand = seeded(hashString('periodica:' + key));
  const chosen: number[] = [];
  const has = (n: number) => chosen.includes(n);
  const commonCount = () => chosen.filter(isCommonElement).length;
  const common = ELEMENTS.filter((e) => isCommonElement(e.number) && e.block !== 'f');

  // Exactly one f-block element, always a friendly one.
  chosen.push(sample(DAILY_F_PICKS, 1, rand)[0]);
  // One common element from each of the other blocks.
  for (const block of ['s', 'p', 'd'] as const) chosen.push(sample(common.filter((e) => e.block === block), 1, rand)[0].number);
  // Top up with common elements...
  for (const e of shuffle(common, rand)) {
    if (commonCount() >= DAILY_COMMON) break;
    if (!has(e.number)) chosen.push(e.number);
  }
  // ...then a small stretch from the rest of the main table.
  const stretch = ELEMENTS.filter((e) => !isCommonElement(e.number) && e.block !== 'f' && e.number <= STRETCH_MAX);
  for (const e of shuffle(stretch, rand)) {
    if (chosen.length >= DAILY_SIZE) break;
    chosen.push(e.number);
  }
  return shuffle(chosen, rand);
}
