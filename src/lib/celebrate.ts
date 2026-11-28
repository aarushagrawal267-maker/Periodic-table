import { ELEMENTS, byNumber, catVar, type Category } from './elements';

/**
 * Celebration maths, kept apart from React so it can be tested and stays the same on every render.
 * Confetti is made of tiny element squares in their category colours (the result moment, docs/DESIGN.md).
 */

/** Which finish a results screen celebrates. */
export type Finish = 'stars' | 'level' | 'master';

export interface ConfettiPiece {
  /** Atomic number the piece stands for. */
  n: number;
  category: Category;
  /** `var(--cat-…)`: every piece is printed in its element's category colour. */
  color: string;
  /** Set on the larger pieces, which are printed like little tiles with the element's symbol. */
  symbol?: string;
  /** Edge length in px. */
  size: number;
  /** Sideways travel, -1 (left) to 1 (right), as a share of the layer's spread. */
  dx: number;
  /** How high the piece is thrown, 0.35 to 1, as a share of the layer's lift. */
  up: number;
  /** How far down it falls, 0.6 to 1, as a share of the distance to the layer's bottom edge. */
  fall: number;
  /** Turn over the whole flight, in degrees. */
  rot: number;
  /** Start delay and duration, in seconds. */
  delay: number;
  dur: number;
}

/** Confetti count for each finish: a few dozen pieces, more for the master finish. */
export const CONFETTI_COUNT: Record<Finish, number> = { stars: 48, level: 56, master: 70 };

/** Every piece has landed by then (seconds): the longest delay plus the longest flight. */
export const CONFETTI_TOTAL_S = 2.5;

/** Small, fast, seeded PRNG (mulberry32), so the same result always throws the same confetti. */
export function seeded(seed: number) {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The pieces for one celebration. `elements` are the round's atomic numbers: the confetti is made of what
 * the student just placed (any element when the list is empty). One piece in five is a symbol tile.
 */
export function confettiPieces({ count, seed, elements = [] }: { count: number; seed: number; elements?: number[] }): ConfettiPiece[] {
  const rnd = seeded(seed);
  const pool = elements.length ? elements : ELEMENTS.map((e) => e.number);
  const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  const pieces: ConfettiPiece[] = [];
  for (let i = 0; i < count; i++) {
    const e = byNumber(pool[Math.floor(rnd() * pool.length)]);
    const tile = i % 5 === 0;
    // A fan thrown upwards: most pieces leave near the middle, a few go wide.
    const spread = rnd() * 2 - 1;
    pieces.push({
      n: e.number,
      category: e.category,
      color: catVar(e.category),
      symbol: tile ? e.symbol : undefined,
      size: Math.round(tile ? between(20, 26) : between(6, 11)),
      dx: Math.sign(spread) * Math.pow(Math.abs(spread), 0.8),
      up: between(0.35, 1),
      fall: between(0.6, 1),
      rot: Math.round(between(-1, 1) * (tile ? 120 : 420)),
      delay: Number(between(0.3, 0.5).toFixed(3)),
      dur: Number(between(1.5, 2).toFixed(3)),
    });
  }
  return pieces;
}

/** Stable seed for a finished round, so a re-render never re-throws different confetti. */
export function roundSeed(parts: number[]) {
  let h = 2166136261;
  for (const p of parts) {
    h ^= Math.round(p) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export interface SnapBit {
  /** Start and end offsets from the cell centre, in px. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  size: number;
  rot: number;
  /** Solid category colour, or the lighter printed tint. */
  solid: boolean;
  delay: number;
}

/**
 * The snap: 8 tiny squares leave the rim of a cell that was just filled and fly about half a cell out.
 * The angles are jittered by the element's number so no two snaps look stamped.
 */
export function snapBits(cell: number, n: number, count = 8): SnapBit[] {
  const rnd = seeded(n * 7919 + 13);
  const size = Math.max(4, Math.min(10, Math.round(cell * 0.14)));
  return Array.from({ length: count }, (_, i) => {
    const a = ((i / count) * 360 + (rnd() - 0.5) * 30 - 90) * (Math.PI / 180);
    const r0 = cell * 0.42;
    const r1 = cell * (0.85 + rnd() * 0.25);
    return {
      x0: Math.round(Math.cos(a) * r0),
      y0: Math.round(Math.sin(a) * r0),
      x1: Math.round(Math.cos(a) * r1),
      y1: Math.round(Math.sin(a) * r1),
      size,
      rot: Math.round((rnd() - 0.5) * 180),
      solid: i % 2 === 0,
      delay: Math.round(rnd() * 40),
    };
  });
}
