// Turns a content spec into a timed plan: what each scene shows, when, and which sounds play.
// Everything here is plain data, so the same spec always gives the same reel.
import { elementForReel, elementInText, formatNumber, toC } from './data.mjs';

export const FPS = 30;
export const MIN_SECONDS = 16;
export const MAX_SECONDS = 30;
const END_CARD = 4.2;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** Seconds a viewer needs to read a line of this many characters (about 18 characters a second, plus a beat). */
const readTime = (chars, lo, hi) => clamp(1.4 + chars * 0.055, lo, hi);
const r2 = (v) => Math.round(v * 100) / 100;

export class SpecError extends Error {}

function need(cond, msg) {
  if (!cond) throw new SpecError(msg);
}

function str(v, name, max) {
  need(typeof v === 'string' && v.trim().length > 0, `${name} must be a non-empty string`);
  need(v.length <= max, `${name} is ${v.length} characters; keep it to ${max} or fewer so it reads on a phone`);
  return v.trim();
}

function atomic(v) {
  need(Number.isInteger(v) && v >= 1 && v <= 118, `atomicNumber must be an integer from 1 to 118 (got ${JSON.stringify(v)})`);
  return v;
}

/** Validate a spec and return the plan the stage renders. */
export function buildPlan(spec) {
  need(spec && typeof spec === 'object', 'Spec must be a JSON object');
  const format = spec.format;
  if (format === 'element-spotlight') return spotlight(spec);
  if (format === 'guess-element') return guess(spec);
  if (format === 'quiz') return quiz(spec);
  throw new SpecError(`Unknown format ${JSON.stringify(format)}. Use element-spotlight, guess-element or quiz.`);
}

// ------------------------------------------------------------ element spotlight

function spotlight(spec) {
  const el = elementForReel(atomic(spec.atomicNumber));
  const hook = spec.hook ? str(spec.hook, 'hook', 70) : `${el.name} in 20 seconds`;
  const uses = el.uses.slice(0, 3);
  const fact = el.fact;
  const stat = spotlightStat(el, hook);

  const t = {};
  t.basics = r2(clamp(2.4 + hook.length * 0.025, 2.6, 3.4));
  t.uses = r2(t.basics + 5.4);
  const usesLen = uses.reduce((a, u) => a + u.length, 0);
  t.fact = uses.length ? r2(t.uses + clamp(1.6 + usesLen * 0.045, 3.4, 5)) : t.uses;
  t.end = r2(t.fact + (fact ? readTime(fact.length, 4.4, 8) : 0));
  t.total = r2(Math.max(MIN_SECONDS, t.end + END_CARD));
  t.end = r2(t.total - END_CARD);

  const cues = [
    { t: 0.0, type: 'whoosh' },
    { t: t.basics, type: 'whoosh' },
    { t: t.basics + 0.15, type: 'pop' },
    { t: t.basics + 1.75, type: 'pop', pitch: 1.5 },
    { t: t.end, type: 'whoosh' },
  ];
  if (uses.length) cues.push({ t: t.uses, type: 'whoosh' }, ...uses.map((_, i) => ({ t: t.uses + 0.15 + i * 0.32, type: 'pop', pitch: 1 + i * 0.12 })));
  if (fact) cues.push({ t: t.fact, type: 'whoosh' });

  return {
    format: 'element-spotlight',
    duration: t.total,
    el,
    hook,
    uses,
    fact,
    stat,
    times: t,
    cues,
    music: { drops: [] },
    coverTime: 0.9,
    keyTimes: [0, 1.0, t.basics + 2.4, uses.length ? t.uses + 1.6 : t.basics + 4, fact ? t.fact + 1.6 : t.end - 0.5, t.end + 1.8].map(r2),
    endShots: [{ kind: 'element', symbol: el.symbol }, { kind: 'explore' }],
  };
}

/**
 * The fourth figure on the basics scene: the one the hook is about, so the reel pays it off with the app's own
 * number (melting point for "melts", density for "floats" or "heavy", and so on). Otherwise the state at 20 °C.
 */
function spotlightStat(el, hook) {
  const h = hook.toLowerCase();
  if (/\bmelt/.test(h) && el.melt != null) return { label: 'Melting point', value: toC(el.melt).replace(' °C', ''), unit: '°C', mono: true };
  if (/\bboil/.test(h) && el.boil != null) return { label: 'Boiling point', value: toC(el.boil).replace(' °C', ''), unit: '°C', mono: true };
  if (/\b(dens|heav|float|sink)/.test(h) && el.density != null) return { label: 'Density', value: formatNumber(el.density), unit: 'g/cm³', mono: true };
  if (/\b(discover|found|ancient|named)/.test(h) && (el.ancient || el.year)) return { label: 'Discovered', value: el.ancient ? 'Ancient' : String(el.year), mono: !el.ancient };
  return { label: 'State at 20 °C', value: el.state, mono: false };
}

// ------------------------------------------------------------ guess the element

function guess(spec) {
  const el = elementForReel(atomic(spec.atomicNumber));
  need(Array.isArray(spec.clues) && spec.clues.length >= 2 && spec.clues.length <= 4, 'clues must be an array of 2 to 4 strings');
  const clues = spec.clues.map((c, i) => str(c, `clues[${i}]`, 90));
  for (const c of clues) {
    const low = c.toLowerCase();
    need(!new RegExp(`\\b${el.name.toLowerCase()}\\b`).test(low), `A clue gives the answer away: "${c}" names ${el.name}`);
  }
  const title = spec.hook ? str(spec.hook, 'hook', 40) : 'Guess the element';

  const t = { clues: [] };
  let at = 0.35;
  for (const c of clues) {
    t.clues.push(r2(at));
    at += clamp(2.0 + c.length * 0.045, 2.8, 4.5);
  }
  t.countdown = r2(at);
  t.reveal = r2(at + 3);
  t.end = r2(t.reveal + 4.6);
  t.total = r2(Math.max(MIN_SECONDS, t.end + END_CARD));
  t.end = r2(t.total - END_CARD);

  const cues = [
    { t: 0.0, type: 'whoosh' },
    ...t.clues.map((c, i) => ({ t: c, type: 'pop', pitch: 1 + i * 0.12 })),
    { t: t.countdown, type: 'tick' },
    { t: t.countdown + 1, type: 'tick' },
    { t: t.countdown + 2, type: 'tick' },
    { t: t.reveal, type: 'chime' },
    { t: t.end, type: 'whoosh' },
  ];

  return {
    format: 'guess-element',
    duration: t.total,
    el,
    title,
    clues,
    times: t,
    cues,
    music: { drops: [{ from: t.countdown, to: t.reveal }] },
    coverTime: 0.9,
    keyTimes: [0, t.clues[1] + 1.2, t.countdown - 0.4, t.countdown + 0.5, t.reveal + 1.6, t.end + 1.8].map(r2),
    endShots: [{ kind: 'element', symbol: el.symbol }, { kind: 'home' }],
  };
}

// ------------------------------------------------------------ quiz

function quiz(spec) {
  const question = str(spec.question, 'question', 120);
  need(Array.isArray(spec.options) && spec.options.length >= 2 && spec.options.length <= 4, 'options must be an array of 2 to 4 strings');
  const options = spec.options.map((o, i) => str(o, `options[${i}]`, 40));
  need(Number.isInteger(spec.answerIndex) && spec.answerIndex >= 0 && spec.answerIndex < options.length, `answerIndex must be an index into options (0 to ${options.length - 1})`);
  const explanation = spec.explanation ? str(spec.explanation, 'explanation', 140) : null;
  const label = spec.hook ? str(spec.hook, 'hook', 40) : 'Quick quiz';
  const answerNumber = elementInText(options[spec.answerIndex]);
  const answerEl = answerNumber ? elementForReel(answerNumber) : null;

  const chars = question.length + options.reduce((a, o) => a + o.length, 0);
  const t = {};
  t.timerStart = 1.2;
  t.timerLen = Number.isInteger(spec.seconds) ? clamp(spec.seconds, 3, 10) : clamp(Math.round(2.5 + chars / 40), 5, 8);
  t.reveal = r2(t.timerStart + t.timerLen);
  t.explain = r2(t.reveal + 0.6);
  t.end = r2(t.explain + (explanation ? readTime(explanation.length, 3.6, 6.5) : 2.6));
  t.total = r2(Math.max(MIN_SECONDS, t.end + END_CARD));
  t.end = r2(t.total - END_CARD);

  const cues = [{ t: 0.0, type: 'whoosh' }, ...options.map((_, i) => ({ t: 0.2 + i * 0.08, type: 'pop', pitch: 1 + i * 0.1, gain: 0.5 }))];
  for (let s = 0; s < t.timerLen; s++) cues.push({ t: r2(t.timerStart + s), type: 'tick', pitch: s >= t.timerLen - 3 ? 1.12 : 1 });
  cues.push({ t: t.reveal, type: 'chime' }, { t: t.end, type: 'whoosh' });

  return {
    format: 'quiz',
    duration: t.total,
    label,
    question,
    options,
    answerIndex: spec.answerIndex,
    explanation,
    answerEl,
    times: t,
    cues,
    music: { drops: [{ from: t.timerStart, to: t.reveal }] },
    coverTime: 1.0,
    keyTimes: [0, 1.0, t.timerStart + 2.5, t.reveal + 0.4, t.explain + 1.4, t.end + 1.8].map(r2),
    endShots: answerEl ? [{ kind: 'element', symbol: answerEl.symbol }, { kind: 'explore' }] : [{ kind: 'home' }, { kind: 'explore' }],
  };
}

export function checkDuration(plan) {
  if (plan.duration > MAX_SECONDS) throw new SpecError(`This reel would run ${plan.duration}s; shorten the text so it stays at ${MAX_SECONDS}s or less`);
}
