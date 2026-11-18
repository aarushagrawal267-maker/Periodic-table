import { bySymbol, type Element } from './elements';
import { sample, shuffle } from './random';

export interface Thing {
  id: string;
  name: string;
  emoji: string;
  /** Each element inside, with a one-line reason a student can remember. */
  contains: [string, string][];
}

/** Everyday objects and the key elements that make them work. Deliberately simplified, never wrong. */
export const THINGS: Thing[] = [
  { id: 'salt', name: 'Table salt', emoji: '🧂', contains: [['Na', 'Salt is sodium chloride: one sodium for every chlorine.'], ['Cl', 'The chlorine half of sodium chloride.']] },
  { id: 'water', name: 'A glass of water', emoji: '💧', contains: [['H', 'Two hydrogen atoms in every water molecule…'], ['O', '…joined to one oxygen atom. H₂O.']] },
  { id: 'phone', name: 'Smartphone', emoji: '📱', contains: [['Li', 'The battery is lithium-ion.'], ['Si', 'The processor chips are made from silicon.'], ['Cu', 'Copper wiring carries the electricity.'], ['In', 'Indium tin oxide makes the touchscreen respond to your finger.']] },
  { id: 'fireworks', name: 'Fireworks', emoji: '🎆', contains: [['Sr', 'Strontium salts burn bright red.'], ['Ba', 'Barium salts give green.'], ['Cu', 'Copper compounds make blue.'], ['Na', 'Sodium glows yellow-orange.']] },
  { id: 'balloon', name: 'Floating party balloon', emoji: '🎈', contains: [['He', 'Helium is lighter than air, so the balloon floats.']] },
  { id: 'neon-sign', name: 'Glowing red sign', emoji: '🪧', contains: [['Ne', 'Neon gas glows red-orange when electricity passes through it.']] },
  { id: 'bones', name: 'Your bones', emoji: '🦴', contains: [['Ca', 'Bones are mostly calcium phosphate.'], ['P', 'Phosphorus is the other key part of bone mineral.']] },
  { id: 'blood', name: 'Your blood', emoji: '🩸', contains: [['Fe', 'Iron in haemoglobin carries oxygen around your body.'], ['O', 'Oxygen is what the iron carries.']] },
  { id: 'air', name: 'The air you breathe', emoji: '🌬️', contains: [['N', 'About 78% of air is nitrogen.'], ['O', 'About 21% is oxygen.'], ['Ar', 'Almost 1% is argon, a noble gas.']] },
  { id: 'toothpaste', name: 'Toothpaste', emoji: '🪥', contains: [['F', 'Fluoride strengthens tooth enamel.']] },
  { id: 'banana', name: 'Banana', emoji: '🍌', contains: [['K', 'Bananas are famous for their potassium.']] },
  { id: 'pencil', name: 'Pencil "lead"', emoji: '✏️', contains: [['C', "It isn't lead at all: it's graphite, a form of carbon."]] },
  { id: 'diamond', name: 'Diamond', emoji: '💎', contains: [['C', 'Diamond is pure carbon, arranged in a super-strong crystal.']] },
  { id: 'foil', name: 'Kitchen foil', emoji: '🥡', contains: [['Al', 'Thin, light and rust-free aluminium.']] },
  { id: 'bulb', name: 'Old-style light bulb', emoji: '💡', contains: [['W', 'The glowing wire is tungsten, which survives huge heat.']] },
  { id: 'battery', name: 'AA alkaline battery', emoji: '🔋', contains: [['Zn', 'Zinc gives up electrons at one end…'], ['Mn', '…and manganese dioxide takes them at the other.']] },
  { id: 'pool', name: 'Swimming pool', emoji: '🏊', contains: [['Cl', 'Chlorine compounds kill germs in the water.']] },
  { id: 'window', name: 'Window glass', emoji: '🪟', contains: [['Si', 'Glass is mostly silica: silicon…'], ['O', '…bonded with oxygen.'], ['Na', 'Sodium compounds are added so the sand melts at a lower temperature.']] },
  { id: 'smoke-alarm', name: 'Smoke detector', emoji: '🚨', contains: [['Am', 'Many detectors hold a tiny speck of americium, a radioactive element that helps sense smoke.']] },
  { id: 'jewellery', name: 'Jewellery', emoji: '💍', contains: [['Au', 'Gold never tarnishes.'], ['Ag', 'Silver reflects light better than any other metal.'], ['Pt', 'Platinum is rare, heavy and hard-wearing.']] },
  { id: 'solar', name: 'Solar panel', emoji: '🔆', contains: [['Si', 'Silicon cells turn sunlight into electricity.']] },
  { id: 'sun', name: 'The Sun', emoji: '☀️', contains: [['H', 'Mostly hydrogen, fusing into…'], ['He', '…helium, releasing the energy we feel as sunlight.']] },
  { id: 'steel', name: 'Stainless steel spoon', emoji: '🥄', contains: [['Fe', 'Steel is mostly iron.'], ['Cr', 'Chromium makes it stainless.'], ['Ni', 'Nickel adds shine and toughness.']] },
  { id: 'milk', name: 'Milk', emoji: '🥛', contains: [['Ca', 'Milk is a top source of calcium for bones and teeth.']] },
  { id: 'magnet', name: 'Super-strong fridge magnet', emoji: '🧲', contains: [['Nd', 'Neodymium magnets are the strongest permanent magnets.'], ['Fe', 'They are neodymium-iron-boron alloys…'], ['B', '…with a little boron.']] },
  { id: 'catalytic', name: "Car's catalytic converter", emoji: '🚗', contains: [['Pt', 'Platinum helps turn toxic exhaust gases into safer ones…'], ['Pd', '…palladium does the same job…'], ['Rh', '…and rhodium breaks down harmful nitrogen oxides.']] },
  { id: 'sunscreen', name: 'Mineral sunscreen', emoji: '🧴', contains: [['Zn', 'Zinc oxide sits on your skin and blocks UV light.'], ['Ti', 'Titanium dioxide does the same and keeps it white.']] },
  { id: 'chalk', name: 'Blackboard chalk', emoji: '🖍️', contains: [['Ca', 'Chalk is a calcium compound, usually calcium carbonate or calcium sulfate.']] },
  { id: 'bleach', name: 'Household bleach', emoji: '🫧', contains: [['Cl', 'The active ingredient is sodium hypochlorite: chlorine does the cleaning…'], ['Na', '…with sodium as its partner.']] },
  { id: 'matches', name: 'Safety matches', emoji: '🔥', contains: [['P', 'Red phosphorus on the striking strip sparks the reaction.'], ['K', 'Potassium chlorate in the head supplies oxygen…'], ['S', '…and sulfur helps it catch fire.']] },
  { id: 'liberty', name: 'Statue of Liberty', emoji: '🗽', contains: [['Cu', 'Her skin is copper. The green colour is a coating that formed as copper reacted with air and rain.']] },
  { id: 'nuclear', name: 'Nuclear power station', emoji: '⚛️', contains: [['U', 'Uranium atoms split apart, releasing heat that boils water to drive turbines.']] },
  { id: 'plane', name: 'Aeroplane', emoji: '✈️', contains: [['Al', 'Light aluminium alloys make up much of the body…'], ['Ti', '…and strong, heat-resistant titanium is used in engines and frames.']] },
  { id: 'leaf', name: 'A green leaf', emoji: '🌿', contains: [['Mg', 'A magnesium atom sits at the centre of every chlorophyll molecule, the green pigment that captures sunlight.']] },
  { id: 'medal', name: 'Olympic "gold" medal', emoji: '🥇', contains: [['Ag', "Surprise: it's mostly silver…"], ['Au', '…with a thin plating of real gold on the outside.']] },
  { id: 'xray', name: 'Barium meal X-ray', emoji: '🩻', contains: [['Ba', 'Patients drink barium sulfate, which shows up white on X-rays and outlines the gut.']] },
  { id: 'rust', name: 'Rust on a bike', emoji: '🚲', contains: [['Fe', 'Rust forms when iron…'], ['O', '…reacts with oxygen and water.']] },
  { id: 'hot-spring', name: 'Rotten-egg smell at a hot spring', emoji: '♨️', contains: [['S', 'The smell is hydrogen sulfide, made of sulfur…'], ['H', '…and hydrogen.']] },
  { id: 'soda', name: 'Can of fizzy drink', emoji: '🥤', contains: [['Al', 'The can is aluminium.'], ['C', 'The bubbles are carbon dioxide: carbon…'], ['O', '…and oxygen.']] },
  { id: 'thermometer', name: 'Old glass thermometer', emoji: '🌡️', contains: [['Hg', 'The silvery liquid is mercury, which expands evenly as it warms.']] },
];

/** Plausible wrong answers, so options are never obviously silly. */
const DECOYS = ['H', 'Pd', 'Ba', 'Mn', 'Cr', 'W', 'He', 'C', 'N', 'O', 'Na', 'Mg', 'Al', 'Si', 'S', 'Cl', 'K', 'Ca', 'Fe', 'Cu', 'Zn', 'Ag', 'Au', 'Pb', 'Ne', 'Ar', 'Li', 'Ti', 'Ni', 'Sn', 'U', 'I', 'P', 'Hg', 'Pt'];

export const el = (s: string): Element => bySymbol.get(s.toLowerCase())!;

export interface LifeQuestion {
  thing: Thing;
  options: Element[];
  answer: Set<number>;
}

export const LIFE_LENGTH = 6;
export const LIFE_OPTIONS = 8;

export function buildLifeRound(): LifeQuestion[] {
  return sample(THINGS, LIFE_LENGTH).map((thing) => {
    const right = thing.contains.map(([s]) => el(s));
    const text = thing.contains.map(([, why]) => why.toLowerCase()).join(' ');
    const wrong = sample(
      DECOYS.filter((d) => !thing.contains.some(([s]) => s === d) && !text.includes(el(d).name.toLowerCase())),
      LIFE_OPTIONS - right.length,
    ).map(el);
    return { thing, options: shuffle([...right, ...wrong]), answer: new Set(right.map((e) => e.number)) };
  });
}
