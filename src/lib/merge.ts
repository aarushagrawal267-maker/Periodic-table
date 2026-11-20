/**
 * The account sync domain core (docs/ACCOUNTS.md section 4). Pure: no Firebase, no storage, no clock.
 *
 * `mergeProgress` is a join on SyncedProgress: idempotent, commutative, associative and inflationary,
 * so devices converge whatever order their writes land in, and a device that receives its own write
 * back changes nothing. Additive counters live in per-replica slots so nothing is lost or counted twice.
 */
import type { DailyResult, Mastery, ProgressData } from '../store/progress';
import type { SettingKey, SettingsData } from '../store/settings';
import { previousKey } from './daily';

export const SCHEMA_VERSION = 1;
export const MAX_DAILY_RESULTS = 400;
export const MAX_TRAIL = 64;
export const MAX_SLOTS = 500;
export const MAX_NAME = 40;

/** One replica's own contributions. Written only by that replica. Each field only grows. */
export interface Slot {
  xp: number;
  rounds: number;
  placements: number;
  mistakes: number;
  quizzes: number;
  playMs: number;
  /** todayKey() of this replica's latest XP, '' before any. */
  day: string;
  /** XP this replica earned on `day`. */
  dayXp: number;
}

export interface SyncedDaily {
  results: Record<string, DailyResult>;
  streak: number;
  bestStreak: number;
  lastKey: string | null;
}

export interface SyncedProgress {
  /** Reset generation (section 4.6). The higher epoch wins whole. */
  epoch: number;
  /** replicaId -> slot. All-zero slots are omitted. */
  slots: Record<string, Slot>;
  /** "1".."118" -> mastery. */
  mastery: Record<string, Mastery>;
  best: Record<string, { score: number; stars: number; timeMs: number }>;
  bestCombo: number;
  daily: SyncedDaily;
  /** Badge id -> unlock time (ms). */
  achievements: Record<string, number>;
  /** Ascending, unique. */
  explored: number[];
  /** Chapter id -> best stars. */
  chapters: Record<string, number>;
}

export interface SyncedSettings {
  values: SettingsData;
  /** Per key: when it was last set (ms). Missing means a default that was never set. */
  at: Partial<Record<SettingKey, number>>;
}

export interface UserDoc {
  schemaVersion: number;
  profile: { name: string };
  progress: SyncedProgress;
  settings: SyncedSettings;
  clientId: string;
  createdAt: unknown;
  updatedAt: unknown;
}

/**
 * The merge rule for every ProgressData field. A mapped type, so adding a field to the store
 * without deciding how it syncs fails the type check (section 4.2).
 */
export const MERGE_RULES: { [K in keyof ProgressData]: string } = {
  xp: 'counter: slots[*].xp, per-slot max, total is the sum',
  mastery: 'latest practice wins (t, then s, c, w); guest adoption takes the component-wise max',
  best: 'better result wins: score, then stars, then lower timeMs',
  stats: 'rounds, placements, mistakes, quizzes, playMs are slot counters; bestCombo is max',
  daily: 'results union (better result per day), lastKey max, streaks recomputed; started stays on the device',
  achievements: 'union, earliest unlock time',
  explored: 'set union, ascending',
  chapters: 'max stars',
  today: 'slots[*].day and dayXp, larger (day, dayXp) per slot; today = sum over slots on the latest day',
};

const SETTING_KEY_SET: Record<SettingKey, true> = { sound: true, haptics: true, reduceMotion: true, colorblind: true, difficulty: true, quizTimer: true };
export const SYNC_SETTING_KEYS = Object.keys(SETTING_KEY_SET) as SettingKey[];

/** Static defaults used only to fill a damaged document. The device's own defaults live in the settings store. */
const FALLBACK_SETTINGS: SettingsData = { sound: true, haptics: true, reduceMotion: false, colorblind: false, difficulty: 'standard', quizTimer: true };

const COUNTERS = ['xp', 'rounds', 'placements', 'mistakes', 'quizzes', 'playMs'] as const;
type Counter = (typeof COUNTERS)[number];

// ---------- small helpers ----------

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
/** A finite number >= 0, else 0. */
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0);
/** A whole number >= 0, else 0. Fields the security rules check with `is int`. */
const int = (x: unknown) => Math.floor(num(x));
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (x: unknown): x is string => typeof x === 'string' && DAY_RE.test(x);
const maxKey = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : a >= b ? a : b);

/** Order-insensitive deep equality for plain JSON-like values (Firestore does not keep map key order). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => deepEqual(x, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  return ak.length === bk.length && ak.every((k) => k in bo && deepEqual(ao[k], bo[k]));
}

export const sameProgress = (a: SyncedProgress, b: SyncedProgress) => deepEqual(a, b);
export const sameSettings = (a: SyncedSettings, b: SyncedSettings) => deepEqual(a, b);

export function emptySynced(epoch = 0): SyncedProgress {
  return {
    epoch,
    slots: {},
    mastery: {},
    best: {},
    bestCombo: 0,
    daily: { results: {}, streak: 0, bestStreak: 0, lastKey: null },
    achievements: {},
    explored: [],
    chapters: {},
  };
}

// ---------- slots ----------

export const zeroSlot = (): Slot => ({ xp: 0, rounds: 0, placements: 0, mistakes: 0, quizzes: 0, playMs: 0, day: '', dayXp: 0 });

const isZeroSlot = (s: Slot) => COUNTERS.every((k) => s[k] === 0) && s.dayXp === 0;

function cleanSlot(x: unknown): Slot {
  const o = isObj(x) ? x : {};
  const s = zeroSlot();
  for (const k of COUNTERS) s[k] = num(o[k]);
  s.day = isDay(o.day) ? o.day : '';
  s.dayXp = num(o.dayXp);
  return s;
}

function joinSlot(a: Slot, b: Slot): Slot {
  const s = zeroSlot();
  for (const k of COUNTERS) s[k] = Math.max(a[k], b[k]);
  // The larger (day, dayXp) pair: a later day replaces the count, the same day keeps the larger one.
  const [day, dayXp] = a.day > b.day ? [a.day, a.dayXp] : b.day > a.day ? [b.day, b.dayXp] : [a.day, Math.max(a.dayXp, b.dayXp)];
  s.day = day;
  s.dayXp = dayXp;
  return s;
}

/** Sum of the counters over a set of slots. */
export function sumSlots(slots: Record<string, Slot>): Record<Counter, number> {
  const t = { xp: 0, rounds: 0, placements: 0, mistakes: 0, quizzes: 0, playMs: 0 };
  for (const s of Object.values(slots)) for (const k of COUNTERS) t[k] += s[k];
  return t;
}

/** today = { latest day over all slots, XP from every slot on that day }. */
export function todayFromSlots(slots: Record<string, Slot>): { key: string; xp: number } {
  let key = '';
  for (const s of Object.values(slots)) if (s.day > key) key = s.day;
  let xp = 0;
  if (key) for (const s of Object.values(slots)) if (s.day === key) xp += s.dayXp;
  return { key, xp };
}

// ---------- lattice fields ----------

/** True when mastery entry a is after b in the merge order: later t, then larger s, c, w. */
function masteryAfter(a: Mastery, b: Mastery) {
  if (a.t !== b.t) return a.t > b.t;
  if (a.s !== b.s) return a.s > b.s;
  if (a.c !== b.c) return a.c > b.c;
  return a.w > b.w;
}

const cleanMastery = (x: unknown): Mastery => {
  const o = isObj(x) ? x : {};
  return { s: Math.min(5, int(o.s)), c: int(o.c), w: int(o.w), t: num(o.t) };
};

type Best = SyncedProgress['best'][string];
function bestAfter(a: Best, b: Best) {
  if (a.score !== b.score) return a.score > b.score;
  if (a.stars !== b.stars) return a.stars > b.stars;
  return a.timeMs < b.timeMs;
}
const cleanBest = (x: unknown): Best => {
  const o = isObj(x) ? x : {};
  return { score: num(o.score), stars: int(o.stars), timeMs: num(o.timeMs) };
};

const TRAIL = new Set(['hit', 'miss', 'hint']);
function cleanDaily(x: unknown): DailyResult {
  const o = isObj(x) ? x : {};
  const trail = Array.isArray(o.trail) ? (o.trail.filter((t) => typeof t === 'string' && TRAIL.has(t)) as DailyResult['trail']).slice(0, MAX_TRAIL) : [];
  return { score: num(o.score), timeMs: num(o.timeMs), mistakes: int(o.mistakes), stars: int(o.stars), trail };
}

/** True when daily result a is better than b: stars, score, fewer mistakes, lower time, then the trail as a string. */
function dailyAfter(a: DailyResult, b: DailyResult) {
  if (a.stars !== b.stars) return a.stars > b.stars;
  if (a.score !== b.score) return a.score > b.score;
  if (a.mistakes !== b.mistakes) return a.mistakes < b.mistakes;
  if (a.timeMs !== b.timeMs) return a.timeMs < b.timeMs;
  return a.trail.join(',') > b.trail.join(',');
}

function joinMaps<T>(a: Record<string, T>, b: Record<string, T>, after: (x: T, y: T) => boolean): Record<string, T> {
  const out: Record<string, T> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    out[k] = cur === undefined || after(v, cur) ? v : cur;
  }
  return out;
}

/** Consecutive days ending at `key` whose result has stars > 0. */
function runEndingAt(results: Record<string, DailyResult>, key: string | null) {
  let n = 0;
  for (let k = key; k && (results[k]?.stars ?? 0) > 0; k = previousKey(k)) n++;
  return n;
}

function longestRun(results: Record<string, DailyResult>) {
  let best = 0;
  for (const k of Object.keys(results)) {
    if (!(results[k].stars > 0)) continue;
    // Only count from the start of each run.
    if ((results[previousKey(k)]?.stars ?? 0) > 0) continue;
    let n = 0;
    for (let d = k; (results[d]?.stars ?? 0) > 0; d = nextKey(d)) n++;
    best = Math.max(best, n);
  }
  return best;
}

function nextKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

function trimResults(results: Record<string, DailyResult>) {
  const keys = Object.keys(results);
  if (keys.length <= MAX_DAILY_RESULTS) return results;
  const keep = keys.sort().slice(-MAX_DAILY_RESULTS);
  const out: Record<string, DailyResult> = {};
  for (const k of keep) out[k] = results[k];
  return out;
}

/** Joins daily states. With one input it normalises (section 4.2: lastKey, streak, bestStreak). */
function joinDaily(inputs: SyncedDaily[]): SyncedDaily {
  let results: Record<string, DailyResult> = {};
  for (const d of inputs) results = joinMaps(results, d.results, dailyAfter);
  results = trimResults(results);
  let lastKey: string | null = null;
  for (const d of inputs) lastKey = maxKey(lastKey, d.lastKey);
  for (const [k, r] of Object.entries(results)) if (r.stars > 0) lastKey = maxKey(lastKey, k);
  let streak = 0;
  if (lastKey) {
    streak = runEndingAt(results, lastKey);
    for (const d of inputs) if (d.lastKey === lastKey) streak = Math.max(streak, d.streak);
  }
  let bestStreak = Math.max(streak, longestRun(results));
  for (const d of inputs) bestStreak = Math.max(bestStreak, d.bestStreak);
  return { results, streak, bestStreak, lastKey };
}

function joinSameEpoch(a: SyncedProgress, b: SyncedProgress): SyncedProgress {
  const slots: Record<string, Slot> = { ...a.slots };
  for (const [k, s] of Object.entries(b.slots)) slots[k] = slots[k] ? joinSlot(slots[k], s) : s;
  const achievements: Record<string, number> = { ...a.achievements };
  for (const [k, t] of Object.entries(b.achievements)) achievements[k] = k in achievements ? Math.min(achievements[k], t) : t;
  const chapters: Record<string, number> = { ...a.chapters };
  for (const [k, s] of Object.entries(b.chapters)) chapters[k] = Math.max(chapters[k] ?? 0, s);
  return normalizeProgress({
    epoch: a.epoch,
    slots,
    mastery: joinMaps(a.mastery, b.mastery, masteryAfter),
    best: joinMaps(a.best, b.best, bestAfter),
    bestCombo: Math.max(a.bestCombo, b.bestCombo),
    daily: joinDaily([a.daily, b.daily]),
    achievements,
    explored: [...a.explored, ...b.explored],
    chapters,
  });
}

/**
 * Normalised form (law 7): explored sorted and unique, zero slots dropped, daily results trimmed and
 * their derived fields recomputed. normalizeProgress(normalizeProgress(x)) = normalizeProgress(x).
 */
export function normalizeProgress(p: SyncedProgress): SyncedProgress {
  const slots: Record<string, Slot> = {};
  for (const [k, s] of Object.entries(p.slots)) if (!isZeroSlot(s)) slots[k] = s;
  const explored = [...new Set(p.explored)].sort((x, y) => x - y);
  return { ...p, slots, explored, daily: joinDaily([p.daily]) };
}

/** The join. Different epochs: the higher one wins whole (a reset). */
export function mergeProgress(a: SyncedProgress, b: SyncedProgress): SyncedProgress {
  if (a.epoch !== b.epoch) return normalizeProgress(a.epoch > b.epoch ? a : b);
  return joinSameEpoch(a, b);
}

// ---------- local store <-> synced shape ----------

function latticeFrom(local: ProgressData, epoch: number): SyncedProgress {
  const mastery: Record<string, Mastery> = {};
  for (const [k, m] of Object.entries(local.mastery)) mastery[String(k)] = cleanMastery(m);
  const best: SyncedProgress['best'] = {};
  for (const [k, b] of Object.entries(local.best)) best[k] = cleanBest(b);
  const results: Record<string, DailyResult> = {};
  for (const [k, r] of Object.entries(local.daily.results)) if (isDay(k)) results[k] = cleanDaily(r);
  const achievements: Record<string, number> = {};
  for (const [k, t] of Object.entries(local.achievements)) if (typeof t === 'number' && t > 0) achievements[k] = t;
  const chapters: Record<string, number> = {};
  for (const [k, s] of Object.entries(local.chapters)) if (int(s) > 0) chapters[k] = int(s);
  return {
    epoch,
    slots: {},
    mastery,
    best,
    bestCombo: int(local.stats.bestCombo),
    daily: {
      results,
      streak: int(local.daily.streak),
      bestStreak: int(local.daily.bestStreak),
      lastKey: isDay(local.daily.lastKey) ? local.daily.lastKey : null,
    },
    achievements,
    explored: local.explored.filter((n) => Number.isInteger(n) && n >= 1 && n <= 118),
    chapters,
  };
}

/** The local store's counters and today as one slot (used for a guest, whose store is a single replica). */
function slotFromLocal(local: ProgressData): Slot {
  return {
    xp: num(local.xp),
    rounds: num(local.stats.rounds),
    placements: num(local.stats.placements),
    mistakes: num(local.stats.mistakes),
    quizzes: num(local.stats.quizzes),
    playMs: num(local.stats.playMs),
    day: isDay(local.today.key) ? local.today.key : '',
    dayXp: isDay(local.today.key) ? num(local.today.xp) : 0,
  };
}

/**
 * The local invariant (section 5.3) is broken: some counter in the store is below what the other replicas'
 * slots already add up to. Only a stale copy written by another tab can do that; such a store must be
 * rebuilt from the account, because `toSynced` would clamp this replica's slot at 0 and hide the loss.
 */
export function belowOthers(local: ProgressData, others: Record<string, Slot>): boolean {
  const total = slotFromLocal(local);
  const sum = sumSlots(others);
  return COUNTERS.some((k) => total[k] < sum[k]);
}

/**
 * The local store as a synced value. This replica's own slot is derived: local totals minus the
 * other replicas' slots already counted in them (section 5.3), clamped at 0.
 */
export function toSynced(local: ProgressData, others: Record<string, Slot>, replicaId: string, epoch: number): SyncedProgress {
  const base = latticeFrom(local, epoch);
  const slots: Record<string, Slot> = {};
  for (const [k, s] of Object.entries(others)) if (k !== replicaId) slots[k] = cleanSlot(s);
  const total = slotFromLocal(local);
  const sum = sumSlots(slots);
  const own = zeroSlot();
  for (const k of COUNTERS) own[k] = Math.max(0, total[k] - sum[k]);
  let othersToday = 0;
  if (total.day) for (const s of Object.values(slots)) if (s.day === total.day) othersToday += s.dayXp;
  own.dayXp = Math.max(0, total.dayXp - othersToday);
  // No XP of its own today: the slot keeps whatever day it had. Writing (today, 0) would replace this
  // replica's older day on the server and cost every device a write each time another one starts a day.
  own.day = own.dayXp > 0 ? total.day : '';
  slots[replicaId] = own;
  return normalizeProgress({ ...base, slots });
}

/** Back to the store's shape. Counters and today are summed from the slots; `daily.started` stays local. */
export function fromSynced(s: SyncedProgress, local: ProgressData): ProgressData {
  const t = sumSlots(s.slots);
  const mastery: Record<number, Mastery> = {};
  for (const [k, m] of Object.entries(s.mastery)) mastery[Number(k)] = { ...m };
  const results: Record<string, DailyResult> = {};
  for (const [k, r] of Object.entries(s.daily.results)) results[k] = { ...r, trail: [...r.trail] };
  const best: ProgressData['best'] = {};
  for (const [k, b] of Object.entries(s.best)) best[k] = { ...b };
  return {
    xp: t.xp,
    mastery,
    best,
    stats: { rounds: t.rounds, placements: t.placements, mistakes: t.mistakes, quizzes: t.quizzes, bestCombo: s.bestCombo, playMs: t.playMs },
    daily: {
      results,
      streak: s.daily.streak,
      bestStreak: s.daily.bestStreak,
      lastKey: s.daily.lastKey,
      ...(local.daily.started ? { started: local.daily.started } : {}),
    },
    achievements: { ...s.achievements },
    explored: [...s.explored],
    chapters: { ...s.chapters },
    today: todayFromSlots(s.slots),
  };
}

/**
 * Guest progress into an account (section 4.4). The guest is one more replica with its own slot, so
 * retrying with the same guestId sets the slot again rather than adding it twice. For mastery the
 * guest's history is independent of the account's, so an element on both sides takes the
 * component-wise maximum: practising as a guest never lowers what the account had mastered.
 */
export function adoptGuest(guest: ProgressData, guestId: string, account: SyncedProgress | null): SyncedProgress {
  const base = account ?? emptySynced(0);
  const g = latticeFrom(guest, base.epoch);
  const slot = slotFromLocal(guest);
  g.slots = isZeroSlot(slot) ? {} : { [guestId]: slot };
  for (const [k, m] of Object.entries(g.mastery)) {
    const a = base.mastery[k];
    if (a) g.mastery[k] = { s: Math.max(a.s, m.s), c: Math.max(a.c, m.c), w: Math.max(a.w, m.w), t: Math.max(a.t, m.t) };
  }
  return mergeProgress(base, normalizeProgress(g));
}

/** The slots of `p` other than `replicaId`: what a device stores as `meta.others`. */
export function othersOf(p: SyncedProgress, replicaId: string): Record<string, Slot> {
  const out: Record<string, Slot> = {};
  for (const [k, s] of Object.entries(p.slots)) if (k !== replicaId) out[k] = s;
  return out;
}

// ---------- settings ----------

/** Per key, last writer wins; equal times fall back to comparing the values as JSON. */
export function mergeSettings(a: SyncedSettings, b: SyncedSettings): SyncedSettings {
  const values = { ...a.values };
  const at: SyncedSettings['at'] = {};
  for (const k of SYNC_SETTING_KEYS) {
    const ta = a.at[k] ?? 0;
    const tb = b.at[k] ?? 0;
    const useB = tb > ta || (tb === ta && JSON.stringify(b.values[k]) > JSON.stringify(a.values[k]));
    (values as Record<SettingKey, unknown>)[k] = useB ? b.values[k] : a.values[k];
    const t = Math.max(ta, tb);
    if (t > 0) at[k] = t;
  }
  return { values, at };
}

// ---------- parsing a document ----------

function cleanSettings(x: unknown): SyncedSettings {
  const o = isObj(x) ? x : {};
  const v = isObj(o.values) ? o.values : {};
  const atIn = isObj(o.at) ? o.at : {};
  const values = { ...FALLBACK_SETTINGS };
  const at: SyncedSettings['at'] = {};
  for (const k of SYNC_SETTING_KEYS) {
    const ok = k === 'difficulty' ? v[k] === 'learner' || v[k] === 'standard' || v[k] === 'expert' : typeof v[k] === 'boolean';
    if (ok) (values as Record<SettingKey, unknown>)[k] = v[k];
    // Whole ms: the rules check `is int`.
    if (ok && int(atIn[k]) > 0) at[k] = int(atIn[k]);
  }
  return { values, at };
}

/** Lenient: a missing or mistyped field becomes its empty value, never an error. */
export function cleanProgress(x: unknown): SyncedProgress {
  const o = isObj(x) ? x : {};
  const p = emptySynced(int(o.epoch));
  if (isObj(o.slots)) for (const [k, s] of Object.entries(o.slots)) p.slots[k] = cleanSlot(s);
  if (isObj(o.mastery))
    for (const [k, m] of Object.entries(o.mastery)) {
      const n = Number(k);
      if (Number.isInteger(n) && n >= 1 && n <= 118) p.mastery[String(n)] = cleanMastery(m);
    }
  if (isObj(o.best)) for (const [k, b] of Object.entries(o.best)) p.best[k] = cleanBest(b);
  p.bestCombo = int(o.bestCombo);
  const d = isObj(o.daily) ? o.daily : {};
  if (isObj(d.results)) for (const [k, r] of Object.entries(d.results)) if (isDay(k)) p.daily.results[k] = cleanDaily(r);
  p.daily.streak = int(d.streak);
  p.daily.bestStreak = int(d.bestStreak);
  p.daily.lastKey = isDay(d.lastKey) ? d.lastKey : null;
  if (isObj(o.achievements)) for (const [k, t] of Object.entries(o.achievements)) if (num(t) > 0) p.achievements[k] = num(t);
  if (Array.isArray(o.explored)) p.explored = o.explored.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 118);
  if (isObj(o.chapters)) for (const [k, s] of Object.entries(o.chapters)) if (int(s) > 0) p.chapters[k] = int(s);
  return normalizeProgress(p);
}

export type Parsed = { kind: 'missing' } | { kind: 'newer'; version: number } | { kind: 'ok'; doc: UserDoc };

/** Migrations from version v to v + 1, applied in order. None exist yet. */
const migrations: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export function parseDoc(raw: unknown): Parsed {
  if (!isObj(raw)) return { kind: 'missing' };
  let version = typeof raw.schemaVersion === 'number' && Number.isInteger(raw.schemaVersion) && raw.schemaVersion >= 1 ? raw.schemaVersion : SCHEMA_VERSION;
  if (version > SCHEMA_VERSION) return { kind: 'newer', version };
  let d = raw;
  while (version < SCHEMA_VERSION) {
    d = migrations[version]?.(d) ?? d;
    version++;
  }
  const profile = isObj(d.profile) && typeof d.profile.name === 'string' ? d.profile.name : '';
  return {
    kind: 'ok',
    doc: {
      schemaVersion: version,
      profile: { name: profile },
      progress: cleanProgress(d.progress),
      settings: cleanSettings(d.settings),
      clientId: typeof d.clientId === 'string' ? d.clientId : '',
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    },
  };
}

/**
 * A display name the rules accept: trimmed, 1 to 40 UTF-16 units (what `size()` counts in the rules).
 * Cut at a code point, never inside a surrogate pair, so an emoji is kept whole or dropped whole.
 */
export function profileName(name: string) {
  let out = '';
  for (const ch of name.trim()) {
    if (out.length + ch.length > MAX_NAME) break;
    out += ch;
  }
  return out.trim() || 'Student';
}
