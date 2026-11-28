import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { MARK, MARK_HEIGHT, MARK_SQUARES, MARK_WIDTH, markRect } from '../src/lib/brand';
import { byNumber } from '../src/lib/elements';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** The dark theme's hex values (the first :root block), which the static icons are printed in. */
function darkTokens() {
  const css = read('src/styles/index.css');
  const start = css.indexOf(':root {');
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8});/g)].map((m) => [m[1], m[2].toLowerCase()]));
}

describe('the mark', () => {
  test('is the table silhouette: tall at both ends, low in the middle', () => {
    const height = (col: number) => MARK_SQUARES.filter((s) => s.col === col).length;
    expect([0, 1, 2, 3, 4].map(height)).toEqual([3, 2, 1, 2, 3]);
    // Every column is a solid stack from the bottom row up, like the chart.
    for (let col = 0; col < MARK.cols; col++) {
      const rows = MARK_SQUARES.filter((s) => s.col === col).map((s) => s.row).sort();
      expect(rows).toEqual(Array.from({ length: rows.length }, (_, i) => MARK.rows - rows.length + i));
    }
    // No two squares share a place.
    expect(new Set(MARK_SQUARES.map((s) => `${s.col},${s.row}`)).size).toBe(MARK_SQUARES.length);
  });

  test('each square is printed in the category colour of the element it stands for', () => {
    for (const s of MARK_SQUARES) expect(byNumber(s.z).category).toBe(s.category);
    // Hydrogen and helium on top, the alkali metals down the left, the noble gases down the right.
    expect(MARK_SQUARES.filter((s) => s.row === 0).map((s) => byNumber(s.z).symbol)).toEqual(['H', 'He']);
    expect(MARK_SQUARES.filter((s) => s.col === 4).map((s) => byNumber(s.z).group)).toEqual([18, 18, 18]);
    expect(MARK_SQUARES.filter((s) => s.col === 0 && s.row > 0).every((s) => byNumber(s.z).group === 1)).toBe(true);
  });

  test('fits its viewBox exactly', () => {
    const right = Math.max(...MARK_SQUARES.map((s) => markRect(s).x + MARK.cell));
    const bottom = Math.max(...MARK_SQUARES.map((s) => markRect(s).y + MARK.cell));
    expect([right, bottom]).toEqual([MARK_WIDTH, MARK_HEIGHT]);
  });
});

describe('the app icons', () => {
  const tokens = darkTokens();

  test.each(['public/icon.svg', 'public/icon-maskable.svg'])('%s draws the mark in the dark theme colours', (file) => {
    const svg = read(file);
    expect(svg).not.toContain('>Pa<');
    expect(svg).toContain(`fill="${tokens.bg}"`);
    const fills = [...svg.matchAll(/<rect x="[^"]+" y="[^"]+" width="8" height="8" rx="[^"]+" fill="(#[0-9a-f]+)"\/>/g)].map((m) => m[1].toLowerCase());
    expect(fills).toEqual(MARK_SQUARES.map((s) => tokens[`cat-${s.category}`]));
  });

  test('the maskable icon keeps the mark inside the central safe zone', () => {
    const m = read('public/icon-maskable.svg').match(/translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/)!;
    const [x, y, scale] = m.slice(1).map(Number);
    const corners = [
      [x, y],
      [x + MARK_WIDTH * scale, y + MARK_HEIGHT * scale],
    ];
    // Android's safe zone: a circle of 40% radius around the centre.
    for (const [cx, cy] of corners) expect(Math.hypot(cx - 256, cy - 256)).toBeLessThanOrEqual(512 * 0.4);
  });

  test('the manifest and the page point at icons that exist', () => {
    const config = read('vite.config.ts');
    const html = read('index.html');
    const srcs = [...config.matchAll(/src: '([^']+\.(?:svg|png))'/g)].map((m) => m[1]);
    expect(srcs).toEqual(expect.arrayContaining(['icon.svg', 'icon-maskable.svg', 'icon-192.png', 'icon-512.png']));
    expect(html).toContain('rel="apple-touch-icon" href="./apple-touch-icon.png"');
    for (const f of [...srcs, 'apple-touch-icon.png', 'og.png']) expect(() => readFileSync(join(root, 'public', f))).not.toThrow();
  });
});
