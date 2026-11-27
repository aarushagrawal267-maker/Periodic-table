import raw from '../data/elements.json';

export type Category =
  | 'alkali-metal'
  | 'alkaline-earth-metal'
  | 'transition-metal'
  | 'post-transition-metal'
  | 'metalloid'
  | 'nonmetal'
  | 'halogen'
  | 'noble-gas'
  | 'lanthanide'
  | 'actinide';

export interface Element {
  number: number;
  symbol: string;
  name: string;
  mass: number;
  category: Category;
  period: number;
  group: number | null;
  row: number;
  col: number;
  block: 's' | 'p' | 'd' | 'f';
  state: string;
  statePredicted: boolean;
  config: string;
  configPredicted: boolean;
  electronegativity: number | null;
  radius: number | null;
  ionization: number | null;
  affinity: number | null;
  oxidation: string | null;
  melt: number | null;
  boil: number | null;
  density: number | null;
  year: number | null;
  ancient: boolean;
  summary: string | null;
  uses: string[];
  fact: string | null;
  /** Person, team or lab credited with the discovery (or isolation). */
  discoveredBy: string | null;
  /** Number of stable isotopes; 0 means every isotope is radioactive. */
  stableIsotopes: number | null;
}

export const ELEMENTS = raw as Element[];
export const byNumber = (n: number) => ELEMENTS[n - 1];
export const bySymbol = new Map(ELEMENTS.map((e) => [e.symbol.toLowerCase(), e]));

export const CATEGORIES: { id: Category; label: string; short: string }[] = [
  { id: 'alkali-metal', label: 'Alkali metal', short: 'AM' },
  { id: 'alkaline-earth-metal', label: 'Alkaline earth metal', short: 'AE' },
  { id: 'transition-metal', label: 'Transition metal', short: 'TM' },
  { id: 'post-transition-metal', label: 'Post-transition metal', short: 'PT' },
  { id: 'metalloid', label: 'Metalloid', short: 'MD' },
  { id: 'nonmetal', label: 'Nonmetal', short: 'NM' },
  { id: 'halogen', label: 'Halogen', short: 'HA' },
  { id: 'noble-gas', label: 'Noble gas', short: 'NG' },
  { id: 'lanthanide', label: 'Lanthanide', short: 'LA' },
  { id: 'actinide', label: 'Actinide', short: 'AC' },
];
export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.id === c)!.label;
export const catVar = (c: Category) => `var(--cat-${c})`;

/** Broad metallic character, derived from the category. */
export function metallicCharacter(c: Category): 'Metal' | 'Metalloid' | 'Nonmetal' {
  if (c === 'metalloid') return 'Metalloid';
  if (c === 'nonmetal' || c === 'halogen' || c === 'noble-gas') return 'Nonmetal';
  return 'Metal';
}

/** Placeholder cells in group 3 that point to the detached f-block rows. */
export const F_BLOCK_MARKERS = [
  { row: 6, col: 3, label: '57–71', category: 'lanthanide' as Category },
  { row: 7, col: 3, label: '89–103', category: 'actinide' as Category },
];

export function formatNumber(v: number | null, digits = 3): string {
  if (v === null) return '—';
  if (v !== 0 && Math.abs(v) < 0.01) return v.toExponential(2);
  return Number(v.toPrecision(digits)).toLocaleString('en-US');
}
