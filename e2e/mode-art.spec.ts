import { expect, test } from './support';

/**
 * The game-mode illustrations: decorative, drawn inside their box at every width,
 * the composition picked by the box's shape, and no text under 9px.
 */
test.describe('mode card illustrations', { tag: '@phone' }, () => {
  for (const [hash, names] of [
    ['./#/play', ['timed', 'match', 'life', 'quiz']],
    ['./', ['quiz', 'match']],
  ] as const) {
    test(`${hash} draws ${names.join(', ')} inside their boxes`, async ({ page, consoleErrors }) => {
      await page.goto(hash);
      for (const name of names) {
        const art = page.locator(`.mode-art-${name}`).first();
        await art.scrollIntoViewIfNeeded();
        await expect(art).toBeVisible();
        await expect(art).toHaveAttribute('aria-hidden', 'true');
        const m = await art.evaluate((a) => {
          const box = a.getBoundingClientRect();
          const shown = [...a.querySelectorAll('svg')].filter((s) => getComputedStyle(s).display !== 'none');
          const svg = shown[0];
          const vb = svg.viewBox.baseVal;
          const k = Math.min(box.width / vb.width, box.height / vb.height);
          // Everything drawn stays inside the viewBox, so it stays inside the box.
          const bb = svg.getBBox();
          const fonts = [...svg.querySelectorAll('text')].map((t) => Number(t.getAttribute('font-size')) * k);
          return {
            shown: shown.length,
            wide: svg.classList.contains('mode-art-wide'),
            aspect: box.width / box.height,
            inside: bb.x >= -1 && bb.y >= -1 && bb.x + bb.width <= vb.width + 1 && bb.y + bb.height <= vb.height + 1,
            minFont: fonts.length ? Math.min(...fonts) : 99,
            pointer: getComputedStyle(a).pointerEvents,
          };
        });
        expect(m.shown, `${name}: one composition at a time`).toBe(1);
        expect(m.wide, `${name}: the wide scene only in a wide box`).toBe(m.aspect > 1.6);
        expect(m.inside, `${name}: nothing drawn outside the box`).toBe(true);
        expect(m.minFont, `${name}: no text under 9px`).toBeGreaterThanOrEqual(9);
        expect(m.pointer).toBe('none');
      }
      expect(consoleErrors).toEqual([]);
    });
  }
});
