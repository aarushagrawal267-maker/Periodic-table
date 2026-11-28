import { describe, expect, test } from 'vitest';
import { PRINT_DURATION, printDelay } from '../src/components/heroPrint';
import { ELEMENTS, byNumber } from '../src/lib/elements';

describe('the Home table print sweep', () => {
  test('the whole table has printed within 800ms', () => {
    const last = Math.max(...ELEMENTS.map(printDelay));
    expect(last + PRINT_DURATION).toBeLessThanOrEqual(800);
  });

  test('it starts at hydrogen and sweeps across the groups and down the periods', () => {
    expect(printDelay(byNumber(1))).toBe(0);
    // Along a period, left to right.
    expect(printDelay(byNumber(3))).toBeLessThan(printDelay(byNumber(4)));
    expect(printDelay(byNumber(4))).toBeLessThan(printDelay(byNumber(10)));
    // Down a group, top to bottom.
    expect(printDelay(byNumber(3))).toBeLessThan(printDelay(byNumber(11)));
    expect(printDelay(byNumber(11))).toBeLessThan(printDelay(byNumber(87)));
    // The f-block rows print after the main table above them.
    expect(printDelay(byNumber(57))).toBeGreaterThan(printDelay(byNumber(39)));
  });
});
