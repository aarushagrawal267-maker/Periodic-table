import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { MAX_NAME, SCHEMA_VERSION, emptySynced, profileName, type SyncedProgress, type SyncedSettings } from '../src/lib/merge';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-periodica',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env?.cleanup());
beforeEach(() => env.clearFirestore());

const settings = (): SyncedSettings => ({
  values: { sound: true, haptics: true, reduceMotion: false, colorblind: false, difficulty: 'standard', quizTimer: true },
  at: { difficulty: 1_700_000_000_000 },
});

const progress = (): SyncedProgress => ({
  ...emptySynced(0),
  slots: { 'device-aaaa': { xp: 120, rounds: 2, placements: 20, mistakes: 1, quizzes: 0, playMs: 61_000.5, day: '2026-11-20', dayXp: 120 } },
  mastery: { '1': { s: 4, c: 4, w: 0, t: 1_700_000_000_000 } },
  daily: { results: { '2026-11-20': { score: 1000, timeMs: 50_000, mistakes: 0, stars: 3, trail: ['hit'] } }, streak: 1, bestStreak: 1, lastKey: '2026-11-20' },
  explored: [1, 8],
});

/** A valid document as sync.ts writes it. */
const validDoc = (over: Record<string, unknown> = {}) => ({
  schemaVersion: SCHEMA_VERSION,
  profile: { name: 'Sam' },
  progress: progress(),
  settings: settings(),
  clientId: 'device-aaaa-bbbb',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...over,
});

const db = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const sam = () => doc(db('sam'), 'users/sam');

/** A minute ago: an update now is well past the one-save-a-second limit. */
const aMinuteAgo = () => Timestamp.fromMillis(Date.now() - 60_000);

/** Writes a valid document for sam with rules off, for update and read cases. Last saved a minute ago. */
async function seed(over: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/sam'), validDoc({ updatedAt: aMinuteAgo(), ...over }));
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const many = <T>(n: number, f: (i: number) => T): Record<string, T> => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), f(i)]));

describe('owner', () => {
  test('creates a valid document, reads, updates and deletes it', async () => {
    await assertSucceeds(setDoc(sam(), validDoc()));
    await assertSucceeds(getDoc(sam()));
    const snap = await getDoc(sam());
    await sleep(1100);
    await assertSucceeds(setDoc(sam(), validDoc({ createdAt: snap.data()!.createdAt, schemaVersion: 1 })));
    await assertSucceeds(deleteDoc(sam()));
  });

  test('saves at most once a second (docs/ACCOUNTS.md 6.1)', async () => {
    await assertSucceeds(setDoc(sam(), validDoc()));
    const createdAt = (await getDoc(sam())).data()!.createdAt;
    // Straight after the last save: refused. A write loop gets one save a second at most.
    await assertFails(setDoc(sam(), validDoc({ createdAt })));
    await sleep(1100);
    await assertSucceeds(setDoc(sam(), validDoc({ createdAt })));
    await assertFails(setDoc(sam(), validDoc({ createdAt })));
    // Deleting is never held back.
    await assertSucceeds(deleteDoc(sam()));
  });
});

describe('everyone else', () => {
  test('nobody else can create the document', async () => {
    await assertFails(setDoc(doc(db('mallory'), 'users/sam'), validDoc()));
    await assertFails(setDoc(doc(db(null), 'users/sam'), validDoc()));
    // Not even a valid document of their own under someone else's id.
    await assertFails(setDoc(doc(db('sam'), 'users/mallory'), validDoc()));
  });

  test('signed out cannot update or delete', async () => {
    await seed();
    const ref = doc(db(null), 'users/sam');
    await assertFails(updateDoc(ref, { 'profile.name': 'x', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ref, validDoc()));
    await assertFails(deleteDoc(ref));
  });

  test('another user cannot get, update or delete; signed out cannot get; nobody lists', async () => {
    await seed();
    const ref = doc(db('mallory'), 'users/sam');
    await assertFails(getDoc(ref));
    await assertFails(updateDoc(ref, { 'profile.name': 'x', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(ref));
    await assertFails(getDoc(doc(db(null), 'users/sam')));
    await assertFails(getDocs(collection(db('sam'), 'users')));
  });

  test('any other collection is closed', async () => {
    await assertFails(getDoc(doc(db('sam'), 'classes/one')));
    await assertFails(setDoc(doc(db('sam'), 'classes/one'), { a: 1 }));
    await assertFails(setDoc(doc(db('sam'), 'users/sam/rounds/1'), { a: 1 }));
  });
});

describe('create fails on a bad shape', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['an extra top-level field', { extra: true }],
    ['missing progress', { progress: undefined }],
    ['missing settings', { settings: undefined }],
    ['updatedAt as a client time', { updatedAt: Timestamp.now() }],
    ['createdAt not the request time', { createdAt: Timestamp.fromMillis(1000) }],
    ['schemaVersion 0', { schemaVersion: 0 }],
    ['schemaVersion as a string', { schemaVersion: '1' }],
    ['a 7 character clientId', { clientId: '1234567' }],
    ['a 65 character clientId', { clientId: 'x'.repeat(65) }],
    ['an empty name', { profile: { name: '' } }],
    ['a 41 character name', { profile: { name: 'x'.repeat(41) } }],
    // size() counts UTF-16 units: 21 emoji are 42 (docs/ACCOUNTS.md 7.5).
    ['a name of 21 emoji', { profile: { name: '🧪'.repeat(21) } }],
  ];
  for (const [label, over] of cases) {
    test(label, async () => {
      const d = validDoc(over);
      for (const k of Object.keys(d)) if ((d as Record<string, unknown>)[k] === undefined) delete (d as Record<string, unknown>)[k];
      await assertFails(setDoc(sam(), d));
    });
  }
});

describe('update fails', () => {
  test('when createdAt changes', async () => {
    await seed();
    await assertFails(setDoc(sam(), validDoc({ createdAt: Timestamp.fromMillis(1000) })));
  });
  test('when an existing createdAt changes, even to the request time', async () => {
    await seed();
    await assertFails(setDoc(sam(), validDoc({ createdAt: serverTimestamp() })));
  });
  test('when schemaVersion goes down', async () => {
    await seed({ schemaVersion: 2 });
    const snap = await getDoc(sam());
    await assertFails(setDoc(sam(), validDoc({ createdAt: snap.data()!.createdAt, schemaVersion: 1 })));
  });
});

describe('a stored document without createdAt', () => {
  // Written by hand or by a tool. sync.ts sends serverTimestamp() for createdAt when the stored copy has none.
  async function seedWithoutCreatedAt() {
    await seed();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'users/sam'), { createdAt: deleteField() });
    });
  }

  test('is healed with the request time, and then keeps it', async () => {
    await seedWithoutCreatedAt();
    await assertSucceeds(setDoc(sam(), validDoc({ createdAt: serverTimestamp() })));
    const createdAt = (await getDoc(sam())).data()!.createdAt;
    expect(createdAt).toBeInstanceOf(Timestamp);
    await sleep(1100);
    await assertFails(setDoc(sam(), validDoc({ createdAt: Timestamp.fromMillis(1000) })));
    await assertSucceeds(setDoc(sam(), validDoc({ createdAt })));
  });
  test('cannot be given an arbitrary time', async () => {
    await seedWithoutCreatedAt();
    await assertFails(setDoc(sam(), validDoc({ createdAt: Timestamp.fromMillis(1000) })));
    await assertFails(setDoc(sam(), validDoc({ createdAt: Timestamp.now() })));
  });
  test('cannot be saved still without one', async () => {
    await seedWithoutCreatedAt();
    const { createdAt: _, ...withoutCreatedAt } = validDoc();
    await assertFails(setDoc(sam(), withoutCreatedAt));
  });
});

describe('progress limits', () => {
  const withProgress = (over: Partial<SyncedProgress> & Record<string, unknown>) => validDoc({ progress: { ...progress(), ...over } });
  const result = { score: 1, timeMs: 1, mistakes: 0, stars: 1, trail: [] };
  const cases: [string, Record<string, unknown>][] = [
    ['119 mastery keys', { mastery: many(119, () => ({ s: 1, c: 1, w: 0, t: 1 })) }],
    ['119 explored', { explored: Array.from({ length: 119 }, (_, i) => i + 1) }],
    ['501 slots', { slots: many(501, () => ({ xp: 1, rounds: 0, placements: 0, mistakes: 0, quizzes: 0, playMs: 0, day: '', dayXp: 0 })) }],
    ['401 daily results', { daily: { results: many(401, () => result), streak: 0, bestStreak: 0, lastKey: null } }],
    ['65 best keys', { best: many(65, () => ({ score: 1, stars: 1, timeMs: 1 })) }],
    ['an unknown key', { coins: 5 }],
    ['lastKey "yesterday"', { daily: { results: {}, streak: 0, bestStreak: 0, lastKey: 'yesterday' } }],
    ['a negative epoch', { epoch: -1 }],
    ['a fractional bestCombo', { bestCombo: 1.5 }],
    ['an explored element 0', { explored: [0, 8] }],
    ['an explored element 119', { explored: [119] }],
    ['an explored string', { explored: ['8'] }],
  ];
  for (const [label, over] of cases) test(label, () => assertFails(setDoc(sam(), withProgress(over))));
  test('the bounds themselves pass', async () => {
    await assertSucceeds(
      setDoc(
        sam(),
        withProgress({
          mastery: many(118, () => ({ s: 1, c: 1, w: 0, t: 1 })),
          explored: Array.from({ length: 118 }, (_, i) => i + 1),
          slots: many(500, () => ({ xp: 1, rounds: 0, placements: 0, mistakes: 0, quizzes: 0, playMs: 0, day: '', dayXp: 0 })),
        }),
      ),
    );
  });
});

describe('size', () => {
  test('a document over Firestore\'s 1 MiB limit is refused even when the rules would pass it', async () => {
    // The rules bound every map and list by count; they cannot loop over entries, so an entry's size is
    // bounded by Firestore itself (docs/ACCOUNTS.md 6.1). 118 mastery entries of 9 KB each pass the counts.
    const fat = many(118, () => ({ s: 1, c: 1, w: 0, t: 1, pad: 'x'.repeat(9_000) }));
    const err = await setDoc(sam(), validDoc({ progress: { ...progress(), mastery: fat } })).then(() => null, (e: { code?: string; message?: string }) => e);
    // Refused for its size, not by a rule.
    expect(err).toMatchObject({ code: 'invalid-argument' });
    expect(err?.message).toMatch(/maximum entity size/);
    await env.withSecurityRulesDisabled(async (ctx) => {
      expect((await getDoc(doc(ctx.firestore(), 'users/sam'))).exists()).toBe(false);
    });
  });

  test('the largest document sync can write is accepted', async () => {
    // Every bound at its cap, with full daily trails: the worst case of docs/ACCOUNTS.md 3.3.
    const trail = Array.from({ length: 64 }, (_, i) => (i % 3 ? 'hit' : 'miss'));
    const day = (i: number) => new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
    await assertSucceeds(
      setDoc(
        sam(),
        validDoc({
          progress: {
            ...progress(),
            mastery: many(118, (i) => ({ s: 5, c: 1000 + i, w: 1000, t: 1_700_000_000_000 + i })),
            explored: Array.from({ length: 118 }, (_, i) => i + 1),
            slots: many(500, () => ({ xp: 123_456, rounds: 1234, placements: 23_456, mistakes: 3456, quizzes: 456, playMs: 123_456_789, day: '2026-11-20', dayXp: 1234 })),
            daily: {
              results: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [day(i), { score: 12_345, timeMs: 123_456, mistakes: 12, stars: 3, trail }])),
              streak: 400,
              bestStreak: 400,
              lastKey: day(399),
            },
            best: many(64, () => ({ score: 99_999, stars: 3, timeMs: 999_999 })),
            achievements: many(19, () => 1_700_000_000_000),
            chapters: many(13, () => 3),
          },
        }),
      ),
    );
  });
});

describe('settings limits', () => {
  const withValues = (over: Record<string, unknown>) => validDoc({ settings: { values: { ...settings().values, ...over }, at: {} } });
  test("difficulty 'hard'", () => assertFails(setDoc(sam(), withValues({ difficulty: 'hard' }))));
  test("sound 'yes'", () => assertFails(setDoc(sam(), withValues({ sound: 'yes' }))));
  test('a seventh key', () => assertFails(setDoc(sam(), withValues({ theme: 'dark' }))));
  test('an unknown key in at', () => assertFails(setDoc(sam(), validDoc({ settings: { values: settings().values, at: { theme: 1 } } }))));
  const withAt = (at: Record<string, unknown>) => validDoc({ settings: { values: settings().values, at } });
  test('a time in at that is a string', () => assertFails(setDoc(sam(), withAt({ sound: 'x'.repeat(1000) }))));
  test('a time in at that is a map', () => assertFails(setDoc(sam(), withAt({ difficulty: { a: 1 } }))));
  test('a negative time in at', () => assertFails(setDoc(sam(), withAt({ haptics: -1 }))));
  test('every key with a time passes', () =>
    assertSucceeds(setDoc(sam(), withAt({ sound: 1, haptics: 2, reduceMotion: 3, colorblind: 4, difficulty: 1_795_000_000_000, quizTimer: 6 }))));
});

describe('names', () => {
  test('profileName always gives a name the rules accept, emoji included', async () => {
    for (const raw of ['🧪'.repeat(25), 'a'.repeat(39) + '🧪', 'a'.repeat(35) + '🧪🧪🧪', '  ', 'x'.repeat(80), '👩🏽‍🔬'.repeat(10)]) {
      const name = profileName(raw);
      expect(name.length).toBeLessThanOrEqual(MAX_NAME);
      await env.clearFirestore();
      await assertSucceeds(setDoc(sam(), validDoc({ profile: { name } })));
    }
  });
  test('20 emoji, 40 UTF-16 units, are accepted', () => assertSucceeds(setDoc(sam(), validDoc({ profile: { name: '🧪'.repeat(20) } }))));
});
