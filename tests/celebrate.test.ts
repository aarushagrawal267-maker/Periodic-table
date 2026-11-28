import { describe, expect, test } from 'vitest';
import { CATEGORIES, byNumber } from '../src/lib/elements';
import { CONFETTI_COUNT, CONFETTI_TOTAL_S, confettiPieces, roundSeed, seeded, snapBits } from '../src/lib/celebrate';

const CAT_IDS = new Set(CATEGORIES.map((c) => c.id));

describe('confetti generator', () => {
  test('gives exactly the asked count, a few dozen per finish', () => {
    for (const [finish, count] of Object.entries(CONFETTI_COUNT)) {
      expect(count, finish).toBeGreaterThanOrEqual(40);
      expect(count, finish).toBeLessThanOrEqual(70);
      expect(confettiPieces({ count, seed: 7 })).toHaveLength(count);
    }
  });

  test('is stable: the same seed throws the same confetti, another seed does not', () => {
    const a = confettiPieces({ count: 56, seed: 1234, elements: [1, 2, 3, 11, 17] });
    const b = confettiPieces({ count: 56, seed: 1234, elements: [1, 2, 3, 11, 17] });
    const c = confettiPieces({ count: 56, seed: 4321, elements: [1, 2, 3, 11, 17] });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  test('every piece is printed in its own element category colour, from the category variables', () => {
    for (const p of confettiPieces({ count: 70, seed: 99 })) {
      expect(CAT_IDS.has(p.category)).toBe(true);
      expect(p.category).toBe(byNumber(p.n).category);
      expect(p.color).toBe(`var(--cat-${p.category})`);
      expect(p.color).not.toMatch(/#/);
    }
  });

  test('is made of the round elements, and one piece in five is a symbol tile', () => {
    const round = [3, 11, 19];
    const pieces = confettiPieces({ count: 50, seed: 5, elements: round });
    expect(pieces.every((p) => round.includes(p.n))).toBe(true);
    const tiles = pieces.filter((p) => p.symbol);
    expect(tiles).toHaveLength(10);
    for (const t of tiles) {
      expect(t.symbol).toBe(byNumber(t.n).symbol);
      expect(t.size).toBeGreaterThanOrEqual(20);
    }
  });

  test('stays inside its ranges and lands within the total time', () => {
    for (const p of confettiPieces({ count: 70, seed: 2026 })) {
      expect(p.dx).toBeGreaterThanOrEqual(-1);
      expect(p.dx).toBeLessThanOrEqual(1);
      expect(p.up).toBeGreaterThanOrEqual(0.35);
      expect(p.up).toBeLessThanOrEqual(1);
      expect(p.fall).toBeGreaterThanOrEqual(0.6);
      expect(p.fall).toBeLessThanOrEqual(1);
      expect(p.size).toBeGreaterThanOrEqual(6);
      expect(p.size).toBeLessThanOrEqual(26);
      expect(p.delay + p.dur).toBeLessThanOrEqual(CONFETTI_TOTAL_S);
    }
  });

  test('seeds: the PRNG is in [0, 1) and a round seed is stable', () => {
    const r = seeded(42);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(roundSeed([1200, 65_000, 20, 1])).toBe(roundSeed([1200, 65_000, 20, 1]));
    expect(roundSeed([1200, 65_000, 20, 1])).not.toBe(roundSeed([1210, 65_000, 20, 1]));
  });
});

describe('snap burst', () => {
  test('eight small squares fly outwards from the rim of the cell', () => {
    const bits = snapBits(60, 26);
    expect(bits).toHaveLength(8);
    for (const b of bits) {
      expect(Math.hypot(b.x1, b.y1)).toBeGreaterThan(Math.hypot(b.x0, b.y0));
      expect(Math.hypot(b.x1, b.y1)).toBeLessThanOrEqual(60 * 1.11);
      expect(b.size).toBeGreaterThanOrEqual(4);
      expect(b.size).toBeLessThanOrEqual(10);
    }
    expect(snapBits(60, 26)).toEqual(bits);
  });
});
