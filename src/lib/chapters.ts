import { ELEMENTS, bySymbol } from './elements';

export interface Chapter {
  id: string;
  title: string;
  blurb: string;
  numbers: number[];
  /** Memory trick: each word paired with the symbol it stands for, in table order. */
  mnemonic?: [string, string][];
}

const sym = (...s: string[]) => s.map((x) => bySymbol.get(x.toLowerCase())!.number);

export const CHAPTERS: Chapter[] = [
  {
    id: 'lightest-ten',
    title: 'The lightest ten',
    blurb: 'Hydrogen to neon: the building blocks of stars, air, water and life.',
    numbers: sym('H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne'),
    mnemonic: [['Happy', 'H'], ['Hens', 'He'], ['Lay', 'Li'], ['Beautiful', 'Be'], ['Brown', 'B'], ['Chicken', 'C'], ['Nuggets', 'N'], ['On', 'O'], ['Fridays,', 'F'], ['Naturally', 'Ne']],
  },
  {
    id: 'next-ten',
    title: 'The next ten',
    blurb: 'Sodium to calcium: salt, sand, bones and the metals in your kitchen.',
    numbers: sym('Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca'),
    mnemonic: [['Naughty', 'Na'], ['Magpies', 'Mg'], ['Always', 'Al'], ['Sing', 'Si'], ['Pretty', 'P'], ['Songs,', 'S'], ['Clearly', 'Cl'], ['Arguing,', 'Ar'], ['Keeping', 'K'], ['Calm', 'Ca']],
  },
  {
    id: 'alkali',
    title: 'Explosive alkali metals',
    blurb: 'Group 1: soft metals so reactive they fizz, burn, and even explode in water.',
    numbers: sym('Li', 'Na', 'K', 'Rb', 'Cs', 'Fr'),
    mnemonic: [['Little', 'Li'], ['Naughty', 'Na'], ['Kids', 'K'], ['Rub', 'Rb'], ["Cats'", 'Cs'], ['Fur', 'Fr']],
  },
  {
    id: 'alkaline-earth',
    title: 'Alkaline earth metals',
    blurb: 'Group 2: the metals in your bones, chalk, and the colours of fireworks.',
    numbers: sym('Be', 'Mg', 'Ca', 'Sr', 'Ba', 'Ra'),
    mnemonic: [['Bears', 'Be'], ['Might', 'Mg'], ['Catch', 'Ca'], ['Strawberries,', 'Sr'], ['Bananas,', 'Ba'], ['Raspberries', 'Ra']],
  },
  {
    id: 'halogens',
    title: 'The halogens',
    blurb: 'Group 17: fierce nonmetals that clean pools, protect teeth and make salt.',
    numbers: sym('F', 'Cl', 'Br', 'I', 'At', 'Ts'),
    mnemonic: [['Funny', 'F'], ['Clowns', 'Cl'], ['Bring', 'Br'], ['Ice cream', 'I'], ['At', 'At'], ['Tea', 'Ts']],
  },
  {
    id: 'noble',
    title: 'The noble gases',
    blurb: "Group 18: the calm ones. They glow in signs and float balloons, but rarely react.",
    numbers: sym('He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn', 'Og'),
    mnemonic: [['Helpful', 'He'], ['Neighbours', 'Ne'], ['Are', 'Ar'], ['Kind,', 'Kr'], ['eXtremely', 'Xe'], ['Rarely', 'Rn'], ['Obnoxious', 'Og']],
  },
  {
    id: 'everyday-metals',
    title: 'Metals you can touch',
    blurb: 'Iron, copper, silver, gold and friends: the metals in coins, wires and jewellery.',
    numbers: sym('Ti', 'Cr', 'Fe', 'Ni', 'Cu', 'Zn', 'Ag', 'Sn', 'Pt', 'Au', 'Hg', 'Pb'),
  },
  {
    id: 'transition-row',
    title: 'Row 4 transition metals',
    blurb: 'Scandium to zinc: ten metals that build engines, magnets and batteries.',
    numbers: sym('Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn'),
    mnemonic: [['Scientists', 'Sc'], ['Take', 'Ti'], ['Very', 'V'], ['Careful', 'Cr'], ['Measurements', 'Mn'], ['For', 'Fe'], ['Cool', 'Co'], ['New', 'Ni'], ['Cures', 'Cu'], ['Zealously', 'Zn']],
  },
  {
    id: 'metalloids',
    title: 'The in-betweeners',
    blurb: 'Metalloids: part metal, part nonmetal, and the reason computer chips exist.',
    numbers: sym('B', 'Si', 'Ge', 'As', 'Sb', 'Te'),
  },
  {
    id: 'precious',
    title: 'Heavy and precious',
    blurb: 'Period 6 metals: the densest, rarest and shiniest elements on Earth.',
    numbers: sym('W', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Pb', 'Bi'),
  },
  {
    id: 'lanthanides',
    title: 'The rare earths',
    blurb: "Lanthanides: the hidden helpers inside phone speakers, screens and wind turbines.",
    numbers: ELEMENTS.filter((e) => e.category === 'lanthanide').map((e) => e.number),
  },
  {
    id: 'actinides',
    title: 'The actinides',
    blurb: 'Uranium, plutonium and the radioactive row that powers reactors.',
    numbers: ELEMENTS.filter((e) => e.category === 'actinide').map((e) => e.number),
  },
  {
    id: 'superheavy',
    title: 'Made in the lab',
    blurb: 'Elements 104 to 118: created atom by atom, named after scientists and places.',
    numbers: ELEMENTS.filter((e) => e.number >= 104).map((e) => e.number),
  },
];

export const chapterById = (id: string) => CHAPTERS.find((c) => c.id === id);
