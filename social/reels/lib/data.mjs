// Element facts and design tokens, read from the app itself so reels never drift from Periodica.
// - Facts: src/data/elements.json (built by scripts/build-data.mjs), the same file src/lib/elements.ts imports.
// - Tokens: the :root block of src/styles/index.css (ramp, accent, semantic and category colours).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const REELS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = resolve(REELS_DIR, '..', '..');

export const ELEMENTS = JSON.parse(readFileSync(join(REPO_ROOT, 'src/data/elements.json'), 'utf8'));

export function byNumber(n) {
  const e = ELEMENTS[n - 1];
  if (!e || e.number !== n) throw new Error(`No element with atomic number ${n} in src/data/elements.json`);
  return e;
}

// Same labels as CATEGORIES in src/lib/elements.ts.
const CATEGORY_LABELS = {
  'alkali-metal': 'Alkali metal',
  'alkaline-earth-metal': 'Alkaline earth metal',
  'transition-metal': 'Transition metal',
  'post-transition-metal': 'Post-transition metal',
  metalloid: 'Metalloid',
  nonmetal: 'Nonmetal',
  halogen: 'Halogen',
  'noble-gas': 'Noble gas',
  lanthanide: 'Lanthanide',
  actinide: 'Actinide',
};

export function categoryLabel(c) {
  const label = CATEGORY_LABELS[c];
  if (!label) throw new Error(`Unknown category "${c}"`);
  return label;
}

/** formatNumber() from src/lib/elements.ts. */
export function formatNumber(v, digits = 3) {
  if (v === null || v === undefined) return '—';
  if (v !== 0 && Math.abs(v) < 0.01) return v.toExponential(2);
  return Number(v.toPrecision(digits)).toLocaleString('en-US');
}

/** The tokens of the first :root block in src/styles/index.css (the dark theme, the only one). */
export function readTokens() {
  const css = readFileSync(join(REPO_ROOT, 'src/styles/index.css'), 'utf8');
  const start = css.indexOf(':root {');
  if (start < 0) throw new Error('No :root block in src/styles/index.css');
  const block = css.slice(start, css.indexOf('\n}', start));
  const tokens = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
  for (const need of ['bg', 'surface', 'surface-2', 'ink', 'ink-2', 'ink-3', 'accent', 'good', 'bad', 'tile-tint', 'tile-edge', 'cell-ink-mix', 'mini-tint']) {
    if (!tokens[need]) throw new Error(`Token --${need} missing from src/styles/index.css`);
  }
  return tokens;
}

/** The element facts a reel may show, prepared the way the app's element card prints them. */
export function elementForReel(n) {
  const e = byNumber(n);
  return {
    number: e.number,
    symbol: e.symbol,
    name: e.name,
    category: e.category,
    categoryLabel: categoryLabel(e.category),
    mass: e.mass,
    massText: formatNumber(e.mass, 6),
    massDecimals: (formatNumber(e.mass, 6).split('.')[1] ?? '').length,
    group: e.group,
    period: e.period,
    row: e.row,
    col: e.col,
    block: e.block,
    state: e.state + (e.statePredicted ? ' (predicted)' : ''),
    melt: e.melt,
    boil: e.boil,
    density: e.density,
    year: e.year,
    ancient: e.ancient,
    discovered: e.ancient ? 'Ancient' : e.year ? String(e.year) : null,
    uses: e.uses ?? [],
    fact: e.fact,
    summary: e.summary,
  };
}

/** Kelvin to a rounded Celsius figure, as the app's element card prints it. */
export const toC = (k) => `${Math.round(k - 273.15).toLocaleString('en-US')} °C`;

/** Every element's position and category, for the mini table. */
export function tableCells() {
  return ELEMENTS.map((e) => ({ n: e.number, s: e.symbol, r: e.row, c: e.col, cat: e.category }));
}

/**
 * If a quiz answer is an element (its name or symbol, alone), return its number so the reveal can print its tile.
 */
export function elementInText(text) {
  const t = String(text).trim().toLowerCase();
  const hit = ELEMENTS.find((e) => e.name.toLowerCase() === t || e.symbol.toLowerCase() === t);
  return hit ? hit.number : null;
}
