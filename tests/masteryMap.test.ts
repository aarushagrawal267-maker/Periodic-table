import { describe, expect, test } from 'vitest';
import { ELEMENTS } from '../src/lib/elements';
import { SEEN_KEY, familyCounts, fillStep, improvedSince, readSeen, snapshot, stepWords, sweepDelay, writeSeen } from '../src/lib/masteryMap';
import type { Mastery } from '../src/store/progress';

const m = (s: number): Mastery => ({ s, c: s, w: 0, t: 1 });

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('mastery map', () => {
  test('strength prints as a fill step: 0 empty, 1 to 3 learning, 4 and 5 mastered', () => {
    expect([undefined, 0, 1, 2, 3, 4, 5].map(fillStep)).toEqual([0, 0, 1, 2, 3, 4, 4]);
    expect(stepWords(0)).toBe('not started yet');
    expect(stepWords(2)).toBe('learning, 2 of 4');
    expect(stepWords(4)).toBe('mastered');
  });

  test('family counts cover every element once and count mastered and learning apart', () => {
    const counts = familyCounts({ 1: m(4), 3: m(5), 11: m(2), 19: m(0), 6: m(1) });
    expect(counts.reduce((a, f) => a + f.total, 0)).toBe(ELEMENTS.length);
    const alkali = counts.find((f) => f.category === 'alkali-metal')!;
    expect(alkali).toMatchObject({ name: 'Alkali metals', total: 6, mastered: 1, learning: 1 });
    const nonmetal = counts.find((f) => f.category === 'nonmetal')!;
    expect(nonmetal).toMatchObject({ mastered: 1, learning: 1 });
  });

  test('the opening sweep ends in under 900ms with a 360ms fill', () => {
    const last = Math.max(...ELEMENTS.map(sweepDelay));
    expect(last + 360).toBeLessThanOrEqual(900);
    expect(sweepDelay({ col: 1, row: 1 })).toBe(0);
  });

  test('elements that moved up since the last snapshot are marked, and nothing on a first visit', () => {
    const now = { 1: m(4), 2: m(2), 3: m(5), 4: m(1) };
    expect(improvedSince(null, now)).toEqual([]);
    expect(improvedSince({ 1: 3, 2: 2, 3: 4 }, now)).toEqual([1, 4]);
  });

  test("a snapshot naming elements this progress never touched is someone else's: no marks", () => {
    expect(improvedSince({ 1: 2, 50: 1 }, { 1: m(3) })).toEqual([]);
  });

  test('the snapshot round-trips through storage under its own UI-only key, and an empty map leaves nothing', () => {
    const store = memoryStore();
    writeSeen(store, { 1: m(5), 2: m(0), 8: m(2) });
    expect(JSON.parse(store.data.get(SEEN_KEY)!)).toEqual({ v: 1, o: '', s: { 1: 4, 8: 2 } });
    expect(readSeen(store)).toEqual({ 1: 4, 8: 2 });
    expect(snapshot({ 2: m(0) })).toEqual({});
    writeSeen(store, {});
    expect(store.data.has(SEEN_KEY)).toBe(false);
    expect(SEEN_KEY).not.toBe('periodica-progress');
  });

  test('a broken or foreign snapshot reads as none', () => {
    expect(readSeen(memoryStore({ [SEEN_KEY]: '{oops' }))).toBeNull();
    expect(readSeen(memoryStore({ [SEEN_KEY]: JSON.stringify({ v: 9, s: {} }) }))).toBeNull();
    expect(readSeen(memoryStore({ [SEEN_KEY]: JSON.stringify({ v: 1, s: { 1: 3, 999: 2, x: 1 } }) }))).toEqual({ 1: 3 });
    expect(readSeen(undefined)).toBeNull();
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
    expect(readSeen(throwing)).toBeNull();
    expect(() => writeSeen(throwing, { 1: m(1) })).not.toThrow();
  });
});

describe('the moved-up snapshot belongs to one owner', () => {
  const mem = () => {
    const d = new Map<string, string>();
    return { getItem: (k: string) => d.get(k) ?? null, setItem: (k: string, v: string) => void d.set(k, v), removeItem: (k: string) => void d.delete(k) };
  };
  const m = (s: number) => ({ s }) as unknown as Parameters<typeof snapshot>[0][number];

  test('a snapshot saved for one owner is ignored for another (a sign out, a new student, a reset)', () => {
    const store = mem();
    writeSeen(store, { 1: m(2), 3: m(1) }, 'gen-a:0');
    expect(readSeen(store, 'gen-a:0')).toEqual({ 1: 2, 3: 1 });
    expect(readSeen(store, 'gen-b:0')).toBeNull();
    expect(readSeen(store, 'gen-a:1')).toBeNull();
    expect(readSeen(store)).toBeNull();
  });
});
