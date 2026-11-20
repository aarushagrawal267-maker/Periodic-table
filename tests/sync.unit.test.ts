/**
 * The sync layer against a fake Firestore (tests/support/fakeFirebase.ts), for cases the emulator suites
 * cannot pin down: a save that fails while the listener stays connected, a save refused by the rate rule,
 * the durable "unsaved" flag, and another tab writing a stale copy (docs/ACCOUNTS.md 5.4, 5.3.1, 5.6.8).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.hoisted(() => {
  const mem = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;
  g.localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    clear: () => mem.clear(),
    get length() {
      return mem.size;
    },
  };
  const events = new EventTarget();
  g.window = globalThis;
  for (const k of ['addEventListener', 'removeEventListener', 'dispatchEvent'] as const) g[k] = events[k].bind(events);
  g.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
});

vi.mock('../src/lib/firebase', async () => (await import('./support/fakeFirebase')).fakeFirebaseModule);

import { emit, fake, resetFake } from './support/fakeFirebase';
import * as sync from '../src/lib/sync';
import { mergeProgress, toSynced, type Slot } from '../src/lib/merge';
import { readMeta, writeMeta } from '../src/lib/syncMeta';
import { useAuth } from '../src/store/auth';
import { EMPTY_PROGRESS, useProgress, type RoundSummary } from '../src/store/progress';
import { useSettings } from '../src/store/settings';

const round = (n: number): RoundSummary => ({
  kind: 'quiz',
  difficulty: 'standard',
  score: 800,
  correct: 1,
  mistakes: 0,
  hints: 0,
  timeMs: 40_000,
  maxCombo: 2,
  stars: 2,
  completed: true,
  results: { [n]: true },
  trail: ['hit'],
});

const docXp = () => Object.values(((fake.doc?.progress as { slots?: Record<string, Slot> }) ?? {}).slots ?? {}).reduce((t, s) => t + s.xp, 0);
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Signs `uid` in on this device with an empty store, against a new account (case C), and waits for the first save. */
async function startNewAccount(uid = 'u1') {
  writeMeta({ user: { name: 'Kim', email: 'kim@example.com', provider: 'password', verified: true } });
  sync.startSync({ uid, name: 'Kim' });
  await tick();
  emit(false); // the server says: no document yet
  await vi.waitFor(() => expect(fake.writes.length).toBe(1), { timeout: 5000 });
  emit(false);
  await vi.waitFor(() => expect(useAuth.getState().sync).toBe('saved'));
}

beforeEach(() => {
  resetFake();
  localStorage.clear();
  useProgress.setState({ ...EMPTY_PROGRESS });
  useSettings.getState().reset();
});

afterEach(() => {
  sync.stopSync();
});

describe('saving after a failed save', () => {
  test('one save that could not reach the server does not stop saving while the listener is connected', async () => {
    await startNewAccount();
    useProgress.getState().recordRound(round(1));
    fake.failNext.push('unavailable');
    expect(await sync.flushNow()).toBe('offline');
    // The network is fine again; Firestore's listener never left the server, so it sends nothing new.
    useProgress.getState().recordRound(round(2));
    expect(await sync.flushNow()).toBe('saved');
    expect(fake.writes.length).toBe(2);
    expect(docXp()).toBe(useProgress.getState().xp);
    expect(useAuth.getState().sync).toBe('saved');
  }, 15_000);

  test("'online' retries at once, even while the listener still reports the cache", async () => {
    await startNewAccount();
    emit(true); // the listener lost the server
    useProgress.getState().recordRound(round(1));
    expect(await sync.flushNow()).toBe('offline');
    expect(useAuth.getState().sync).toBe('offline');
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(fake.writes.length).toBe(2), { timeout: 5000 });
    expect(docXp()).toBe(useProgress.getState().xp);
  }, 15_000);

  test('a save refused once (another device saved within the second) is retried and lands', async () => {
    await startNewAccount();
    useProgress.getState().recordRound(round(1));
    fake.failNext.push('permission-denied');
    expect(await sync.flushNow()).toBe('saved');
    expect(docXp()).toBe(useProgress.getState().xp);
    expect(useAuth.getState().error).toBeNull();
  }, 15_000);

  test('a save refused twice is an error', async () => {
    await startNewAccount();
    useProgress.getState().recordRound(round(1));
    fake.failNext.push('permission-denied', 'permission-denied');
    expect(await sync.flushNow()).toBe('error');
    expect(useAuth.getState().sync).toBe('error');
    expect(readMeta().unsaved).toBe(true);
  }, 15_000);

  test('saves keep at least MIN_SAVE_GAP_MS apart', async () => {
    await startNewAccount();
    const t0 = Date.now();
    useProgress.getState().recordRound(round(1));
    await sync.flushNow();
    useProgress.getState().recordRound(round(2));
    await sync.flushNow();
    expect(fake.writes.length).toBe(3);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(sync.MIN_SAVE_GAP_MS);
  }, 15_000);
});

describe('meta.unsaved', () => {
  test('is set by a local change and cleared once the save commits', async () => {
    await startNewAccount();
    expect(readMeta().unsaved).toBe(false);
    useProgress.getState().recordRound(round(1));
    expect(readMeta().unsaved).toBe(true);
    fake.failNext.push('unavailable');
    await sync.flushNow();
    expect(readMeta().unsaved).toBe(true);
    await sync.flushNow();
    expect(readMeta().unsaved).toBe(false);
  }, 15_000);
});

describe('another tab writes the stores', () => {
  test('a stale copy below what the account counts is repaired, never saved, and later play adds to it', async () => {
    // The account has 275 XP from another device.
    const other = toSynced({ ...EMPTY_PROGRESS, xp: 275, stats: { ...EMPTY_PROGRESS.stats, rounds: 1 } }, {}, 'other-device', 0);
    await startNewAccount();
    fake.doc = { ...fake.doc!, progress: mergeProgress(fake.doc!.progress as typeof other, other) };
    emit(false);
    await vi.waitFor(() => expect(useProgress.getState().xp).toBe(275));

    // A tab still holding an old empty copy opens an element card and writes its copy.
    localStorage.setItem('periodica-progress', JSON.stringify({ state: { ...EMPTY_PROGRESS, explored: [8] }, version: 2 }));
    sync.applyExternal(['progress']);
    expect(useProgress.getState().xp).toBe(275);
    expect(useProgress.getState().explored).toEqual([8]);

    // The round played here next counts on top.
    const gained = useProgress.getState().recordRound(round(9)).xpGained;
    expect(await sync.flushNow()).toBe('saved');
    expect(docXp()).toBe(275 + gained);
    expect((fake.doc!.progress as { explored: number[] }).explored).toContain(8);
    expect(useProgress.getState().xp).toBe(275 + gained);
  }, 15_000);
});

describe('signing in again on a device (case C)', () => {
  test('play before the first snapshot becomes a slot of its own', async () => {
    const before = readMeta();
    // This device saved 165 XP to the account in an earlier sign-in.
    const earlier = toSynced({ ...EMPTY_PROGRESS, xp: 165, stats: { ...EMPTY_PROGRESS.stats, rounds: 1 } }, {}, before.deviceId, 0);
    fake.doc = { schemaVersion: 1, profile: { name: 'Kim' }, progress: earlier, settings: { values: {}, at: {} }, clientId: before.deviceId, createdAt: 'T', updatedAt: 'T' };
    sync.startSync({ uid: 'u1', name: 'Kim' });
    await tick();
    const gained = useProgress.getState().recordRound(round(3)).xpGained;
    expect(readMeta().pendingAdoption).toMatchObject({ uid: 'u1' });
    emit(false);
    await vi.waitFor(() => expect(docXp()).toBe(165 + gained), { timeout: 5000 });
    await vi.waitFor(() => expect(useProgress.getState().xp).toBe(165 + gained));
  }, 15_000);
});
