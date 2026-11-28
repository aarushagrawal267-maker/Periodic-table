import { ELEMENTS } from './elements';
import type { Difficulty } from '../store/settings';

/**
 * The Timed Challenge: the classic level ladder. Each level adds the next
 * elements in atomic-number order and gives less time per element, until the
 * last level asks for all 118.
 */
export interface ChallengeLevel {
  id: string;
  level: number;
  title: string;
  /** Elements in this level: atomic numbers 1 to `count`. */
  numbers: number[];
  secondsPerElement: number;
  /** The whole round's time limit, in ms. */
  timeLimitMs: number;
}

const LADDER: [count: number, secondsPerElement: number, title: string][] = [
  [10, 30, 'Hydrogen to neon'],
  [25, 25, 'Up to manganese'],
  [50, 20, 'Up to tin'],
  [75, 15, 'Up to rhenium'],
  [100, 10, 'Up to fermium'],
  [118, 8, 'The whole table'],
];

export const CHALLENGE_LEVELS: ChallengeLevel[] = LADDER.map(([count, secs, title], i) => ({
  id: `level-${i + 1}`,
  level: i + 1,
  title,
  numbers: ELEMENTS.slice(0, count).map((e) => e.number),
  secondsPerElement: secs,
  timeLimitMs: count * secs * 1000,
}));

export const challengeLevelById = (id: string) => CHALLENGE_LEVELS.find((l) => l.id === id);

type Best = Record<string, { score: number; stars: number; timeMs: number }>;
/** Best-score keys look like "challenge_level-1_standard" (see challengeBestKey in the progress store). */
const levelKeyPrefix = (id: string) => `challenge_${id}_`;

/** Best result for a level on one difficulty. */
export const challengeBest = (best: Best, id: string, difficulty: Difficulty) => best[`${levelKeyPrefix(id)}${difficulty}`];

/** A level has been cleared on any difficulty. */
export const challengeCleared = (best: Best, id: string) => Object.keys(best).some((k) => k.startsWith(levelKeyPrefix(id)));

/** Level 1 is always open; every other level opens once the one before it is cleared. */
export function challengeUnlocked(best: Best, level: ChallengeLevel) {
  if (level.level === 1) return true;
  return challengeCleared(best, CHALLENGE_LEVELS[level.level - 2].id);
}
