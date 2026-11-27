// Builds src/data/elements.json from the PubChem periodic table export
// (scripts/source/pubchem-periodic-table.json) plus the hand-written
// learning content in src/data/content-1.json and src/data/content-2.json,
// plus discoverers and stable isotope counts from src/data/discovery.json.
//
// Stable isotope counts: Wikipedia, "List of elements by stability of isotopes"
// (251 stable nuclides in total).
//
// Source: PubChem, National Center for Biotechnology Information.
// https://pubchem.ncbi.nlm.nih.gov/periodic-table/
//
// Run with: npm run data
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(readFileSync(join(root, 'scripts/source/pubchem-periodic-table.json'), 'utf8'));
const columns = source.Table.Columns.Column;
const rows = source.Table.Row.map((r) => Object.fromEntries(columns.map((c, i) => [c, r.Cell[i]])));

const content = {};
for (const file of ['content-1.json', 'content-2.json']) {
  const p = join(root, 'src/data', file);
  if (existsSync(p)) Object.assign(content, JSON.parse(readFileSync(p, 'utf8')));
}

const discoveryPath = join(root, 'src/data/discovery.json');
const discovery = existsSync(discoveryPath) ? JSON.parse(readFileSync(discoveryPath, 'utf8')) : {};

const CATEGORY = {
  'Alkali metal': 'alkali-metal',
  'Alkaline earth metal': 'alkaline-earth-metal',
  'Transition metal': 'transition-metal',
  'Post-transition metal': 'post-transition-metal',
  Metalloid: 'metalloid',
  Nonmetal: 'nonmetal',
  Halogen: 'halogen',
  'Noble gas': 'noble-gas',
  Lanthanide: 'lanthanide',
  Actinide: 'actinide',
};

const PERIOD_START = [1, 3, 11, 19, 37, 55, 87, 119];
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

function position(z) {
  const period = PERIOD_START.findIndex((s, i) => z >= s && z < PERIOD_START[i + 1]) + 1;
  const o = z - PERIOD_START[period - 1];
  let group = null;
  let row = period;
  let col;
  if (period === 1) group = z === 1 ? 1 : 18;
  else if (period <= 3) group = o < 2 ? o + 1 : o + 11;
  else if (period <= 5) group = o + 1;
  else if (o < 2) group = o + 1;
  else if (o <= 16) {
    // f-block: La–Lu and Ac–Lr sit in the two detached rows under the table.
    row = period === 6 ? 9 : 10;
    col = o + 1; // La / Ac at column 3
  } else group = o - 13;
  if (group !== null) col = group;
  let block;
  if (row >= 9) block = 'f';
  else if (group <= 2 || z === 2) block = 's';
  else if (group <= 12) block = 'd';
  else block = 'p';
  return { period, group, row, col, block };
}

const num = (v) => (v === '' || v === undefined ? null : Number(v));
const superscript = (s) => s.replace(/([spdf])(\d+)/g, (_, l, n) => l + [...n].map((d) => SUP[d]).join(''));

const elements = rows.map((r) => {
  const z = Number(r.AtomicNumber);
  const predictedConfig = r.ElectronConfiguration.includes('(predicted)');
  const state = r.StandardState.replace('Expected to be a ', '');
  const c = content[String(z)];
  return {
    number: z,
    symbol: r.Symbol,
    name: r.Name,
    mass: Number(Number(r.AtomicWeight).toPrecision(z > 103 ? 3 : 6)),
    category: CATEGORY[r.GroupBlock],
    ...position(z),
    state,
    statePredicted: r.StandardState.startsWith('Expected'),
    config: superscript(r.ElectronConfiguration.replace(' (predicted)', '').replace(/\]\s*/, '] ')),
    configPredicted: predictedConfig,
    electronegativity: num(r.Electronegativity),
    radius: num(r.AtomicRadius),
    ionization: num(r.IonizationEnergy),
    affinity: num(r.ElectronAffinity),
    oxidation: r.OxidationStates || null,
    melt: num(r.MeltingPoint),
    boil: num(r.BoilingPoint),
    density: num(r.Density),
    year: r.YearDiscovered === 'Ancient' ? null : num(r.YearDiscovered),
    ancient: r.YearDiscovered === 'Ancient',
    summary: c?.summary ?? null,
    uses: c?.uses ?? [],
    fact: c?.fact ?? null,
    discoveredBy: discovery[String(z)]?.discoveredBy ?? null,
    stableIsotopes: discovery[String(z)]?.stableIsotopes ?? null,
  };
});

writeFileSync(join(root, 'src/data/elements.json'), JSON.stringify(elements, null, 1) + '\n');
const missing = elements.filter((e) => !e.summary).length;
console.log(`Wrote ${elements.length} elements (${missing} without learning content).`);
