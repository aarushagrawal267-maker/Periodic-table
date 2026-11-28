import { CATEGORIES, ELEMENTS, type Category, type Element } from './elements';
import type { Mastery } from '../store/progress';

/**
 * The Progress page's mastery map, as plain functions: how full each tile prints, the per-family counts,
 * the sweep timing, and the UI-only "last seen" snapshot that marks what moved up since the last visit.
 * Nothing here writes to the progress store or to synced data.
 */

/** Strength 0 to 5 shown as a fill step: 0 not started, 1 to 3 learning, 4 (and 5) mastered. */
export const fillStep = (s: number | undefined) => Math.max(0, Math.min(4, Math.floor(s ?? 0)));

/** Family names in the plural, for "Alkali metals 3 of 6". */
export const FAMILY_NAMES: Record<Category, string> = {
  'alkali-metal': 'Alkali metals',
  'alkaline-earth-metal': 'Alkaline earth metals',
  'transition-metal': 'Transition metals',
  'post-transition-metal': 'Post-transition metals',
  metalloid: 'Metalloids',
  nonmetal: 'Nonmetals',
  halogen: 'Halogens',
  'noble-gas': 'Noble gases',
  lanthanide: 'Lanthanides',
  actinide: 'Actinides',
};

export interface FamilyCount {
  category: Category;
  name: string;
  total: number;
  mastered: number;
  learning: number;
}

/** Mastered and learning counts for every family, in the chart's legend order. */
export function familyCounts(mastery: Record<number, Mastery>): FamilyCount[] {
  return CATEGORIES.map(({ id }) => {
    const members = ELEMENTS.filter((e) => e.category === id);
    let mastered = 0;
    let learning = 0;
    for (const e of members) {
      const step = fillStep(mastery[e.number]?.s);
      if (step >= 4) mastered++;
      else if (step >= 1) learning++;
    }
    return { category: id, name: FAMILY_NAMES[id], total: members.length, mastered, learning };
  });
}

/**
 * Delay of a tile in the opening sweep: left to right, then a little top to bottom, like a chart being coloured in.
 * The last tile (group 18, the actinide row) starts at 500ms, so with a 360ms fill the sweep ends under 900ms.
 */
export const sweepDelay = (e: Pick<Element, 'col' | 'row'>) => (e.col - 1) * 22 + (e.row - 1) * 14;

/** UI-only key: what the map showed last time. Not part of the progress store, never synced. */
export const SEEN_KEY = 'periodica-map-seen';

export type Seen = Record<number, number>;

/** The steps the map shows now, for every started element. */
export function snapshot(mastery: Record<number, Mastery>): Seen {
  const out: Seen = {};
  for (const [k, m] of Object.entries(mastery)) {
    const step = fillStep(m?.s);
    if (step > 0) out[Number(k)] = step;
  }
  return out;
}

type KeyStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The last snapshot, or null when there is none or it cannot be read. */
export function readSeen(store: KeyStore | undefined): Seen | null {
  try {
    const raw = store?.getItem(SEEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; s?: unknown };
    if (parsed?.v !== 1 || !parsed.s || typeof parsed.s !== 'object') return null;
    const out: Seen = {};
    for (const [k, v] of Object.entries(parsed.s as Record<string, unknown>)) {
      const n = Number(k);
      if (Number.isInteger(n) && n >= 1 && n <= ELEMENTS.length && typeof v === 'number') out[n] = fillStep(v);
    }
    return out;
  } catch {
    return null;
  }
}

/** Saves what the map shows now. An empty map leaves nothing behind on the device. */
export function writeSeen(store: KeyStore | undefined, mastery: Record<number, Mastery>) {
  try {
    const s = snapshot(mastery);
    if (Object.keys(s).length === 0) store?.removeItem(SEEN_KEY);
    else store?.setItem(SEEN_KEY, JSON.stringify({ v: 1, s }));
  } catch {
    // Storage blocked or full: the map simply shows no "moved up" marks.
  }
}

/**
 * Elements whose step went up since the snapshot, in atomic-number order.
 * Progress only ever adds elements, so a snapshot naming an element this progress has never touched
 * belongs to someone else on this device (or to progress since reset): it marks nothing.
 */
export function improvedSince(prev: Seen | null, mastery: Record<number, Mastery>): number[] {
  if (!prev) return [];
  for (const k of Object.keys(prev)) if (!mastery[Number(k)]) return [];
  const now = snapshot(mastery);
  return Object.keys(now)
    .map(Number)
    .filter((n) => now[n] > (prev[n] ?? 0))
    .sort((a, b) => a - b);
}

/** Plain words for a tile's state, for its accessible name. */
export function stepWords(step: number) {
  return step >= 4 ? 'mastered' : step ? `learning, ${step} of 4` : 'not started yet';
}
