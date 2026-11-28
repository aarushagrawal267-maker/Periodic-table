import { Balloon, Bone, Cog, Coins, CookingPot, Cpu, Feather, Flame, Gem, Magnet, Microscope, Radiation, WavesLadder, type LucideIcon } from 'lucide-react';
import { ELEMENTS, bySymbol } from './elements';

export interface Chapter {
  id: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
  numbers: number[];
  /** Memory trick: each word paired with the symbol it stands for, in table order. */
  mnemonic?: [string, string][];
}

const sym = (...s: string[]) => s.map((x) => bySymbol.get(x.toLowerCase())!.number);

export const CHAPTERS: Chapter[] = [
  {
    id: 'lightest-ten',
    title: 'The Lightest Ten',
    blurb: 'Hydrogen to neon: the building blocks of stars, air, water and life.',
    icon: Feather,
    numbers: sym('H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne'),
    mnemonic: [['Happy', 'H'], ['Hens', 'He'], ['Lay', 'Li'], ['Beautiful', 'Be'], ['Brown', 'B'], ['Chicken', 'C'], ['Nuggets', 'N'], ['On', 'O'], ['Fridays,', 'F'], ['Naturally', 'Ne']],
  },
  {
    id: 'next-ten',
    title: 'The Next Ten',
    blurb: 'Sodium to calcium: salt, sand, bones and the metals in your kitchen.',
    icon: CookingPot,
    numbers: sym('Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca'),
    mnemonic: [['Naughty', 'Na'], ['Magpies', 'Mg'], ['Always', 'Al'], ['Sing', 'Si'], ['Pretty', 'P'], ['Songs,', 'S'], ['Clearly', 'Cl'], ['Arguing,', 'Ar'], ['Keeping', 'K'], ['Calm', 'Ca']],
  },
  {
    id: 'alkali',
    title: 'Explosive Alkali Metals',
    blurb: 'Group 1: soft metals so reactive they fizz, burn, and even explode in water.',
    icon: Flame,
    numbers: sym('Li', 'Na', 'K', 'Rb', 'Cs', 'Fr'),
    mnemonic: [['Little', 'Li'], ['Naughty', 'Na'], ['Kids', 'K'], ['Rub', 'Rb'], ["Cats'", 'Cs'], ['Fur', 'Fr']],
  },
  {
    id: 'alkaline-earth',
    title: 'Alkaline Earth Metals',
    blurb: 'Group 2: the metals in your bones, chalk, and the colours of fireworks.',
    icon: Bone,
    numbers: sym('Be', 'Mg', 'Ca', 'Sr', 'Ba', 'Ra'),
    mnemonic: [['Bears', 'Be'], ['Might', 'Mg'], ['Catch', 'Ca'], ['Strawberries,', 'Sr'], ['Bananas,', 'Ba'], ['Raspberries', 'Ra']],
  },
  {
    id: 'halogens',
    title: 'The Halogens',
    blurb: 'Group 17: fierce nonmetals that clean pools, protect teeth and make salt.',
    icon: WavesLadder,
    numbers: sym('F', 'Cl', 'Br', 'I', 'At', 'Ts'),
    mnemonic: [['Funny', 'F'], ['Clowns', 'Cl'], ['Bring', 'Br'], ['Ice cream', 'I'], ['At', 'At'], ['Tea', 'Ts']],
  },
  {
    id: 'noble',
    title: 'The Noble Gases',
    blurb: "Group 18: the calm ones. They glow in signs and float balloons, but rarely react.",
    icon: Balloon,
    numbers: sym('He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn', 'Og'),
    mnemonic: [['Helpful', 'He'], ['Neighbours', 'Ne'], ['Are', 'Ar'], ['Kind,', 'Kr'], ['eXtremely', 'Xe'], ['Rarely', 'Rn'], ['Obnoxious', 'Og']],
  },
  {
    id: 'everyday-metals',
    title: 'Metals You Can Touch',
    blurb: 'Iron, copper, silver, gold and friends: the metals in coins, wires and jewellery.',
    icon: Coins,
    numbers: sym('Ti', 'Cr', 'Fe', 'Ni', 'Cu', 'Zn', 'Ag', 'Sn', 'Pt', 'Au', 'Hg', 'Pb'),
  },
  {
    id: 'transition-row',
    title: 'Row 4 Transition Metals',
    blurb: 'Scandium to zinc: ten metals that build engines, magnets and batteries.',
    icon: Cog,
    numbers: sym('Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn'),
    mnemonic: [['Scientists', 'Sc'], ['Take', 'Ti'], ['Very', 'V'], ['Careful', 'Cr'], ['Measurements', 'Mn'], ['For', 'Fe'], ['Cool', 'Co'], ['New', 'Ni'], ['Cures', 'Cu'], ['Zealously', 'Zn']],
  },
  {
    id: 'metalloids',
    title: 'The In-Betweeners',
    blurb: 'Metalloids: part metal, part nonmetal, and the reason computer chips exist.',
    icon: Cpu,
    numbers: sym('B', 'Si', 'Ge', 'As', 'Sb', 'Te'),
  },
  {
    id: 'precious',
    title: 'Heavy & Precious',
    blurb: 'Period 6 metals: the densest, rarest and shiniest elements on Earth.',
    icon: Gem,
    numbers: sym('W', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Pb', 'Bi'),
  },
  {
    id: 'lanthanides',
    title: 'The Rare Earths',
    blurb: "Lanthanides: the hidden helpers inside phone speakers, screens and wind turbines.",
    icon: Magnet,
    numbers: ELEMENTS.filter((e) => e.category === 'lanthanide').map((e) => e.number),
  },
  {
    id: 'actinides',
    title: 'The Actinides',
    blurb: 'Uranium, plutonium and the radioactive row that powers reactors.',
    icon: Radiation,
    numbers: ELEMENTS.filter((e) => e.category === 'actinide').map((e) => e.number),
  },
  {
    id: 'superheavy',
    title: 'Made in the Lab',
    blurb: 'Elements 104 to 118: created atom by atom, named after scientists and places.',
    icon: Microscope,
    numbers: ELEMENTS.filter((e) => e.number >= 104).map((e) => e.number),
  },
];

export const chapterById = (id: string) => CHAPTERS.find((c) => c.id === id);
