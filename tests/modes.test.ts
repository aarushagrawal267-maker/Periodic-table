import { describe, expect, test } from 'vitest';
import { buildDeck, matchScore, matchStars, pickPairs, MATCH_PAIRS } from '../src/lib/match';
import { buildLifeRound, THINGS } from '../src/lib/everyday';
import { buildQuiz } from '../src/lib/quiz';
import { ELEMENTS } from '../src/lib/elements';

describe('match pairs', () => {
  test('deck has one symbol card and one name card per element', () => {
    const pairs = pickPairs({});
    expect(new Set(pairs).size).toBe(MATCH_PAIRS);
    const deck = buildDeck(pairs);
    expect(deck).toHaveLength(MATCH_PAIRS * 2);
    for (const n of pairs) expect(deck.filter((c) => c.element === n).map((c) => c.face).sort()).toEqual(['name', 'symbol']);
  });
  test('elements that need practice are picked first', () => {
    const now = Date.now();
    const pairs = pickPairs({ 80: { s: 0, c: 0, w: 2, t: now - 1000 }, 26: { s: 1, c: 1, w: 1, t: now - 1000 } }, now);
    expect(pairs).toContain(80);
  });
  test('fewer moves earn more stars and points', () => {
    expect(matchStars(6, 6)).toBe(3);
    expect(matchStars(12, 6)).toBe(2);
    expect(matchStars(20, 6)).toBe(1);
    expect(matchScore(6, 20, 6)).toBeGreaterThan(matchScore(12, 20, 6));
    expect(matchScore(100, 900, 6)).toBe(100);
  });
});

describe('answer keys are fair', () => {
  test('real-life decoys are never mentioned in the explanation', () => {
    for (let i = 0; i < 200; i++)
      for (const q of buildLifeRound()) {
        const text = q.thing.contains.map(([, w]) => w.toLowerCase()).join(' ');
        for (const e of q.options) if (!q.answer.has(e.number)) expect(text.includes(e.name.toLowerCase()), `${q.thing.id}: ${e.name}`).toBe(false);
      }
    expect(THINGS.length).toBeGreaterThanOrEqual(40);
  });
  test('fact questions never show the answer name', () => {
    for (let i = 0; i < 200; i++)
      for (const d of ['learner', 'standard', 'expert'] as const)
        for (const q of buildQuiz(d, {}).filter((x) => x.kind === 'fact')) {
          const name = ELEMENTS[q.element - 1].name.toLowerCase();
          expect(new RegExp(`\\b${name}\\b`).test(q.prompt.toLowerCase()), q.prompt).toBe(false);
        }
  });
});
