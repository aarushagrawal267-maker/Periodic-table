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

/** Weighted pick that favours elements the player hasn't mastered yet. */
function pickTargets(d: Difficulty, mastery: Record<number, Mastery>, n: number) {
  const items = pool(d).map((e) => {
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

function distractors(e: Element, from: Element[], n = 3) {
  // Prefer look-alikes: same category or nearby atomic number.
  const near = from.filter((x) => x.number !== e.number && (x.category === e.category || Math.abs(x.number - e.number) <= 4));
  const picks = sample(near, n);
  if (picks.length < n) picks.push(...sample(from.filter((x) => x.number !== e.number && !picks.includes(x)), n - picks.length));
  return picks;
}

function build(kind: Question['kind'], e: Element, all: Element[]): Question | null {
  const opts = (right: string, wrong: string[]) => {
    const options = shuffle([right, ...wrong]);
    return { options, answer: options.indexOf(right) };
  };
  const id = `${kind}-${e.number}`;
  switch (kind) {
    case 'symbol':
      return { id, kind, element: e.number, hero: e.symbol, prompt: 'Which element has this symbol?', ...opts(e.name, distractors(e, all).map((x) => x.name)) };
    case 'name': {
      // Symbol distractors that share a first letter are the real test.
      const same = all.filter((x) => x.number !== e.number && x.symbol[0] === e.symbol[0]);
      const wrong = sample(same, 3);
      if (wrong.length < 3) wrong.push(...distractors(e, all.filter((x) => !wrong.includes(x)), 3 - wrong.length));
      return { id, kind, element: e.number, prompt: `What is the symbol for ${e.name}?`, ...opts(e.symbol, wrong.map((x) => x.symbol)) };
    }
    case 'number': {
      const near = all.filter((x) => x.number !== e.number && Math.abs(x.number - e.number) <= 3);
      const wrong = sample(near, 3);
      if (wrong.length < 3) wrong.push(...distractors(e, all, 3 - wrong.length));
      return { id, kind, element: e.number, hero: String(e.number), prompt: 'Which element has this atomic number?', ...opts(e.name, wrong.map((x) => x.name)) };
    }
    case 'category': {
      const wrong = sample(CATEGORIES.filter((c) => c.id !== e.category), 3).map((c) => c.label);
      return { id, kind, element: e.number, hero: e.symbol, prompt: `What kind of element is ${e.name}?`, ...opts(categoryLabel(e.category), wrong) };
    }
    case 'extreme': {
      const group = [e, ...distractors(e, all.filter((x) => x.electronegativity !== null))].filter((x) => x.electronegativity !== null);
      if (group.length < 4 || e.electronegativity === null) return null;
      const values = group.map((x) => x.electronegativity!);
      if (new Set(values).size < 4) return null;
      const top = group[values.indexOf(Math.max(...values))];
      return { id: `extreme-${top.number}-${e.number}`, kind, element: top.number, prompt: 'Which of these is the most electronegative?', ...opts(top.name, group.filter((x) => x !== top).map((x) => x.name)) };
    }
    case 'fact': {
      if (!e.fact) return null;
      const re = new RegExp(`\\b(${e.name}|${e.symbol})\\b`, 'gi');
      const clue = e.fact.replace(re, '▢▢▢');
      return { id, kind, element: e.number, prompt: clue, ...opts(e.name, distractors(e, all).map((x) => x.name)) };
    }
  }
}

export function buildQuiz(d: Difficulty, mastery: Record<number, Mastery>): Question[] {
  const all = pool(d);
  const kinds: Question['kind'][] =
    d === 'learner'
      ? ['symbol', 'name', 'symbol', 'category', 'fact', 'name', 'number', 'symbol', 'fact', 'category']
      : ['symbol', 'name', 'number', 'category', 'fact', 'extreme', 'name', 'symbol', 'fact', 'number'];
  const targets = pickTargets(d, mastery, QUIZ_LENGTH * 2);
  const qs: Question[] = [];
  const used = new Set<string>();
  let t = 0;
  for (const kind of shuffle(kinds)) {
    while (t < targets.length) {
      const q = build(kind, targets[t++], all) ?? build('symbol', targets[t - 1], all)!;
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
