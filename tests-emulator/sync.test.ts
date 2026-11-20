/**
 * Account sync against the auth and Firestore emulators (docs/ACCOUNTS.md section 5).
 *
 * Every device is a separate process with its own copy of the app (tests-emulator/support/device-process.mjs),
 * driven through the same public API the account screen uses: src/lib/account.ts and the stores. The
 * Firestore document is read as an administrator through the emulator's REST API, so what the test sees
 * is what the server holds, not what the app believes.
 *
 * Each test creates its own account with a unique email, so tests never share data. Waits are on
 * conditions (`device.until`, `waitFor`); the only fixed waits are the quiet windows that prove nothing
 * more is written, which by nature must last longer than the save debounce.
 *
 * Run with `npm run test:accounts` (starts the emulators). `npx vitest run` never picks this file up.
 */
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { RoundSummary } from '../src/store/progress';
import { Device, type DeviceCtx, type DeviceSeed } from './support/device';
import { assertEmulatorsUp, deleteUserDoc, lookupAuthUser, oobLinks, readUserDoc, total, uniqueEmail, waitFor } from './support/emulator';

const PASSWORD = 'correct horse';
/** Longer than the 2 s save debounce plus a transaction round trip (section 5.4). */
const QUIET_MS = 5000;

// ---------- devices ----------

let devices: Device[] = [];

async function device(name: string, seed?: DeviceSeed): Promise<Device> {
  const d = await Device.start(name, seed);
  devices.push(d);
  return d;
}

beforeAll(assertEmulatorsUp);

afterEach(async (ctx) => {
  if (ctx.task.result?.state === 'fail') {
    for (const d of devices) console.error(`\n----- ${d.name} output -----\n${d.logs() || '(nothing)'}`);
  }
  await Promise.all(devices.map((d) => d.close()));
  devices = [];
});

// ---------- rounds a student could play ----------

const lesson = (regionId: string, results: Record<number, boolean>): RoundSummary => ({
  kind: 'lesson',
  regionId,
  difficulty: 'learner',
  score: 500,
  correct: Object.values(results).filter(Boolean).length,
  mistakes: Object.values(results).filter((ok) => !ok).length,
  hints: 0,
  timeMs: 30_000,
  maxCombo: 2,
  stars: 3,
  completed: true,
  results,
  trail: Object.values(results).map((ok) => (ok ? 'hit' : 'miss')),
});

const quiz = (results: Record<number, boolean>): RoundSummary => ({
  ...lesson('quiz', results),
  kind: 'quiz',
  regionId: undefined,
  difficulty: 'standard',
  score: 800,
  stars: 2,
  timeMs: 45_000,
  maxCombo: 4,
});

const place = (regionId: string): RoundSummary => ({
  ...lesson(regionId, { 11: true, 12: true, 13: true }),
  kind: 'place',
  difficulty: 'standard',
  score: 1500,
  stars: 3,
  timeMs: 70_000,
  maxCombo: 7,
});

// ---------- what the tests ask a device ----------

/** Plays one round on the device; returns the XP it earned. */
const play = (d: Device, r: RoundSummary) => d.run((c, round) => c.useProgress.getState().recordRound(round).xpGained, r);

/** The device's local state, as plain data. */
function view(c: DeviceCtx) {
  const p = c.useProgress.getState();
  const s = c.useSettings.getState();
  const a = c.useAuth.getState();
  return {
    xp: p.xp,
    stats: p.stats,
    today: p.today,
    explored: p.explored,
    chapters: p.chapters,
    best: p.best,
    mastery: p.mastery,
    achievements: p.achievements,
    daily: p.daily,
    settings: { sound: s.sound, haptics: s.haptics, reduceMotion: s.reduceMotion, colorblind: s.colorblind, difficulty: s.difficulty, quizTimer: s.quizTimer },
    status: a.status,
    sync: a.sync,
    notice: a.notice,
    error: a.error,
    user: a.user,
    meta: c.syncMeta.readMeta(),
    unsaved: c.sync.hasUnsavedChanges(),
    leftover: a.leftover,
  };
}
type View = ReturnType<typeof view>;

const look = (d: Device): Promise<View> => d.run(view);

/** Signed in, nothing left to save, and the status line says so. */
const settled = (d: Device) =>
  d.until('everything saved', (c) => c.useAuth.getState().status === 'signed-in' && c.useAuth.getState().sync === 'saved' && !c.sync.hasUnsavedChanges());

/** Not a shared computer unless a test says so (section 5.6.9 has its own tests). */
async function signUp(d: Device, name: string, email: string, shared = false): Promise<string> {
  const r = await d.run((c, a) => c.account.signUpWithEmail(a.name, a.email, a.password, { shared: a.shared }), { name, email, password: PASSWORD, shared });
  expect(r).toEqual({ ok: true });
  await settled(d);
  return (await look(d)).user!.uid;
}

async function signIn(d: Device, email: string, shared = false): Promise<string> {
  const r = await d.run((c, a) => c.account.signInWithEmail(a.email, a.password, { shared: a.shared }), { email, password: PASSWORD, shared });
  expect(r).toEqual({ ok: true });
  await settled(d);
  return (await look(d)).user!.uid;
}

/** The document before and after a quiet window: proves that nobody writes once everything is saved. */
async function quietDoc(uid: string) {
  const before = await readUserDoc(uid);
  await new Promise((r) => setTimeout(r, QUIET_MS));
  const after = await readUserDoc(uid);
  return { before, after };
}

/** A device that holds nothing of anyone's: what sign out and delete must leave behind. */
function expectFreshGuest(v: View, deviceId: string, defaults: View['settings']) {
  expect(v.status).toBe('guest');
  expect(v.user).toBeNull();
  expect(v.xp).toBe(0);
  expect(v.stats).toEqual({ rounds: 0, placements: 0, mistakes: 0, quizzes: 0, bestCombo: 0, playMs: 0 });
  expect(v.explored).toEqual([]);
  expect(v.chapters).toEqual({});
  expect(v.mastery).toEqual({});
  expect(v.best).toEqual({});
  expect(v.achievements).toEqual({});
  expect(v.daily.results).toEqual({});
  expect(v.settings).toEqual(defaults);
  // Ownership is gone; the browser's replica id stays (section 5.6.4).
  expect(v.meta).toMatchObject({ owner: null, user: null, others: {}, epoch: 0, docSeen: false, pendingAdoption: null, deviceId });
}

/** What zustand saved to localStorage: what a reload of the page would start from. */
const persisted = (d: Device) =>
  d.run((c) => ({
    progress: JSON.parse(c.storage.getItem('periodica-progress') ?? 'null')?.state ?? null,
    settings: JSON.parse(c.storage.getItem('periodica-settings') ?? 'null')?.state ?? null,
  }));

// ---------- guest progress merges into the account (section 5.2, cases B and C) ----------

describe('guest progress merges into the account', () => {
  test('a guest who creates an account keeps everything, and the account holds it exactly once', async () => {
    const a = await device('A');
    const xp1 = await play(a, lesson('lightest-ten', { 1: true, 2: true }));
    const xp2 = await play(a, quiz({ 6: true, 7: false, 8: true }));
    await a.run((c) => {
      c.useProgress.getState().markExplored(26);
      c.useProgress.getState().markExplored(79);
      c.useSettings.getState().set({ difficulty: 'expert' });
    });
    const guest = await look(a);
    expect(guest.xp).toBe(xp1 + xp2);

    const uid = await signUp(a, 'Sam Lee', uniqueEmail('merge-new'));
    const after = await look(a);
    const doc = await readUserDoc(uid);

    // The account holds the guest's progress, once.
    expect(doc).not.toBeNull();
    expect(doc!.schemaVersion).toBe(1);
    expect(doc!.profile).toEqual({ name: 'Sam Lee' });
    expect(total(doc, 'xp')).toBe(guest.xp);
    expect(total(doc, 'rounds')).toBe(guest.stats.rounds);
    expect(total(doc, 'placements')).toBe(guest.stats.placements);
    expect(total(doc, 'mistakes')).toBe(guest.stats.mistakes);
    expect(total(doc, 'quizzes')).toBe(1);
    expect(total(doc, 'playMs')).toBe(guest.stats.playMs);
    expect(doc!.progress.explored).toEqual([26, 79]);
    expect(doc!.progress.chapters).toEqual({ 'lightest-ten': 3 });
    expect(Object.keys(doc!.progress.mastery).sort()).toEqual(['1', '2', '6', '7', '8']);
    expect(Object.keys(doc!.progress.achievements).sort()).toEqual(Object.keys(guest.achievements).sort());
    expect(doc!.settings.values.difficulty).toBe('expert');
    expect(doc!.clientId).toBe(after.meta.deviceId);

    // Nothing on the device changed: the merge never adds the guest's play a second time.
    expect(after.xp).toBe(guest.xp);
    expect(after.stats).toEqual(guest.stats);
    expect(after.settings.difficulty).toBe('expert');
    expect(after.user).toMatchObject({ uid, name: 'Sam Lee', provider: 'password', initials: 'SL' });
    expect(after.meta.owner).toBe(uid);
    expect(after.meta.pendingAdoption).toBeNull();

    // Saving again, explicitly, adds nothing.
    expect(await a.run((c) => c.sync.flushNow())).toBe('saved');
    expect(total(await readUserDoc(uid))).toBe(guest.xp);
  });

  test('a guest who signs in to an account with progress gets the sum, on this device and the other', async () => {
    const email = uniqueEmail('merge-existing');
    const a = await device('A');
    const uid = await signUp(a, 'Ada', email);
    const xpA = await play(a, lesson('alkali', { 3: true, 11: true, 19: true }));
    await settled(a);

    // A second computer, used as a guest first.
    const b = await device('B');
    const xpB = await play(b, place('first-20'));
    await b.run((c) => c.useProgress.getState().markExplored(8));
    expect(await signIn(b, email)).toBe(uid);

    const sum = xpA + xpB;
    await b.until('B shows the sum', (c, want) => c.useProgress.getState().xp === want, sum);
    await a.until('A shows the sum', (c, want) => c.useProgress.getState().xp === want, sum);
    await settled(a);
    await settled(b);

    const doc = await readUserDoc(uid);
    expect(total(doc)).toBe(sum);
    expect(total(doc, 'rounds')).toBe(2);
    expect(doc!.progress.chapters).toEqual({ alkali: 3 });
    expect(Object.keys(doc!.progress.best)).toEqual(['first-20:standard']);
    expect(doc!.progress.explored).toEqual([8]);

    // Both devices hold the same joined progress.
    const [va, vb] = await Promise.all([look(a), look(b)]);
    for (const v of [va, vb]) {
      expect(v.xp).toBe(sum);
      expect(v.stats.rounds).toBe(2);
      expect(v.explored).toEqual([8]);
      expect(v.chapters).toEqual({ alkali: 3 });
      expect(Object.keys(v.best)).toEqual(['first-20:standard']);
    }
  });
});

// ---------- two devices (section 5.6.1, 5.6.2) ----------

describe('two devices on one account', () => {
  test('the second device receives progress and settings as they are saved', async () => {
    const email = uniqueEmail('two-devices');
    const a = await device('A');
    const uid = await signUp(a, 'Bo', email);
    const first = await play(a, lesson('lightest-ten', { 1: true, 2: true }));
    await settled(a);

    // B signs in with nothing of its own (case C): the first snapshot fills it.
    const b = await device('B');
    await signIn(b, email);
    await b.until('B restored', (c, want) => c.useProgress.getState().xp === want, first);

    // A plays: B's total rises by exactly A's new XP, and B adds no slot of its own.
    const second = await play(a, quiz({ 9: true, 10: true }));
    await a.run((c) => {
      c.useProgress.getState().markExplored(2);
      c.useSettings.getState().set({ difficulty: 'learner', sound: false });
    });
    await b.until("B gets A's round", (c, want) => c.useProgress.getState().xp === want, first + second);
    await b.until("B gets A's settings", (c) => c.useSettings.getState().difficulty === 'learner' && !c.useSettings.getState().sound);
    await settled(a);
    await settled(b);

    const vb = await look(b);
    expect(vb.stats.rounds).toBe(2);
    expect(vb.stats.quizzes).toBe(1);
    expect(vb.explored).toEqual([2]);
    const doc = await readUserDoc(uid);
    expect(total(doc)).toBe(first + second);
    expect(Object.keys(doc!.progress.slots)).toEqual([(await look(a)).meta.deviceId]);
    expect(doc!.settings.values).toMatchObject({ difficulty: 'learner', sound: false });

    // And the other way round.
    const third = await play(b, lesson('next-ten', { 4: true, 5: true }));
    await a.until("A gets B's round", (c, want) => c.useProgress.getState().xp === want, first + second + third);
    await settled(a);
    await settled(b);
    expect(total(await readUserDoc(uid))).toBe(first + second + third);
  });

  test('offline play on both devices merges on reconnect without loss or double counting', async () => {
    const email = uniqueEmail('offline');
    const a = await device('A');
    const uid = await signUp(a, 'Cy', email);
    const base = await play(a, lesson('lightest-ten', { 1: true, 2: true }));
    await settled(a);
    const b = await device('B');
    await signIn(b, email);
    await b.until('B restored', (c, want) => c.useProgress.getState().xp === want, base);
    await settled(b);
    const savedBefore = await readUserDoc(uid);

    await Promise.all([a.offline(), b.offline()]);

    // Different play on each, some of it on the same elements.
    const a1 = await play(a, lesson('alkali', { 3: true, 11: true }));
    const a2 = await play(a, place('first-20'));
    const b1 = await play(b, quiz({ 1: false, 11: true, 17: true }));
    const b2 = await play(b, lesson('halogens', { 9: true, 17: true }));
    await a.run((c) => c.useProgress.getState().markExplored(30));
    await b.run((c) => c.useProgress.getState().markExplored(31));
    await a.until('A says offline', (c) => c.useAuth.getState().sync === 'offline');
    await b.until('B says offline', (c) => c.useAuth.getState().sync === 'offline');

    // Nothing reached the server while offline, and each device kept its own play.
    expect((await readUserDoc(uid))!.updateTime).toBe(savedBefore!.updateTime);
    expect((await look(a)).xp).toBe(base + a1 + a2);
    expect((await look(b)).xp).toBe(base + b1 + b2);

    // Both come back at the same moment, so their saves race.
    await Promise.all([a.online(), b.online()]);
    const want = base + a1 + a2 + b1 + b2;
    await a.until('A shows everything', (c, w) => c.useProgress.getState().xp === w, want, 30_000);
    await b.until('B shows everything', (c, w) => c.useProgress.getState().xp === w, want, 30_000);
    await settled(a);
    await settled(b);

    const doc = await readUserDoc(uid);
    expect(total(doc)).toBe(want);
    expect(total(doc, 'rounds')).toBe(5);
    expect(total(doc, 'quizzes')).toBe(1);
    expect(doc!.progress.explored).toEqual([30, 31]);
    expect(doc!.progress.chapters).toEqual({ 'lightest-ten': 3, alkali: 3, halogens: 3 });
    const [va, vb] = await Promise.all([look(a), look(b)]);
    for (const v of [va, vb]) {
      expect(v.xp).toBe(want);
      expect(v.stats.rounds).toBe(5);
      expect(v.stats.placements).toBe(total(doc, 'placements'));
      expect(v.stats.mistakes).toBe(total(doc, 'mistakes'));
      expect(v.stats.playMs).toBe(total(doc, 'playMs'));
      expect(v.explored).toEqual([30, 31]);
      expect(v.chapters).toEqual(doc!.progress.chapters);
      expect(v.today.xp).toBe(want);
    }
    // The two devices agree on every element, whichever practised it last.
    expect(va.mastery).toEqual(vb.mastery);

    // Echo guard (section 5.5): once settled, nobody writes again, and saving again adds nothing.
    const { before, after } = await quietDoc(uid);
    expect(after!.updateTime).toBe(before!.updateTime);
    expect(await a.run((c) => c.sync.flushNow())).toBe('saved');
    expect(await b.run((c) => c.sync.flushNow())).toBe('saved');
    expect(total(await readUserDoc(uid))).toBe(want);
    expect((await look(a)).xp).toBe(want);
  });

  test('reset progress on one device empties the account on the other', async () => {
    const email = uniqueEmail('reset');
    const a = await device('A');
    const uid = await signUp(a, 'Di', email);
    await play(a, lesson('lightest-ten', { 1: true, 2: true }));
    await settled(a);
    const b = await device('B');
    await signIn(b, email);
    await b.until('B restored', (c) => c.useProgress.getState().xp > 0);

    await a.run((c) => c.useProgress.getState().reset());
    await b.until('B is reset', (c) => c.useProgress.getState().xp === 0 && c.useProgress.getState().stats.rounds === 0);
    await settled(a);
    await settled(b);

    const doc = await readUserDoc(uid);
    expect(doc!.progress.epoch).toBe(1);
    expect(total(doc)).toBe(0);
    expect(doc!.progress.chapters).toEqual({});

    // New play after the reset counts from zero everywhere.
    const xp = await play(b, quiz({ 1: true }));
    await a.until('A gets play after the reset', (c, w) => c.useProgress.getState().xp === w, xp);
    await settled(b);
    expect(total(await readUserDoc(uid))).toBe(xp);
  });
});

// ---------- sign out (section 5.6.4) ----------

describe('sign out', () => {
  test('saves what is left, leaves a fresh guest device, and signing in again restores it once', async () => {
    const email = uniqueEmail('sign-out');
    const a = await device('A');
    const uid = await signUp(a, 'Eve', email);
    const xp1 = await play(a, lesson('lightest-ten', { 1: true, 2: true }));
    await settled(a);
    // Played just before signing out, inside the save debounce: sign out must save it first.
    const xp2 = await play(a, quiz({ 6: true }));
    await a.run((c) => c.useSettings.getState().set({ colorblind: true, quizTimer: false }));
    const before = await look(a);
    expect(before.unsaved).toBe(true);

    expect(await a.run((c) => c.account.signOutAndReset())).toEqual({ ok: true });

    const doc = await readUserDoc(uid);
    expect(total(doc)).toBe(xp1 + xp2);
    expect(doc!.settings.values).toMatchObject({ colorblind: true, quizTimer: false });

    const out = await look(a);
    const defaults = await a.run((c) => c.defaultSettings());
    expectFreshGuest(out, before.meta.deviceId, defaults);
    expect(out.notice).toBe('signed-out');
    expect(out.sync).toBe('idle');
    // The saved copies are fresh too: a reload of the page starts as a guest with nothing.
    const saved = await persisted(a);
    expect(saved.progress).toMatchObject({ xp: 0, explored: [], chapters: {} });
    expect(saved.settings).toMatchObject(defaults);
    expect(await a.run((c) => c.firebase.loadedFirebase()?.auth.currentUser?.uid ?? null)).toBeNull();

    // Signing in again brings everything back, and counts nothing twice.
    await signIn(a, email);
    await a.until('restored', (c, w) => c.useProgress.getState().xp === w, xp1 + xp2);
    const back = await look(a);
    expect(back.stats.rounds).toBe(2);
    expect(back.settings).toMatchObject({ colorblind: true, quizTimer: false });
    const { after } = await quietDoc(uid);
    expect(total(after)).toBe(xp1 + xp2);
  });

  test('offline with unsaved play, sign out asks first and keeps everything', async () => {
    const email = uniqueEmail('sign-out-offline');
    const a = await device('A');
    const uid = await signUp(a, 'Fin', email);
    await a.offline();
    const xp = await play(a, lesson('alkali', { 3: true }));

    expect(await a.run((c) => c.account.signOutAndReset())).toEqual({ ok: false, reason: 'unsaved' });
    const still = await look(a);
    expect(still.status).toBe('signed-in');
    expect(still.xp).toBe(xp);
    expect(still.meta.owner).toBe(uid);

    // Back online the play is saved, then signing out works.
    await a.online();
    await settled(a);
    expect(total(await readUserDoc(uid))).toBe(xp);
    expect(await a.run((c) => c.account.signOutAndReset())).toEqual({ ok: true });
    expect((await look(a)).xp).toBe(0);
  });
});

// ---------- delete account (section 5.6.5, 5.6.3) ----------

describe('delete account', () => {
  test('removes the document and the login; this device and the other become fresh guests', async () => {
    const email = uniqueEmail('delete');
    const a = await device('A');
    const uid = await signUp(a, 'Gus', email);
    await play(a, lesson('lightest-ten', { 1: true, 2: true }));
    await settled(a);
    // A second device is online and listening while the account is deleted.
    const b = await device('B');
    await signIn(b, email);
    await b.until('B restored', (c) => c.useProgress.getState().xp > 0);
    await settled(b);
    const [ida, idb] = [(await look(a)).meta.deviceId, (await look(b)).meta.deviceId];
    const defaults = await a.run((c) => c.defaultSettings());
    // A slow network on A: the login is deleted 1.5 s after the document. B sees the document gone while
    // the login still exists, and must not take that for a hand edit and rebuild the document.
    await a.run((c) => c.net.slow('accounts:delete', 1500));

    expect(await a.run((c) => c.account.deleteAccount())).toEqual({ ok: true });

    expect(await lookupAuthUser(uid)).toBeNull();
    const va = await look(a);
    expectFreshGuest(va, ida, defaults);
    expect(va.notice).toBe('deleted');

    // The other device notices, clears itself, and never brings the document back.
    await b.until('B learns the account is gone', (c) => c.useAuth.getState().notice === 'deleted-elsewhere', undefined, 30_000);
    expectFreshGuest(await look(b), idb, defaults);
    const { before, after } = await quietDoc(uid);
    expect(before).toBeNull();
    expect(after).toBeNull();
  });

  test('a document removed by hand, with the login still there, is rebuilt from the device', async () => {
    const a = await device('A');
    const uid = await signUp(a, 'Ivy', uniqueEmail('heal'));
    const xp = await play(a, lesson('lightest-ten', { 1: true, 2: true }));
    await settled(a);

    await deleteUserDoc(uid);
    // After the grace period the device decides this was not an account deletion and saves its copy back.
    await waitFor('the document is back', () => readUserDoc(uid), 30_000);
    await settled(a);
    expect(total(await readUserDoc(uid))).toBe(xp);
    const v = await look(a);
    expect(v.status).toBe('signed-in');
    expect(v.notice).toBeNull();
    expect(v.xp).toBe(xp);
  });

  test('an old sign-in must sign in again before the account can be deleted', async () => {
    const email = uniqueEmail('delete-reauth');
    const a = await device('A');
    const uid = await signUp(a, 'Hal', email);

    // Six minutes later (RECENT_SIGN_IN_MS is five).
    await a.run((c) => c.clock.advance(6 * 60_000));
    expect(await a.run((c) => c.account.deleteAccount())).toEqual({ ok: false, reason: 'reauth', message: null });
    expect(await readUserDoc(uid)).not.toBeNull();
    expect((await look(a)).status).toBe('signed-in');

    expect(await a.run((c, p) => c.account.reauthenticate(p), 'wrong password')).toMatchObject({ ok: false });
    expect(await a.run((c, p) => c.account.reauthenticate(p), PASSWORD)).toEqual({ ok: true });
    expect(await a.run((c) => c.account.deleteAccount())).toEqual({ ok: true });
    expect(await readUserDoc(uid)).toBeNull();
    expect(await lookupAuthUser(uid)).toBeNull();
  });
});

// ---------- a device that was closed while its account changed (section 5.6.3) ----------

/** IndexedDB names a browser holds for a signed-in Periodica (Firestore's cache and Firebase's session). */
const FIRESTORE_DB = 'firestore/[DEFAULT]/demo-periodica/main';
const BROWSER_DBS = [FIRESTORE_DB, 'firebaseLocalStorageDb'];

/**
 * A test device keeps Firebase's session in localStorage (it has no IndexedDB). Without those keys it starts
 * the way a browser does whose session Firebase ended: the token was revoked or the password changed.
 */
const withoutSession = (storage: Record<string, string>) => Object.fromEntries(Object.entries(storage).filter(([k]) => !k.startsWith('firebase:')));

describe('a device closed while the account changed', () => {
  test('deleted on another device: the closed one opens as a fresh guest, with no cached copy left', async () => {
    const email = uniqueEmail('delete-closed');
    const a = await device('A');
    const uid = await signUp(a, 'Quinn Deleteprobe', email);
    const xp = await play(a, lesson('lightest-ten', { 1: true, 2: true }));
    await settled(a);
    // B, a shared school laptop: signs in, gets everything, and its tab is closed.
    const b = await device('B');
    await signIn(b, email);
    await b.until('B restored', (c, w) => c.useProgress.getState().xp === w, xp);
    await settled(b);
    const idb = (await look(b)).meta.deviceId;
    const saved = await b.storage();
    await b.close();
    devices = devices.filter((d) => d !== b);

    expect(await a.run((c) => c.account.deleteAccount())).toEqual({ ok: true });
    expect(await lookupAuthUser(uid)).toBeNull();

    // B opens again. Its saved session is no longer valid, so Firebase starts it signed out.
    const b2 = await device('B reopened', { storage: saved, databases: BROWSER_DBS });
    expect((await look(b2)).xp).toBe(xp);
    await b2.run((c) => c.account.bootAccounts());
    await b2.until('B cleared', (c) => c.useAuth.getState().status === 'guest' && c.syncMeta.readMeta().owner === null && c.useProgress.getState().xp === 0);
    const v = await look(b2);
    expectFreshGuest(v, idb, await b2.run((c) => c.defaultSettings()));
    expect(v.notice).toBe('session-ended');
    expect(v.leftover).toBe(false);
    expect((await persisted(b2)).progress).toMatchObject({ xp: 0, explored: [], chapters: {} });
    // The cached account, which held the student's name, is gone too.
    await b2.until('cache removed', (c, n) => !c.browser.databases().includes(n), FIRESTORE_DB);
    expect(await readUserDoc(uid)).toBeNull();
  });

  test('progress the account never got is kept apart, only for that account, until the device is cleared', async () => {
    const email = uniqueEmail('ended-unsaved');
    const a = await device('A');
    const uid = await signUp(a, 'Rae', email);
    const xp1 = await play(a, lesson('lightest-ten', { 1: true, 2: true }));
    await settled(a);
    // Offline play, then the browser is closed before it could be saved.
    await a.offline();
    const xp2 = await play(a, quiz({ 6: true }));
    expect((await look(a)).meta.unsaved).toBe(true);
    const saved = await a.storage();
    await a.close();
    devices = devices.filter((d) => d !== a);

    // Its session is not restored: Firebase signed it out (a revoked token, a changed password).
    const a2 = await device('A reopened', { storage: withoutSession(saved), databases: BROWSER_DBS });
    await a2.run((c) => c.account.bootAccounts());
    await a2.until('session ended', (c) => c.useAuth.getState().notice === 'session-ended-unsaved');
    let v = await look(a2);
    expect(v.status).toBe('guest');
    expect(v.user).toBeNull();
    expect(v.leftover).toBe(true);
    expect(v.xp).toBe(xp1 + xp2);
    expect(v.meta).toMatchObject({ owner: uid, user: null, unsaved: true });
    await a2.until('cache removed', (c, n) => !c.browser.databases().includes(n), FIRESTORE_DB);

    // Signing in to the same account saves it, once.
    await signIn(a2, email);
    await a2.until('saved', (c, w) => c.useProgress.getState().xp === w, xp1 + xp2);
    await settled(a2);
    expect(total(await readUserDoc(uid))).toBe(xp1 + xp2);
    expect((await look(a2)).leftover).toBe(false);
  });

  test('"Clear this device" removes a leftover for good', async () => {
    const email = uniqueEmail('clear-device');
    const a = await device('A');
    const uid = await signUp(a, 'Sol', email);
    await a.offline();
    await play(a, quiz({ 6: true }));
    const saved = await a.storage();
    await a.close();
    devices = devices.filter((d) => d !== a);

    const a2 = await device('A reopened', { storage: withoutSession(saved), databases: BROWSER_DBS });
    await a2.run((c) => c.account.bootAccounts());
    await a2.until('leftover', (c) => c.useAuth.getState().leftover);
    const deviceId = (await look(a2)).meta.deviceId;
    await a2.run((c) => c.account.clearThisDevice());
    const v = await look(a2);
    expectFreshGuest(v, deviceId, await a2.run((c) => c.defaultSettings()));
    expect(v.leftover).toBe(false);
    expect(v.notice).toBe('cleared');
    // The account itself was never touched by any of this.
    expect(total(await readUserDoc(uid))).toBe(0);
  });
});

// ---------- signing in again on a device (section 5.2, case C) ----------

describe('signing in again on the same device', () => {
  test('play before the account has loaded is added to what this device saved before, not merged away', async () => {
    const email = uniqueEmail('again');
    const a = await device('A');
    const uid = await signUp(a, 'Tam', email);
    const xp1 = await play(a, lesson('lightest-ten', { 1: true, 2: true }));
    await settled(a);
    expect(await a.run((c) => c.account.signOutAndReset())).toEqual({ ok: true });

    // Sign in again and finish a round at once, before the first snapshot arrives.
    const xp2 = await a.run(
      async (c, arg) => {
        const r = await c.account.signInWithEmail(arg.email, arg.password, { shared: false });
        if (!r.ok) throw new Error(JSON.stringify(r));
        return c.useProgress.getState().recordRound(arg.round).xpGained;
      },
      { email, password: PASSWORD, round: quiz({ 6: true, 7: true }) },
    );
    await a.until('both rounds', (c, w) => c.useProgress.getState().xp === w, xp1 + xp2);
    await settled(a);
    const doc = await readUserDoc(uid);
    expect(total(doc)).toBe(xp1 + xp2);
    expect(total(doc, 'rounds')).toBe(2);
    expect((await look(a)).stats.rounds).toBe(2);
  });
});

// ---------- names and email (sections 5.6.10, 7.5) ----------

describe('profile and email', () => {
  test('a name of emoji at the limit is saved; one over is refused before any network call', async () => {
    const a = await device('A');
    const xp = await play(a, lesson('lightest-ten', { 1: true }));
    const tooLong = await a.run((c, n) => c.account.signUpWithEmail(n, 'never-sent@example.com', 'correct horse', { shared: false }), '🧪'.repeat(25));
    expect(tooLong).toMatchObject({ ok: false, code: 'invalid-input', fields: { name: expect.any(String) } });

    const name = '🧪'.repeat(20);
    const uid = await signUp(a, name, uniqueEmail('emoji'));
    const doc = await readUserDoc(uid);
    expect(doc!.profile).toEqual({ name });
    expect(total(doc)).toBe(xp);
  });

  test('email sign-up sends a verification email; opening it marks the account verified', async () => {
    const email = uniqueEmail('verify');
    const a = await device('A');
    await signUp(a, 'Uma', email);
    expect((await look(a)).user).toMatchObject({ verified: false });
    const link = await waitFor('verification email', async () => (await oobLinks(email, 'VERIFY_EMAIL'))[0]);
    // The student opens the link from their inbox.
    const res = await fetch(link);
    expect(res.ok).toBe(true);
    await a.run((c) => c.account.refreshUser());
    expect((await look(a)).user).toMatchObject({ verified: true });
    expect((await look(a)).meta.user).toMatchObject({ verified: true });
  });
});

// ---------- shared computers (section 5.6.9) ----------

describe('shared computer', () => {
  test('closing the browser ends the session: the next start is a fresh guest, and the account keeps everything', async () => {
    const email = uniqueEmail('shared-close');
    const a = await device('A');
    const uid = await signUp(a, 'Val', email, true);
    const xp = await play(a, lesson('lightest-ten', { 1: true, 2: true }));
    await settled(a);
    expect((await look(a)).meta.shared).toBe(true);
    expect(await a.run((c) => c.browser.cookies())).toContain('periodica-session=1');
    const deviceId = (await look(a)).meta.deviceId;
    const saved = await a.storage();
    await a.close();
    devices = devices.filter((d) => d !== a);

    // The browser restarts: localStorage is still there, the session cookie is not.
    const a2 = await device('A next morning', { storage: saved, databases: BROWSER_DBS });
    // Not even the first render shows the last student's name.
    expect(await a2.run((c) => ({ status: c.useAuth.getState().status, user: c.useAuth.getState().user }))).toEqual({ status: 'guest', user: null });
    await a2.run((c) => c.account.bootAccounts());
    await a2.until('cleared', (c) => c.syncMeta.readMeta().owner === null && c.useProgress.getState().xp === 0);
    expectFreshGuest(await look(a2), deviceId, await a2.run((c) => c.defaultSettings()));
    await a2.until('session forgotten', (c) => !c.browser.databases().includes('firebaseLocalStorageDb'));
    expect(total(await readUserDoc(uid))).toBe(xp);
  });

  test('30 minutes without use ends the session, after saving', async () => {
    const email = uniqueEmail('shared-idle');
    const a = await device('A');
    const uid = await signUp(a, 'Wen', email, true);
    const xp = await play(a, lesson('lightest-ten', { 1: true, 2: true }));
    const deviceId = (await look(a)).meta.deviceId;
    await a.run((c) => c.clock.advance(31 * 60_000));
    await a.run((c) => c.account.checkSharedSession());
    await a.until('signed out', (c) => c.useAuth.getState().notice === 'shared-idle' && c.syncMeta.readMeta().owner === null);
    expectFreshGuest(await look(a), deviceId, await a.run((c) => c.defaultSettings()));
    expect(await a.run((c) => c.firebase.loadedFirebase()?.auth.currentUser ?? null)).toBeNull();
    expect(total(await readUserDoc(uid))).toBe(xp);
  });

  test('not a shared computer: the session stays after a long break', async () => {
    const a = await device('A');
    await signUp(a, 'Xan', uniqueEmail('not-shared'), false);
    await a.run((c) => c.clock.advance(3 * 60 * 60_000));
    await a.run((c) => c.account.checkSharedSession());
    expect((await look(a)).status).toBe('signed-in');
  });
});
