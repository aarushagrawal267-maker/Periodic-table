import { ELEMENTS } from './elements';
import { dueForReview } from './review';
import { sample, shuffle } from './random';
import type { Mastery } from '../store/progress';

export interface MatchCard {
  id: string;
  element: number;
  face: 'symbol' | 'name';
}

export const MATCH_PAIRS = 6;

/** Common, recognisable elements for players who haven't practised much yet. */
const STARTER = ELEMENTS.filter((e) => e.number <= 30 || [47, 50, 53, 78, 79, 80, 82, 92].includes(e.number)).map((e) => e.number);

/**
 * Pick the pairs: elements due for review first, then ones the player has
 * met but not mastered, topped up with familiar starters.
 */
export function pickPairs(mastery: Record<number, Mastery>, now = Date.now(), n = MATCH_PAIRS): number[] {
  const chosen = new Set<number>(dueForReview(mastery, now, Math.ceil(n / 2)));
  const learning = Object.entries(mastery)
    .filter(([, m]) => m.s < 4)
    .map(([k]) => Number(k));
  for (const x of sample(learning, n)) if (chosen.size < n) chosen.add(x);
  for (const x of sample(STARTER, n * 2)) if (chosen.size < n) chosen.add(x);
  return [...chosen];
}

export function buildDeck(pairs: number[]): MatchCard[] {
  return shuffle(pairs.flatMap((n) => [{ id: `${n}-s`, element: n, face: 'symbol' as const }, { id: `${n}-n`, element: n, face: 'name' as const }]));
}

export function matchStars(moves: number, pairs: number) {
  if (moves <= pairs + 2) return 3;
  if (moves <= pairs * 2) return 2;
  return 1;
}

export function matchScore(moves: number, seconds: number, pairs: number) {
  return Math.max(100, Math.round(pairs * 200 - (moves - pairs) * 40 - seconds * 3));
}
