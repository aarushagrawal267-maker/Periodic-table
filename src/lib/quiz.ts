import { CATEGORIES, ELEMENTS, byNumber, categoryLabel, type Element } from './elements';
import { sample, shuffle } from './random';
import type { Difficulty } from '../store/settings';
import type { Mastery } from '../store/progress';

export interface Question {
  id: string;
  kind: 'symbol' | 'name' | 'number' | 'category' | 'extreme' | 'fact';
  prompt: string;
  /** Large visual shown above the prompt (a symbol, number, or nothing). */
  hero?: string;
  options: string[];
  answer: number;
  /** Element the question is about; drives mastery. */
  element: number;
}

export const QUIZ_LENGTH = 10;
export const QUESTION_MS = 15000;

const WELL_KNOWN = [47, 50, 53, 78, 79, 80, 82, 92, 94, 74, 54, 55, 56];

function pool(d: Difficulty) {
  if (d === 'learner') return ELEMENTS.filter((e) => e.number <= 36 || WELL_KNOWN.includes(e.number));
  if (d === 'standard') return ELEMENTS.filter((e) => e.number <= 86 || e.number === 92 || e.number === 94);
  return ELEMENTS;
}

/** Brand-new players are quizzed on the first chapters only. */
const START: Record<Difficulty, number> = { learner: 20, standard: 20, expert: 36 };
/** How far past the furthest element they have met a quiz may reach. */
export const QUIZ_STRETCH = 5;

/**
 * The elements a quiz may ask about: everything the player has met (has a
 * mastery record for), plus a small stretch just beyond the furthest one.
 * Never smaller than a new player's pool and never outside the difficulty pool.
 */
export function quizPool(d: Difficulty, mastery: Record<number, Mastery>): Element[] {
  const all = pool(d);
  const met = all.filter((e) => mastery[e.number]);
  const keep = new Set(met.map((e) => e.number));
  if (met.length) {
    const top = met[met.length - 1].number;
    for (const e of all.filter((x) => x.number > top).slice(0, QUIZ_STRETCH)) keep.add(e.number);
  }
  for (const e of all) {
    if (keep.size >= START[d]) break;
    keep.add(e.number);
  }
  return all.filter((e) => keep.has(e.number));
}

/** Weighted pick that favours elements the player hasn't mastered yet. */
function pickTargets(from: Element[], mastery: Record<number, Mastery>, n: number) {
  const items = from.map((e) => {
    const m = mastery[e.number];
    return { e, w: m ? 1 + (5 - m.s) * 2 : 3 };
  });
  const out: Element[] = [];
  while (out.length < n && items.length) {
    const total = items.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    const i = items.findIndex((x) => (r -= x.w) <= 0);
    out.push(items.splice(i < 0 ? 0 : i, 1)[0].e);
  }
  return out;
}

/** Pick n wrong answers for e, trying each list in turn (most preferred first). */
function pickWrong(e: Element, n: number, ...lists: Element[][]) {
  const picks: Element[] = [];
  for (const list of lists) {
    if (picks.length >= n) break;
    picks.push(...sample(list.filter((x) => x.number !== e.number && !picks.includes(x)), n - picks.length));
  }
  return picks;
}

const looksLike = (e: Element) => (x: Element) => x.category === e.category || Math.abs(x.number - e.number) <= 4;

/** Wrong answers that look like e, drawn from familiar elements first so they are plausible, not obscure. */
function distractors(e: Element, known: Element[], all: Element[], n = 3) {
  return pickWrong(e, n, known.filter(looksLike(e)), known, all.filter(looksLike(e)), all);
}

function build(kind: Question['kind'], e: Element, known: Element[], all: Element[]): Question | null {
  const opts = (right: string, wrong: string[]) => {
    const options = shuffle([right, ...wrong]);
    return { options, answer: options.indexOf(right) };
  };
  const id = `${kind}-${e.number}`;
  switch (kind) {
    case 'symbol':
      return { id, kind, element: e.number, hero: e.symbol, prompt: 'Which element has this symbol?', ...opts(e.name, distractors(e, known, all).map((x) => x.name)) };
    case 'name': {
      // Symbol distractors that share a first letter are the real test.
      const same = (x: Element) => x.symbol[0] === e.symbol[0];
      const wrong = pickWrong(e, 3, known.filter(same), known.filter(looksLike(e)), known, all);
      return { id, kind, element: e.number, prompt: `What is the symbol for ${e.name}?`, ...opts(e.symbol, wrong.map((x) => x.symbol)) };
    }
    case 'number': {
      const near = (x: Element) => Math.abs(x.number - e.number) <= 3;
      const wrong = pickWrong(e, 3, known.filter(near), known.filter(looksLike(e)), known, all);
      return { id, kind, element: e.number, hero: String(e.number), prompt: 'Which element has this atomic number?', ...opts(e.name, wrong.map((x) => x.name)) };
    }
    case 'category': {
      // Prefer kinds of element the player has actually seen.
      const seen = new Set(known.map((x) => x.category));
      const others = CATEGORIES.filter((c) => c.id !== e.category);
      const wrong = sample(others.filter((c) => seen.has(c.id)), 3);
      if (wrong.length < 3) wrong.push(...sample(others.filter((c) => !wrong.includes(c)), 3 - wrong.length));
      return { id, kind, element: e.number, hero: e.symbol, prompt: `What kind of element is ${e.name}?`, ...opts(categoryLabel(e.category), wrong.map((c) => c.label)) };
    }
    case 'extreme': {
      if (e.electronegativity === null) return null;
      const hasEn = (x: Element) => x.electronegativity !== null;
      // A few tries to find four familiar elements with clearly different values.
      for (let attempt = 0; attempt < 6; attempt++) {
        const group = [e, ...distractors(e, known.filter(hasEn), all.filter(hasEn))];
        const values = group.map((x) => x.electronegativity!);
        if (group.length < 4 || new Set(values).size < 4) continue;
        const top = group[values.indexOf(Math.max(...values))];
        return { id: `extreme-${top.number}-${e.number}`, kind, element: top.number, prompt: 'Which of these is the most electronegative?', ...opts(top.name, group.filter((x) => x !== top).map((x) => x.name)) };
      }
      return null;
    }
    case 'fact': {
      if (!e.fact) return null;
      // Mask the name and words built on it (sulfide, zirconia, actinides), and the symbol only in its exact case.
      const stem = e.name.length >= 6 ? `${e.name.slice(0, Math.max(4, e.name.length - 3))}\\w*` : `${e.name}\\b`;
      const clue = e.fact.replace(new RegExp(`\\b${stem}`, 'gi'), '▢▢▢').replace(new RegExp(`\\b${e.symbol}\\b`, 'g'), '▢▢▢');
      return { id, kind, element: e.number, prompt: clue, ...opts(e.name, distractors(e, known, all).map((x) => x.name)) };
    }
  }
}

/** Question mix per difficulty. Electronegativity ('extreme') is an expert-only skill. */
const KINDS: Record<Difficulty, Question['kind'][]> = {
  learner: ['symbol', 'name', 'symbol', 'category', 'fact', 'name', 'number', 'symbol', 'fact', 'category'],
  standard: ['symbol', 'name', 'number', 'category', 'fact', 'symbol', 'name', 'category', 'fact', 'number'],
  expert: ['symbol', 'name', 'number', 'category', 'fact', 'extreme', 'name', 'symbol', 'fact', 'number'],
};

export function buildQuiz(d: Difficulty, mastery: Record<number, Mastery>): Question[] {
  const all = pool(d);
  const known = quizPool(d, mastery);
  const targets = pickTargets(known, mastery, QUIZ_LENGTH * 2);
  const qs: Question[] = [];
  const used = new Set<string>();
  let t = 0;
  for (const kind of shuffle(KINDS[d])) {
    while (t < targets.length) {
      const e = targets[t++];
      const q = build(kind, e, known, all) ?? build('symbol', e, known, all)!;
      if (!used.has(q.id)) {
        used.add(q.id);
        qs.push(q);
        break;
      }
    }
  }
  return qs.slice(0, QUIZ_LENGTH);
}

export const elementOf = (q: Question) => byNumber(q.element);
