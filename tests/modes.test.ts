import { describe, expect, test } from 'vitest';
import { buildDeck, matchScore, matchStars, pickPairs, MATCH_PAIRS } from '../src/lib/match';
import { buildLifeRound, THINGS } from '../src/lib/everyday';
import { buildQuiz, overlaps, quizPool, QUIZ_STRETCH } from '../src/lib/quiz';
import type { Mastery } from '../src/store/progress';
import { CATEGORIES, ELEMENTS, byNumber } from '../src/lib/elements';

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

const DIFFS = ['learner', 'standard', 'expert'] as const;
const met = (nums: number[], s = 2): Record<number, Mastery> => Object.fromEntries(nums.map((n) => [n, { s, c: 1, w: 1, t: 0 }]));
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const quizzed = (q: ReturnType<typeof buildQuiz>[number]) =>
  q.kind === 'extreme' ? q.options.map((o) => ELEMENTS.find((e) => e.name === o)!.number) : [q.element];

describe('quick quiz is fair for beginners', () => {
  test('a brand-new player is only asked about the first chapters', () => {
    expect(quizPool('learner', {}).map((e) => e.number)).toEqual(range(1, 20));
    expect(quizPool('standard', {}).map((e) => e.number)).toEqual(range(1, 20));
    expect(quizPool('expert', {}).map((e) => e.number)).toEqual(range(1, 36));
    for (let i = 0; i < 200; i++)
      for (const d of DIFFS) {
        const limit = d === 'expert' ? 36 : 20;
        for (const q of buildQuiz(d, {})) for (const n of quizzed(q)) expect(n, `${d} ${q.prompt}`).toBeLessThanOrEqual(limit);
      }
  });

  test('the pool is what the player has met plus a small stretch', () => {
    expect(quizPool('standard', met(range(1, 20))).map((e) => e.number)).toEqual(range(1, 20 + QUIZ_STRETCH));
    expect(quizPool('standard', met(range(1, 30))).map((e) => e.number)).toEqual(range(1, 30 + QUIZ_STRETCH));
    // Meeting just a few elements never shrinks the pool below a new player's.
    expect(quizPool('standard', met([1, 2, 3])).map((e) => e.number)).toEqual(range(1, 20));
    // A one-off visit far away adds that element and its neighbours, not everything in between.
    const far = quizPool('standard', met([...range(1, 20), 79])).map((e) => e.number);
    expect(far).toEqual([...range(1, 20), ...range(79, 84)]);
  });

  test('never leaves the difficulty pool', () => {
    // Learner has no lanthanides or superheavies, even if the player has explored them.
    const learner = quizPool('learner', met([...range(1, 20), 65, 100, 118])).map((e) => e.number);
    expect(learner).not.toContain(65);
    expect(learner).not.toContain(100);
    expect(learner).not.toContain(118);
    expect(learner).toEqual(range(1, 25));
    const standard = quizPool('standard', met(range(1, 86))).map((e) => e.number);
    expect(Math.max(...standard)).toBe(94);
    expect(standard).not.toContain(87);
  });

  test('wrong answers come from familiar elements', () => {
    const mastery = met(range(1, 20));
    const known = new Set(quizPool('standard', mastery).flatMap((e) => [e.name, e.symbol]));
    for (let i = 0; i < 200; i++)
      for (const d of ['learner', 'standard'] as const)
        for (const q of buildQuiz(d, mastery).filter((x) => x.kind !== 'category'))
          for (const o of q.options) expect(known.has(o), `${q.prompt}: ${o}`).toBe(true);
  });

  test('"What kind of element" never has a second true answer', () => {
    const label = (id: string) => CATEGORIES.find((c) => c.id === id)!.label;
    expect(overlaps('halogen', 'nonmetal')).toBe(true);
    expect(overlaps('nonmetal', 'noble-gas')).toBe(true);
    for (let i = 0; i < 300; i++)
      for (const d of ['learner', 'standard', 'expert'] as const)
        for (const q of buildQuiz(d, met(range(1, 86))).filter((x) => x.kind === 'category')) {
          const right = byNumber(q.element).category;
          for (const c of CATEGORIES) if (overlaps(c.id, right)) expect(q.options, q.prompt).not.toContain(label(c.id));
        }
  });

  test('weaker elements come up more often', () => {
    const mastery = { ...met(range(1, 20), 5), 7: { s: 0, c: 0, w: 3, t: 0 } };
    let weak = 0;
    let strong = 0;
    for (let i = 0; i < 300; i++)
      for (const q of buildQuiz('standard', mastery)) {
        if (q.element === 7) weak++;
        if (q.element === 8) strong++;
      }
    expect(weak).toBeGreaterThan(strong);
  });

  test('electronegativity questions only appear on expert', () => {
    let expert = 0;
    for (let i = 0; i < 200; i++) {
      for (const d of ['learner', 'standard'] as const) {
        expect(buildQuiz(d, {}).some((q) => q.kind === 'extreme')).toBe(false);
        expect(buildQuiz(d, met(range(1, 86))).some((q) => q.kind === 'extreme')).toBe(false);
      }
      if (buildQuiz('expert', {}).some((q) => q.kind === 'extreme')) expert++;
    }
    expect(expert).toBeGreaterThan(100);
  });
});
