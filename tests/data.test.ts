import { describe, expect, test } from 'vitest';
import { ELEMENTS, CATEGORIES } from '../src/lib/elements';
import { shells } from '../src/lib/shells';
import { REGIONS } from '../src/lib/regions';

describe('element data', () => {
  test('has all 118 elements in order', () => {
    expect(ELEMENTS).toHaveLength(118);
    ELEMENTS.forEach((e, i) => expect(e.number).toBe(i + 1));
  });

  test('every element has its own cell', () => {
    const cells = new Set(ELEMENTS.map((e) => `${e.row},${e.col}`));
    expect(cells.size).toBe(118);
  });

  test('positions follow the standard 18-column layout', () => {
    for (const e of ELEMENTS) {
      expect(e.col).toBeGreaterThanOrEqual(1);
      expect(e.col).toBeLessThanOrEqual(18);
      expect([1, 2, 3, 4, 5, 6, 7, 9, 10]).toContain(e.row);
      if (e.group !== null) expect(e.col).toBe(e.group);
    }
    const at = (s: string) => ELEMENTS.find((e) => e.symbol === s)!;
    expect([at('He').row, at('He').col]).toEqual([1, 18]);
    expect([at('La').row, at('La').col]).toEqual([9, 3]);
    expect([at('Lu').row, at('Lu').col]).toEqual([9, 17]);
    expect([at('Ac').row, at('Ac').col]).toEqual([10, 3]);
    expect([at('Hf').row, at('Hf').col]).toEqual([6, 4]);
    expect([at('Og').row, at('Og').col]).toEqual([7, 18]);
  });

  test('every element has a known category and learning content', () => {
    const ids = new Set(CATEGORIES.map((c) => c.id));
    for (const e of ELEMENTS) {
      expect(ids.has(e.category), e.symbol).toBe(true);
      expect(e.summary, e.symbol).toBeTruthy();
      expect(e.fact, e.symbol).toBeTruthy();
      expect(e.uses, e.symbol).toHaveLength(3);
    }
  });

  test('electron shells add up to the atomic number', () => {
    for (const e of ELEMENTS) expect(shells(e).reduce((a, b) => a + b, 0), `${e.symbol} ${e.config}`).toBe(e.number);
    expect(shells(ELEMENTS[25])).toEqual([2, 8, 14, 2]); // Fe
  });

  test('regions are non-empty and the full table covers everything', () => {
    for (const r of REGIONS) expect(r.numbers.length).toBeGreaterThan(0);
    expect(REGIONS.find((r) => r.id === 'full')!.numbers).toHaveLength(118);
  });
});

import { CHAPTERS } from '../src/lib/chapters';
import { THINGS, buildLifeRound, LIFE_OPTIONS } from '../src/lib/everyday';
import { bySymbol, byNumber } from '../src/lib/elements';

describe('learning content', () => {
  test('every mnemonic matches its chapter elements in order', () => {
    for (const c of CHAPTERS) {
      if (!c.mnemonic) continue;
      expect(c.mnemonic.map(([, s]) => s), c.id).toEqual(c.numbers.map((n) => byNumber(n).symbol));
      for (const [word, s] of c.mnemonic) expect(word.toLowerCase().replace(/[^a-z]/g, ''), `${c.id} ${word}`).toContain(s[0].toLowerCase());
    }
  });
  test('everyday objects reference real elements', () => {
    for (const t of THINGS) for (const [s] of t.contains) expect(bySymbol.get(s.toLowerCase()), `${t.id} ${s}`).toBeTruthy();
  });
  test('real-life rounds have unique options that include every answer', () => {
    for (const q of buildLifeRound()) {
      expect(q.options).toHaveLength(LIFE_OPTIONS);
      expect(new Set(q.options.map((e) => e.number)).size).toBe(LIFE_OPTIONS);
      for (const n of q.answer) expect(q.options.some((e) => e.number === n)).toBe(true);
    }
  });
});
