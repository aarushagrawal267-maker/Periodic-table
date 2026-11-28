import { ELEMENTS, type Element } from './elements';

export interface Region {
  id: string;
  name: string;
  tagline: string;
  /** Short label used on chips and badges. */
  short: string;
  accent: string;
  numbers: number[];
}

const pick = (f: (e: Element) => boolean) => ELEMENTS.filter(f).map((e) => e.number);

export const REGIONS: Region[] = [
  {
    id: 'first-20',
    name: 'The First Twenty',
    tagline: 'Hydrogen to calcium — the elements every chemist knows by heart.',
    short: '1–20',
    accent: 'var(--cat-nonmetal)',
    numbers: pick((e) => e.number <= 20),
  },
  {
    id: 's-block',
    name: 'Reactive Metals',
    tagline: 'The s-block: alkali and alkaline earth metals, plus hydrogen and helium.',
    short: 's-block',
    accent: 'var(--cat-alkali-metal)',
    numbers: pick((e) => e.block === 's'),
  },
  {
    id: 'p-block',
    name: 'Right-Hand Side',
    tagline: 'The p-block: metalloids, halogens, noble gases and their neighbours.',
    short: 'p-block',
    accent: 'var(--cat-halogen)',
    numbers: pick((e) => e.block === 'p'),
  },
  {
    id: 'd-light',
    name: 'Transition Metals I',
    tagline: 'Periods 4 and 5 of the d-block, from scandium to cadmium.',
    short: 'd-block I',
    accent: 'var(--cat-transition-metal)',
    numbers: pick((e) => e.block === 'd' && e.period <= 5),
  },
  {
    id: 'd-heavy',
    name: 'Transition Metals II',
    tagline: 'Periods 6 and 7 of the d-block — precious metals and superheavies.',
    short: 'd-block II',
    accent: 'var(--cat-post-transition-metal)',
    numbers: pick((e) => e.block === 'd' && e.period >= 6),
  },
  {
    id: 'f-block',
    name: 'Lanthanides & Actinides',
    tagline: 'The two detached rows: rare earths and radioactive heavyweights.',
    short: 'f-block',
    accent: 'var(--cat-lanthanide)',
    numbers: pick((e) => e.block === 'f'),
  },
  {
    id: 'full',
    name: 'The Full Table',
    tagline: 'All 118 elements. The ultimate test.',
    short: 'All 118',
    accent: 'var(--ink-3)',
    numbers: ELEMENTS.map((e) => e.number),
  },
];

export const regionById = (id: string) => REGIONS.find((r) => r.id === id);
