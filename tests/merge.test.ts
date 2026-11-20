import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';
import { previousKey } from '../src/lib/daily';
import {
  MAX_NAME,
  MERGE_RULES,
  adoptGuest,
  belowOthers,
  cleanProgress,
  emptySynced,
  fromSynced,
  mergeProgress,
  mergeSettings,
  normalizeProgress,
  othersOf,
  parseDoc,
  profileName,
  sameProgress,
  sumSlots,
  toSynced,
  todayFromSlots,
  type Slot,
  type SyncedProgress,
  type SyncedSettings,
} from '../src/lib/merge';
import { seeded } from '../src/lib/random';
import { EMPTY_PROGRESS, type ProgressData } from '../src/store/progress';

const ITERATIONS = 500;
const DAYS = ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'];
const REPLICAS = ['dev-a-0000', 'dev-b-0000', 'dev-c-0000', 'guest-0000'];

type Rand = () => number;
const int = (r: Rand, n: number) => Math.floor(r() * n);
const pick = <T,>(r: Rand, xs: readonly T[]) => xs[int(r, xs.length)];
const chance = (r: Rand, p: number) => r() < p;

function genSlot(r: Rand): Slot {
  return {
    xp: pick(r, [0, 50, 120, 300]),
    rounds: int(r, 4),
    placements: int(r, 30),
    mistakes: int(r, 5),
    quizzes: int(r, 3),
    playMs: pick(r, [0, 1500.5, 60_000]),
    day: pick(r, ['', ...DAYS.slice(-3)]),
    dayXp: pick(r, [0, 25, 80]),
  };
}

/** A random well-formed synced value. Small pools, so equal keys, equal times and ties are common. */
function genProgress(r: Rand): SyncedProgress {
  const p = emptySynced(chance(r, 0.15) ? 1 : 0);
  for (const id of REPLICAS) if (chance(r, 0.5)) p.slots[id] = genSlot(r);
  for (let n = 1; n <= 6; n++)
    if (chance(r, 0.5)) p.mastery[String(n)] = { s: int(r, 6), c: int(r, 3), w: int(r, 3), t: pick(r, [100, 200, 300]) };
  for (const k of ['first-20:standard', 'first-20:expert', 'full:learner'])
    if (chance(r, 0.4)) p.best[k] = { score: pick(r, [100, 200]), stars: int(r, 4), timeMs: pick(r, [30_000, 45_000]) };
  p.bestCombo = int(r, 30);
  for (const d of DAYS)
    if (chance(r, 0.5)) {
      const stars = int(r, 4);
      p.daily.results[d] = {
        stars,
        score: pick(r, [0, 800, 1200]),
        mistakes: int(r, 3),
        timeMs: pick(r, [0, 50_000, 70_000]),
        trail: Array.from({ length: int(r, 4) }, () => pick(r, ['hit', 'miss', 'hint'] as const)),
      };
    }
  const starred = Object.keys(p.daily.results).filter((k) => p.daily.results[k].stars > 0);
  p.daily.lastKey = starred.length && chance(r, 0.8) ? pick(r, starred) : null;
  p.daily.streak = int(r, 6);
  p.daily.bestStreak = p.daily.streak + int(r, 3);
  for (const id of ['first-steps', 'daily-1', 'goal', 'explorer']) if (chance(r, 0.4)) p.achievements[id] = pick(r, [1000, 2000, 3000]);
  for (let n = 1; n <= 10; n++) if (chance(r, 0.3)) p.explored.push(n);
  for (const c of ['lightest-ten', 'noble-gases']) if (chance(r, 0.4)) p.chapters[c] = 1 + int(r, 3);
  return normalizeProgress(p);
}

const totals = (p: SyncedProgress) => sumSlots(p.slots);

describe('mergeProgress laws', () => {
  const r = seeded(20261120);
  const triples = Array.from({ length: ITERATIONS }, () => [genProgress(r), genProgress(r), genProgress(r)] as const);

  test('idempotent: merge(a, a) = a', () => {
    for (const [a] of triples) expect(sameProgress(mergeProgress(a, a), a)).toBe(true);
  });

  test('commutative: merge(a, b) = merge(b, a)', () => {
    for (const [a, b] of triples) expect(sameProgress(mergeProgress(a, b), mergeProgress(b, a))).toBe(true);
  });

  test('associative: merge(merge(a, b), c) = merge(a, merge(b, c))', () => {
    for (const [a, b, c] of triples) expect(sameProgress(mergeProgress(mergeProgress(a, b), c), mergeProgress(a, mergeProgress(b, c)))).toBe(true);
  });

  test('inflationary: merge(merge(a, b), a) = merge(a, b)', () => {
    for (const [a, b] of triples) {
      const ab = mergeProgress(a, b);
      expect(sameProgress(mergeProgress(ab, a), ab)).toBe(true);
      expect(sameProgress(mergeProgress(ab, b), ab)).toBe(true);
    }
  });

  test('no double count and no loss within an epoch', () => {
    for (const [a, b] of triples) {
      if (a.epoch !== b.epoch) continue;
      const ab = mergeProgress(a, b);
      const t = totals(ab);
      for (const k of Object.keys(t) as (keyof typeof t)[]) {
        expect(t[k]).toBeGreaterThanOrEqual(Math.max(totals(a)[k], totals(b)[k]));
        // Re-merging an input changes no total.
        expect(totals(mergeProgress(ab, a))[k]).toBe(t[k]);
      }
      // Nothing either side had is taken back.
      for (const n of a.explored) expect(ab.explored).toContain(n);
      for (const [k, s] of Object.entries(a.chapters)) expect(ab.chapters[k]).toBeGreaterThanOrEqual(s);
      for (const k of Object.keys(a.achievements)) expect(ab.achievements[k]).toBeLessThanOrEqual(a.achievements[k]);
      for (const [k, m] of Object.entries(a.mastery)) expect(ab.mastery[k].t).toBeGreaterThanOrEqual(m.t);
      expect(ab.daily.bestStreak).toBeGreaterThanOrEqual(Math.max(a.daily.bestStreak, b.daily.bestStreak));
    }
  });

  test('normalised output', () => {
    for (const [a, b] of triples) {
      const ab = mergeProgress(a, b);
      expect(sameProgress(normalizeProgress(ab), ab)).toBe(true);
      expect(ab.explored).toEqual([...new Set(ab.explored)].sort((x, y) => x - y));
      for (const s of Object.values(ab.slots)) expect(Object.values(s).some((v) => v !== 0 && v !== '')).toBe(true);
    }
  });

  test('a higher epoch wins whole', () => {
    for (const [a, b] of triples) {
      if (a.epoch === b.epoch) continue;
      const hi = a.epoch > b.epoch ? a : b;
      expect(sameProgress(mergeProgress(a, b), hi)).toBe(true);
    }
  });
});

// ---------- scenarios, from the store's side ----------

const local = (over: Partial<ProgressData> = {}): ProgressData => ({
  ...EMPTY_PROGRESS,
  stats: { ...EMPTY_PROGRESS.stats },
  daily: { ...EMPTY_PROGRESS.daily },
  today: { ...EMPTY_PROGRESS.today },
  ...over,
});

const earned = (xp: number, day = '2026-11-20') => local({ xp, today: { key: day, xp }, stats: { ...EMPTY_PROGRESS.stats, rounds: 1 } });

describe('merge scenarios', () => {
  test('two devices each earn 100 XP offline: 200, and still 200 after merging again', () => {
    const a = toSynced(earned(100), {}, 'A', 0);
    const b = toSynced(earned(100), {}, 'B', 0);
    const m = mergeProgress(a, b);
    expect(fromSynced(m, EMPTY_PROGRESS).xp).toBe(200);
    expect(fromSynced(mergeProgress(m, a), EMPTY_PROGRESS).xp).toBe(200);
    expect(fromSynced(mergeProgress(mergeProgress(m, b), m), EMPTY_PROGRESS).stats.rounds).toBe(2);
    // Today's goal counts both devices' XP today.
    expect(fromSynced(m, EMPTY_PROGRESS).today).toEqual({ key: '2026-11-20', xp: 200 });
  });

  test('the same daily played on two devices keeps the better result', () => {
    const key = '2026-11-20';
    const worse = { score: 900, timeMs: 60_000, mistakes: 2, stars: 2, trail: ['hit', 'miss'] as const };
    const better = { score: 1100, timeMs: 70_000, mistakes: 0, stars: 3, trail: ['hit', 'hit'] as const };
    const a = toSynced(local({ daily: { results: { [key]: { ...worse, trail: [...worse.trail] } }, streak: 1, bestStreak: 1, lastKey: key } }), {}, 'A', 0);
    const b = toSynced(local({ daily: { results: { [key]: { ...better, trail: [...better.trail] } }, streak: 1, bestStreak: 1, lastKey: key } }), {}, 'B', 0);
    expect(mergeProgress(a, b).daily.results[key].score).toBe(1100);
    expect(mergeProgress(b, a).daily.results[key].stars).toBe(3);
  });

  test('alternate-day dailies on two devices give the joined streak', () => {
    const [d1, d2, d3] = ['2026-11-18', '2026-11-19', '2026-11-20'];
    expect(previousKey(d3)).toBe(d2);
    const res = (stars: number) => ({ score: 1000, timeMs: 50_000, mistakes: 0, stars, trail: [] });
    const a = toSynced(local({ daily: { results: { [d1]: res(3), [d3]: res(2) }, streak: 1, bestStreak: 1, lastKey: d3 } }), {}, 'A', 0);
    const b = toSynced(local({ daily: { results: { [d2]: res(1) }, streak: 1, bestStreak: 1, lastKey: d2 } }), {}, 'B', 0);
    const m = mergeProgress(a, b);
    expect(m.daily).toMatchObject({ lastKey: d3, streak: 3, bestStreak: 3 });
    // A daily left early (0 stars) on the other device does not break or extend the streak.
    const c = toSynced(local({ daily: { results: { [d2]: res(0) }, streak: 0, bestStreak: 0, lastKey: null } }), {}, 'C', 0);
    expect(mergeProgress(m, c).daily.streak).toBe(3);
  });

  test('a later practice wins for mastery, even when it lowers the strength', () => {
    const a = toSynced(local({ mastery: { 8: { s: 4, c: 4, w: 0, t: 100 } } }), {}, 'A', 0);
    const b = toSynced(local({ mastery: { 8: { s: 3, c: 4, w: 1, t: 200 } } }), {}, 'B', 0);
    expect(mergeProgress(a, b).mastery['8']).toEqual({ s: 3, c: 4, w: 1, t: 200 });
  });

  test('best scores, chapter stars, badges and explored', () => {
    const a = toSynced(
      local({ best: { 'first-20:standard': { score: 900, stars: 3, timeMs: 40_000 } }, chapters: { 'lightest-ten': 2 }, achievements: { goal: 2000 }, explored: [8, 1] }),
      {},
      'A',
      0,
    );
    const b = toSynced(
      local({ best: { 'first-20:standard': { score: 1000, stars: 2, timeMs: 60_000 } }, chapters: { 'lightest-ten': 3 }, achievements: { goal: 1000, 'daily-1': 5 }, explored: [2, 8] }),
      {},
      'B',
      0,
    );
    const m = mergeProgress(a, b);
    expect(m.best['first-20:standard']).toEqual({ score: 1000, stars: 2, timeMs: 60_000 });
    expect(m.chapters['lightest-ten']).toBe(3);
    expect(m.achievements).toEqual({ goal: 1000, 'daily-1': 5 });
    expect(m.explored).toEqual([1, 2, 8]);
  });

  test("today's goal sums devices only for the latest day", () => {
    const slots: Record<string, Slot> = {
      A: { ...toSynced(earned(30, '2026-11-20'), {}, 'A', 0).slots.A },
      B: { ...toSynced(earned(50, '2026-11-20'), {}, 'B', 0).slots.B },
      C: { ...toSynced(earned(100, '2026-11-19'), {}, 'C', 0).slots.C },
    };
    expect(todayFromSlots(slots)).toEqual({ key: '2026-11-20', xp: 80 });
  });

  test('a higher epoch (a reset) wins whole', () => {
    const old = toSynced(earned(500), {}, 'A', 0);
    const reset = toSynced(EMPTY_PROGRESS, {}, 'B', 1);
    expect(sameProgress(mergeProgress(old, reset), emptySynced(1))).toBe(true);
    // Play after the reset joins normally.
    const after = toSynced(earned(40), {}, 'A', 1);
    expect(fromSynced(mergeProgress(mergeProgress(old, reset), after), EMPTY_PROGRESS).xp).toBe(40);
  });

  test('round trip: fromSynced(toSynced(local)) = local when the invariant holds', () => {
    const l = local({
      xp: 450,
      mastery: { 1: { s: 4, c: 5, w: 1, t: 10 }, 26: { s: 1, c: 1, w: 0, t: 20 } },
      best: { 'first-20:standard': { score: 900, stars: 3, timeMs: 40_000 } },
      stats: { rounds: 4, placements: 60, mistakes: 3, quizzes: 1, bestCombo: 12, playMs: 240_000 },
      daily: { results: { '2026-11-20': { score: 1000, timeMs: 50_000, mistakes: 0, stars: 3, trail: ['hit'] } }, streak: 1, bestStreak: 1, lastKey: '2026-11-20', started: '2026-11-20' },
      achievements: { 'first-steps': 1000 },
      explored: [1, 8, 26],
      chapters: { 'lightest-ten': 3 },
      today: { key: '2026-11-20', xp: 150 },
    });
    // Another device's slot already counted in the local totals.
    const others: Record<string, Slot> = { B: { xp: 200, rounds: 2, placements: 20, mistakes: 1, quizzes: 1, playMs: 100_000, day: '2026-11-20', dayXp: 50 } };
    const s = toSynced(l, others, 'A', 0);
    expect(s.slots.A).toMatchObject({ xp: 250, rounds: 2, placements: 40, mistakes: 2, quizzes: 0, playMs: 140_000, dayXp: 100 });
    expect(fromSynced(s, l)).toEqual(l);
    // daily.started never leaves the device.
    expect(JSON.stringify(s)).not.toContain('started');
  });

  test('every ProgressData field has a merge rule', () => {
    expect(Object.keys(MERGE_RULES).sort()).toEqual(Object.keys(EMPTY_PROGRESS).sort());
  });
});

describe('guest adoption', () => {
  const account = () => {
    const a = toSynced(local({ xp: 1000, mastery: { 8: { s: 5, c: 9, w: 1, t: 100 } }, today: { key: '2026-11-19', xp: 100 } }), {}, 'A', 2);
    return a;
  };
  const guest = local({ xp: 120, mastery: { 8: { s: 2, c: 2, w: 0, t: 500 }, 1: { s: 1, c: 1, w: 0, t: 500 } }, today: { key: '2026-11-20', xp: 120 }, explored: [3] });

  test('guest progress adds to the account, in its epoch', () => {
    const m = adoptGuest(guest, 'guest-1', account());
    expect(m.epoch).toBe(2);
    expect(fromSynced(m, EMPTY_PROGRESS).xp).toBe(1120);
    expect(m.explored).toEqual([3]);
    expect(m.mastery['1']).toEqual({ s: 1, c: 1, w: 0, t: 500 });
  });

  test('practising as a guest never lowers a mastered element', () => {
    const m = adoptGuest(guest, 'guest-1', account());
    expect(m.mastery['8'].s).toBe(5);
    // The account device's own copy merging in later keeps it.
    expect(mergeProgress(m, account()).mastery['8'].s).toBe(5);
  });

  test('a retried adoption with the same guest id adds nothing', () => {
    const once = adoptGuest(guest, 'guest-1', account());
    expect(sameProgress(adoptGuest(guest, 'guest-1', once), once)).toBe(true);
    // A different guest id is a different session: it would count again, which is why the id is fixed first.
    expect(fromSynced(adoptGuest(guest, 'guest-2', once), EMPTY_PROGRESS).xp).toBe(1240);
  });

  test('adopting into no account yet', () => {
    const m = adoptGuest(guest, 'guest-1', null);
    expect(fromSynced(m, EMPTY_PROGRESS).xp).toBe(120);
    expect(m.epoch).toBe(0);
  });

  test('random guests into random accounts: totals add exactly once', () => {
    const r = seeded(7);
    for (let i = 0; i < ITERATIONS; i++) {
      const acc = genProgress(r);
      const g = fromSynced(genProgress(r), EMPTY_PROGRESS);
      const m = adoptGuest(g, 'guest-x', acc);
      // The guest slot is set (max), never added: the account's other slots plus the guest's XP.
      const prior = acc.slots['guest-x']?.xp ?? 0;
      expect(totals(m).xp).toBe(totals(acc).xp - prior + Math.max(prior, g.xp));
      expect(sameProgress(adoptGuest(g, 'guest-x', m), m)).toBe(true);
      for (const [k, e] of Object.entries(acc.mastery)) expect(m.mastery[k].s).toBeGreaterThanOrEqual(e.s);
    }
  });
});

describe('devices syncing through one account document', () => {
  /** A device as the sync layer sees it: the store, and the other replicas already counted in it. */
  interface Device {
    id: string;
    local: ProgressData;
    others: Record<string, Slot>;
  }

  /** What sync.ts does on a snapshot or after a save: join, write meta, write the store. */
  function sync(d: Device, server: SyncedProgress): SyncedProgress {
    const L = toSynced(d.local, d.others, d.id, server.epoch);
    const M = mergeProgress(L, server);
    d.others = othersOf(M, d.id);
    d.local = fromSynced(M, d.local);
    return M;
  }

  test('random play and syncs on three devices: every XP counted exactly once', () => {
    const r = seeded(99);
    for (let run = 0; run < 60; run++) {
      const devices: Device[] = ['A', 'B', 'C'].map((id) => ({ id, local: local(), others: {} }));
      let server = emptySynced(0);
      let total = 0;
      for (let step = 0; step < 40; step++) {
        const d = pick(r, devices);
        if (chance(r, 0.6)) {
          const xp = 10 * (1 + int(r, 10));
          total += xp;
          // The clock only moves forward, as todayKey() does in recordRound.
          const day = DAYS[Math.floor((step * DAYS.length) / 40)];
          const today = d.local.today.key === day ? d.local.today.xp + xp : xp;
          d.local = { ...d.local, xp: d.local.xp + xp, today: { key: day, xp: today } };
        } else server = sync(d, server);
      }
      for (let i = 0; i < 2; i++) for (const d of devices) server = sync(d, server);
      expect(totals(server).xp).toBe(total);
      for (const d of devices) expect(d.local.xp).toBe(total);
      // Nothing left to do: a further sync changes nothing anywhere (no echo).
      const before = JSON.stringify(server);
      for (const d of devices) expect(sameProgress(sync(d, server), server)).toBe(true);
      expect(JSON.stringify(server)).toBe(before);
    }
  });
});

describe('settings', () => {
  const values = { sound: true, haptics: true, reduceMotion: false, colorblind: false, difficulty: 'standard' as const, quizTimer: true };
  const s = (over: Partial<SyncedSettings['values']>, at: SyncedSettings['at']): SyncedSettings => ({ values: { ...values, ...over }, at });

  test('per key, the later change wins', () => {
    const m = mergeSettings(s({ difficulty: 'expert', sound: false }, { difficulty: 300, sound: 100 }), s({ difficulty: 'learner', sound: true }, { difficulty: 200, sound: 400 }));
    expect(m.values.difficulty).toBe('expert');
    expect(m.values.sound).toBe(true);
    expect(m.at).toEqual({ difficulty: 300, sound: 400 });
  });

  test('an account choice wins over a device default that was never set', () => {
    expect(mergeSettings(s({}, {}), s({ colorblind: true }, { colorblind: 50 })).values.colorblind).toBe(true);
  });

  test('laws', () => {
    const r = seeded(3);
    const gen = (): SyncedSettings =>
      s({ sound: chance(r, 0.5), difficulty: pick(r, ['learner', 'standard', 'expert'] as const) }, chance(r, 0.5) ? { sound: pick(r, [1, 2]), difficulty: pick(r, [1, 2]) } : {});
    for (let i = 0; i < ITERATIONS; i++) {
      const [a, b, c] = [gen(), gen(), gen()];
      expect(mergeSettings(a, b)).toEqual(mergeSettings(b, a));
      expect(mergeSettings(mergeSettings(a, b), c)).toEqual(mergeSettings(a, mergeSettings(b, c)));
      expect(mergeSettings(mergeSettings(a, b), a)).toEqual(mergeSettings(a, b));
    }
  });
});

describe('parseDoc', () => {
  test('missing, newer, and lenient on damage', () => {
    expect(parseDoc(undefined)).toEqual({ kind: 'missing' });
    expect(parseDoc({ schemaVersion: 2 })).toEqual({ kind: 'newer', version: 2 });
    const p = parseDoc({ schemaVersion: 1, progress: { slots: { A: { xp: 'lots', rounds: 2 } }, explored: [3, 'x', 1, 3], mastery: { 999: { s: 5 } }, daily: { lastKey: 'yesterday' } }, settings: { values: { difficulty: 'hard', sound: false } } });
    expect(p.kind).toBe('ok');
    if (p.kind !== 'ok') return;
    expect(p.doc.progress.slots.A.xp).toBe(0);
    expect(p.doc.progress.slots.A.rounds).toBe(2);
    expect(p.doc.progress.explored).toEqual([1, 3]);
    expect(p.doc.progress.mastery).toEqual({});
    expect(p.doc.progress.daily.lastKey).toBeNull();
    expect(p.doc.settings.values.difficulty).toBe('standard');
    expect(p.doc.settings.values.sound).toBe(false);
  });

  test('a document written by toSynced reads back the same', () => {
    const r = seeded(11);
    for (let i = 0; i < 100; i++) {
      const v = genProgress(r);
      // Through JSON, as Firestore would return it (key order lost).
      const back = cleanProgress(JSON.parse(JSON.stringify(v)));
      expect(sameProgress(back, v)).toBe(true);
    }
  });
});

describe('module boundaries (docs/ACCOUNTS.md 2.2)', () => {
  const root = join(__dirname, '..', 'src');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) files.push(p);
    }
  };
  walk(root);
  const rel = (p: string) => relative(root, p).split('\\').join('/');

  test("only lib/firebase-sdk.ts imports the SDK (type-only imports are erased and allowed)", () => {
    for (const f of files) {
      if (rel(f) === 'lib/firebase-sdk.ts') continue;
      const src = readFileSync(f, 'utf8');
      const valueImports = src.match(/^\s*(import|export)\s+(?!type\b)[^;]*?from\s+['"]firebase\//gm) ?? [];
      expect(valueImports, rel(f)).toEqual([]);
      expect(/import\(\s*['"]firebase\//.test(src), rel(f)).toBe(false);
    }
  });

  test('firebase-sdk is only loaded with import() from lib/firebase.ts, and sync only with import()', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const staticSdk = /from\s+['"][./]*(lib\/)?firebase-sdk['"]/.test(src);
      expect(staticSdk, rel(f)).toBe(false);
      if (rel(f) !== 'lib/firebase.ts') expect(/import\(\s*['"][^'"]*firebase-sdk['"]\s*\)/.test(src.replace(/typeof import\([^)]*\)/g, '')), rel(f)).toBe(false);
      expect(/from\s+['"][./]*(lib\/)?sync['"]/.test(src), rel(f)).toBe(false);
    }
  });
});

describe('profileName (the name the rules accept)', () => {
  test('cuts at 40 UTF-16 units, never inside an emoji', () => {
    expect(profileName('🧪'.repeat(20))).toBe('🧪'.repeat(20));
    expect(profileName('🧪'.repeat(25))).toBe('🧪'.repeat(20));
    // 39 letters and an emoji would be 41 units: the emoji goes whole.
    expect(profileName('a'.repeat(39) + '🧪')).toBe('a'.repeat(39));
    expect(profileName('a'.repeat(38) + '🧪')).toBe('a'.repeat(38) + '🧪');
    expect(profileName('a'.repeat(35) + '🧪🧪🧪')).toBe('a'.repeat(35) + '🧪🧪');
    for (const raw of ['🧪'.repeat(25), 'x'.repeat(80), 'a'.repeat(39) + '🧪', '  Sam  ']) {
      const n = profileName(raw);
      expect(n.length).toBeLessThanOrEqual(MAX_NAME);
      // No lone surrogate: every code point is whole.
      expect(Array.from(n).every((ch) => !/^[\uD800-\uDFFF]$/.test(ch))).toBe(true);
    }
    expect(profileName('   ')).toBe('Student');
  });
});

describe('belowOthers (section 5.3)', () => {
  const slot = (xp: number): Slot => ({ xp, rounds: 1, placements: 0, mistakes: 0, quizzes: 0, playMs: 0, day: '', dayXp: 0 });
  test('a store holding less than the other replicas already counted is detected', () => {
    expect(belowOthers({ ...EMPTY_PROGRESS }, { a: slot(275) })).toBe(true);
    expect(belowOthers({ ...EMPTY_PROGRESS, xp: 275, stats: { ...EMPTY_PROGRESS.stats, rounds: 1 } }, { a: slot(275) })).toBe(false);
    expect(belowOthers({ ...EMPTY_PROGRESS }, {})).toBe(false);
  });
});
