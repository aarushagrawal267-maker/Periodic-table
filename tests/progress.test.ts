import { beforeEach, describe, expect, test } from 'vitest';
import { previousKey, todayKey } from '../src/lib/daily';
import { useProgress, liveStreak, type RoundSummary } from '../src/store/progress';

const round = (over: Partial<RoundSummary>): RoundSummary => ({
  kind: 'lesson',
  difficulty: 'learner',
  score: 500,
  correct: 2,
  mistakes: 0,
  hints: 0,
  timeMs: 30_000,
  maxCombo: 2,
  stars: 3,
  completed: true,
  results: { 1: true, 2: true },
  trail: ['hit', 'hit'],
  ...over,
});

describe('progress store', () => {
  beforeEach(() => useProgress.getState().reset());

  test('a finished chapter earns its stars and the First Lesson badge', () => {
    const out = useProgress.getState().recordRound(round({ regionId: 'lightest-ten' }));
    expect(useProgress.getState().chapters).toEqual({ 'lightest-ten': 3 });
    expect(out.unlocked).toContain('chapter-1');
  });

  test('a spaced-review round is not saved as a chapter', () => {
    const out = useProgress.getState().recordRound(round({ regionId: 'review' }));
    expect(useProgress.getState().chapters).toEqual({});
    expect(out.unlocked).not.toContain('chapter-1');
    // It still counts as practice.
    expect(useProgress.getState().mastery[1].s).toBe(1);
  });

  test('a daily left before the end uses the attempt but does not start a streak', () => {
    const key = todayKey();
    const out = useProgress
      .getState()
      .recordRound(round({ kind: 'daily', dailyKey: key, difficulty: 'standard', score: 0, correct: 0, stars: 0, completed: false, results: {}, trail: [] }));
    const { daily } = useProgress.getState();
    expect(daily.results[key]).toBeDefined();
    expect(liveStreak(daily, key)).toBe(0);
    expect(out.unlocked).not.toContain('daily-1');
  });

  test('leaving today\'s daily early breaks a streak from yesterday straight away', () => {
    const key = todayKey();
    const yesterday = previousKey(key);
    useProgress.setState({ daily: { results: { [yesterday]: { score: 900, timeMs: 60_000, mistakes: 0, stars: 3, trail: [] } }, streak: 1, bestStreak: 1, lastKey: yesterday } });
    expect(liveStreak(useProgress.getState().daily, key)).toBe(1);
    useProgress
      .getState()
      .recordRound(round({ kind: 'daily', dailyKey: key, difficulty: 'standard', score: 0, correct: 0, stars: 0, completed: false, results: {}, trail: [] }));
    expect(liveStreak(useProgress.getState().daily, key)).toBe(0);
  });

  test('a finished daily starts the streak and unlocks Daily Dose', () => {
    const key = todayKey();
    const out = useProgress.getState().recordRound(round({ kind: 'daily', dailyKey: key, difficulty: 'standard' }));
    expect(liveStreak(useProgress.getState().daily, key)).toBe(1);
    expect(out.unlocked).toContain('daily-1');
  });
});
