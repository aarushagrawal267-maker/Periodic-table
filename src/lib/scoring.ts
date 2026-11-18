export const BASE_POINTS = 100;

/** Combo multiplier tiers: x1, x1.5 from 3 in a row, x2 from 6, x3 from 10. */
export function multiplier(combo: number) {
  if (combo >= 10) return 3;
  if (combo >= 6) return 2;
  if (combo >= 3) return 1.5;
  return 1;
}

/** Up to 50 bonus points for placing within 10 seconds of the previous move. */
export function speedBonus(secondsSinceLast: number) {
  return Math.max(0, Math.round(50 - secondsSinceLast * 5));
}

export function placementPoints(combo: number, secondsSinceLast: number) {
  return Math.round((BASE_POINTS + speedBonus(secondsSinceLast)) * multiplier(combo));
}

export function accuracy(correct: number, mistakes: number) {
  return correct + mistakes === 0 ? 1 : correct / (correct + mistakes);
}

export function stars(acc: number, completed: boolean) {
  if (!completed) return 0;
  if (acc >= 0.95) return 3;
  if (acc >= 0.8) return 2;
  return 1;
}

/** XP needed to reach `level` from zero. Grows gently so early levels come fast. */
export function xpForLevel(level: number) {
  return Math.round(400 * Math.pow(level - 1, 1.45));
}

export function levelFromXp(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, progress: (xp - floor) / (next - floor), toNext: next - xp };
}

const TITLES = [
  'Novice',
  'Apprentice',
  'Lab Assistant',
  'Chemist',
  'Alchemist',
  'Researcher',
  'Professor',
  'Grandmaster',
  'Nobel Laureate',
];
export const titleForLevel = (level: number) => TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 4))];

export function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
