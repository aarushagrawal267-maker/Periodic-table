import { ELEMENTS, type Element } from './elements';

export interface Region {
  id: string;
  name: string;
  tagline: string;
  /** Short label used on chips and badges. */
  short: string;
  numbers: number[];
}

const pick = (f: (e: Element) => boolean) => ELEMENTS.filter(f).map((e) => e.number);

export const REGIONS: Region[] = [
  {
    id: 'first-20',
    name: 'The first twenty',
    tagline: 'Hydrogen to calcium: the elements every chemist knows by heart',
    short: '1–20',
    numbers: pick((e) => e.number <= 20),
  },
  {
    id: 's-block',
    name: 'Reactive metals',
    tagline: 'The s-block: alkali and alkaline earth metals, plus hydrogen and helium',
    short: 's-block',
    numbers: pick((e) => e.block === 's'),
  },
  {
    id: 'p-block',
    name: 'Right-hand side',
    tagline: 'The p-block: metalloids, halogens, noble gases and their neighbours',
    short: 'p-block',
    numbers: pick((e) => e.block === 'p'),
  },
  {
    id: 'd-light',
    name: 'Transition metals I',
    tagline: 'Periods 4 and 5 of the d-block, from scandium to cadmium',
    short: 'd-block I',
    numbers: pick((e) => e.block === 'd' && e.period <= 5),
  },
  {
    id: 'd-heavy',
    name: 'Transition metals II',
    tagline: 'Periods 6 and 7 of the d-block: precious metals and superheavies',
    short: 'd-block II',
    numbers: pick((e) => e.block === 'd' && e.period >= 6),
  },
  {
    id: 'f-block',
    name: 'Lanthanides and actinides',
    tagline: 'The two detached rows: rare earths and radioactive heavyweights',
    short: 'f-block',
    numbers: pick((e) => e.block === 'f'),
  },
  {
    id: 'full',
    name: 'The full table',
    tagline: 'All 118 elements in one round',
    short: 'All 118',
    numbers: ELEMENTS.map((e) => e.number),
  },
];

export const regionById = (id: string) => REGIONS.find((r) => r.id === id);
