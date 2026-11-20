/**
 * Account sync lifecycle (docs/ACCOUNTS.md section 5). Only ever loaded with import() from ./account.
 *
 * The zustand stores stay what every screen reads. This module watches them with subscribe, merges
 * the account document into them with setState, and saves local state with a transaction that reads
 * the server copy and writes the join (ADR-A2), so no device ever overwrites another's progress.
 */
import type { Unsubscribe } from 'firebase/firestore';
import { EMPTY_PROGRESS, useProgress, type ProgressData } from '../store/progress';
import { defaultSettings, useSettings, type SettingKey, type SettingsData } from '../store/settings';
import { useAuth, type SyncStatus } from '../store/auth';
import { errorCode, syncMessage } from './authErrors';
import { loadFirebase, loadedFirebase, wipeLocalFirestore, type Fb } from './firebase';
import {
  SCHEMA_VERSION,
  SYNC_SETTING_KEYS,
  adoptGuest,
  belowOthers,
  emptySynced,
  fromSynced,
  mergeProgress,
  mergeSettings,
  othersOf,
  parseDoc,
  profileName,
  sameProgress,
  sameSettings,
  toSynced,
  type SyncedProgress,
  type SyncedSettings,
  type UserDoc,
} from './merge';
import { bumpGen, clearOwnership, markTabCurrent, newId, readMeta, writeMeta, type SyncMeta } from './syncMeta';

export type FlushResult = 'saved' | 'offline' | 'error';

/** For a failed Google redirect (accountCore): its copy loads with this module rather than with the first load. */
export { authMessage, errorCode } from './authErrors';

/** Debounce after the last local change, and the longest a change waits (section 5.4). */
export const DEBOUNCE_MS = 2000;
export const MAX_WAIT_MS = 10_000;
const RETRY_MS = [5000, 30_000, 120_000];
/**
 * The rules refuse a save less than 1 s after the last one (docs/ACCOUNTS.md 6.1). This device waits a
 * little longer than that between its own saves, and retries once when another device saved just before.
 */
export const MIN_SAVE_GAP_MS = 1200;
const RATE_RETRY_MS = 1500;
const OFFLINE_CODES = new Set(['unavailable', 'deadline-exceeded']);
const GONE_CODES = new Set(['auth/user-not-found', 'auth/user-disabled', 'auth/user-token-expired']);
/**
 * Deleting an account removes the document first and the login a moment later (section 5.6.5). A device
 * that sees the document vanish waits this long and checks the login again before it decides the document
 * was removed by hand and rebuilds it; otherwise it would recreate a deleted student's data.
 */
export const DELETE_GRACE_MS = 5000;

class OutdatedError extends Error {}
class GoneError extends Error {}

interface Session {
  uid: string;
  name: string;
  fb: Fb | null;
  unsubSnap: Unsubscribe | null;
  cleanups: (() => void)[];
  watching: boolean;
}

let session: Session | null = null;
/** Bumped by every start and stop, so callbacks from an older session do nothing. */
let generation = 0;
/** True while sync itself writes the stores: those changes are not local changes. */
let applying = false;
/** Bumped by every local change (and by a snapshot showing the server lacks something we have). */
let changeSeq = 0;
/** changeSeq at the start of the last committed save. */
let savedSeq = 0;
let inflight: Promise<FlushResult> | null = null;
/** The snapshot listener has no server connection: its last snapshot came from the cache, or it failed offline. */
let listenerOffline = false;
/** The last save failed because the server could not be reached. Cleared by the next successful save. */
let saveOffline = false;
/** When this device last committed a save (its clock), for MIN_SAVE_GAP_MS. */
let lastCommitAt = 0;
/** The account as this device last saw it (snapshot or own save), for checking another tab's writes. */
let lastRemote: { progress: SyncedProgress; settings: SyncedSettings } | null = null;
let gotFirstSnapshot = false;
let outdated = false;
let failure: string | null = null;
let retries = 0;
let lastRemoteEpoch = 0;
let checkingDeletion = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let maxTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

// ---------- small helpers ----------

const navOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const isOffline = () => navOffline() || listenerOffline || saveOffline;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const pendingAdoptionFor = (meta: SyncMeta, uid: string) => (meta.pendingAdoption?.uid === uid ? meta.pendingAdoption : null);

function settingsData(): SettingsData {
  const s = useSettings.getState();
  return { sound: s.sound, haptics: s.haptics, reduceMotion: s.reduceMotion, colorblind: s.colorblind, difficulty: s.difficulty, quizTimer: s.quizTimer };
}

const localSettings = (meta: SyncMeta): SyncedSettings => ({ values: settingsData(), at: { ...meta.settingsAt } });

/** True when the store holds a fresh start (what reset() leaves). */
export function isEmptyProgress(p: ProgressData): boolean {
  return p === EMPTY_PROGRESS || sameProgress(toSynced(p, {}, 'x', 0), emptySynced(0));
}

/** The epoch the local stores belong to. Before this device has seen the account, it takes the account's. */
const localEpoch = (meta: SyncMeta, remoteEpoch: number) => (meta.docSeen ? meta.epoch : Math.max(meta.epoch, remoteEpoch));

function dirty(): boolean {
  if (!session) return false;
  return changeSeq !== savedSeq || !!pendingAdoptionFor(readMeta(), session.uid);
}

function markDirty() {
  changeSeq++;
  setUnsaved(true);
}

/** The durable copy of "something here is not in the account yet" (meta.unsaved, section 5.3.1). */
function setUnsaved(v: boolean) {
  if (readMeta().unsaved !== v) writeMeta({ unsaved: v });
}

function setAuth(patch: Parameters<ReturnType<typeof useAuth.getState>['set']>[0]) {
  useAuth.getState().set(patch);
}

function updateStatus() {
  if (!session) return;
  let sync: SyncStatus;
  if (outdated) sync = 'outdated';
  else if (failure) sync = 'error';
  else if (!gotFirstSnapshot && !dirty()) sync = isOffline() ? 'offline' : 'loading';
  else if (dirty() || inflight) sync = isOffline() ? 'offline' : 'saving';
  else sync = 'saved';
  const cur = useAuth.getState();
  const error = failure ? { code: failure, message: syncMessage(failure) } : cur.error && !cur.error.code.startsWith('auth/') ? null : cur.error;
  if (cur.sync !== sync || cur.error !== error) setAuth({ sync, error });
}

function clearTimers() {
  for (const t of [debounceTimer, maxTimer, retryTimer]) if (t) clearTimeout(t);
  debounceTimer = maxTimer = retryTimer = null;
}

/** Debounce 2 s after the last change, at most 10 s after the first unsaved one. */
function scheduleFlush(delay = DEBOUNCE_MS) {
  if (!session || outdated) return;
  const fire = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (maxTimer) clearTimeout(maxTimer);
    debounceTimer = maxTimer = null;
    void flushNow();
  };
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fire, delay);
  if (!maxTimer) maxTimer = setTimeout(fire, MAX_WAIT_MS);
}

// ---------- applying the account to the stores ----------

/**
 * Joins `remote` into the current local state and writes the result into the stores (section 5.4,
 * step 4). Always recomputed from the stores as they are now, so play that happened while a save was
 * in flight is kept. Meta is written before the stores: if the tab dies in between, the next start
 * under-derives this device's own slot for a moment, and the max-join with the server restores it.
 */
function applyRemote(remote: SyncedProgress | null, remoteSettings: SyncedSettings | null): { M: SyncedProgress; S: SyncedSettings } {
  const meta = readMeta();
  const local = useProgress.getState();
  const epoch = localEpoch(meta, remote?.epoch ?? 0);
  const L = toSynced(local, meta.others, meta.deviceId, epoch);
  const M = remote ? mergeProgress(L, remote) : L;
  const Ls = localSettings(meta);
  const S = remoteSettings ? mergeSettings(Ls, remoteSettings) : Ls;

  // Only keys the account set more recently than this device change here; untouched defaults stay.
  const patch: Partial<SettingsData> = {};
  const values = settingsData();
  for (const k of SYNC_SETTING_KEYS) {
    if ((S.at[k] ?? 0) > (meta.settingsAt[k] ?? 0) && S.values[k] !== values[k]) (patch as Record<SettingKey, unknown>)[k] = S.values[k];
  }
  // A store below the others' baseline (a stale copy from another tab) is rebuilt even when M equals L.
  const progressChanged = !sameProgress(M, L) || belowOthers(local, meta.others);

  applying = true;
  try {
    writeMeta({ others: othersOf(M, meta.deviceId), epoch: M.epoch, settingsAt: { ...S.at } });
    if (progressChanged) useProgress.setState(fromSynced(M, local));
    if (Object.keys(patch).length) useSettings.setState(patch);
  } finally {
    applying = false;
  }
  // The joined state can pass a badge check neither side passed alone. That is a local change, so it is saved.
  if (progressChanged) useProgress.getState().reconcileAchievements();
  return { M, S };
}

// ---------- the snapshot listener ----------

function attachListener(gen: number) {
  const s = session;
  const fb = s?.fb;
  if (!s || !fb || gen !== generation) return;
  s.unsubSnap?.();
  const ref = fb.sdk.doc(fb.db, 'users', s.uid);
  s.unsubSnap = fb.sdk.onSnapshot(
    ref,
    { includeMetadataChanges: true },
    (snap) => {
      if (gen !== generation) return;
      const fromCache = snap.metadata.fromCache;
      const wasOffline = listenerOffline || saveOffline;
      listenerOffline = fromCache;
      if (!fromCache) saveOffline = false;
      if (!snap.exists()) {
        // The cache does not know yet; wait for the server.
        if (fromCache) return updateStatus();
        gotFirstSnapshot = true;
        const meta = readMeta();
        if (meta.docSeen && !pendingAdoptionFor(meta, s.uid)) {
          void checkDeleted(gen);
          return updateStatus();
        }
        // A new account: the first save creates the document.
        markDirty();
        scheduleFlush(0);
        return updateStatus();
      }
      const parsed = parseDoc(snap.data());
      if (parsed.kind === 'newer') {
        outdated = true;
        clearTimers();
        return updateStatus();
      }
      if (parsed.kind !== 'ok') return;
      gotFirstSnapshot = true;
      const remote = parsed.doc;
      lastRemoteEpoch = remote.progress.epoch;
      lastRemote = { progress: remote.progress, settings: remote.settings };
      const meta = readMeta();
      if (pendingAdoptionFor(meta, s.uid)) {
        // The guest merge has not committed: nothing is applied until it has.
        if (!fromCache) scheduleFlush(0);
        return updateStatus();
      }
      if (!meta.docSeen) writeMeta({ docSeen: true });
      const { M, S } = applyRemote(remote.progress, remote.settings);
      // Something only this device has: save it.
      if (!sameProgress(M, remote.progress) || !sameSettings(S, remote.settings)) {
        markDirty();
        scheduleFlush();
      } else if (!fromCache && wasOffline && dirty()) scheduleFlush(0);
      else if (!dirty()) setUnsaved(false);
      updateStatus();
    },
    (err) => {
      if (gen !== generation) return;
      s.unsubSnap = null;
      const code = errorCode(err);
      if (OFFLINE_CODES.has(code)) listenerOffline = true;
      else failure = code || 'unknown';
      scheduleRetry(gen);
      updateStatus();
    },
  );
}

/** The document vanished while this device had seen it (section 5.6.3). */
async function checkDeleted(gen: number) {
  const s = session;
  const user = s?.fb?.auth.currentUser;
  if (!s || !user || user.uid !== s.uid || checkingDeletion) return;
  checkingDeletion = true;
  try {
    await user.reload();
    if (gen !== generation) return;
    // The login still exists, but another device may be between deleting the document and the login.
    await new Promise((r) => setTimeout(r, DELETE_GRACE_MS));
    if (gen !== generation) return;
    await user.reload();
    if (gen !== generation) return;
    // The user exists, so the document was removed by hand: heal it from this device.
    writeMeta({ docSeen: false });
    markDirty();
    scheduleFlush(0);
  } catch (e) {
    if (gen !== generation) return;
    if (GONE_CODES.has(errorCode(e))) {
      const fb = s.fb;
      stopSync();
      await resetDeviceToGuest();
      setAuth({ status: 'guest', user: null, sync: 'idle', error: null, notice: 'deleted-elsewhere' });
      // Ownership is already cleared, so the auth listener treats this as a plain sign out.
      if (fb) await fb.sdk.signOut(fb.auth).catch(() => undefined);
    }
  } finally {
    checkingDeletion = false;
  }
}

// ---------- saving ----------

interface TxResult {
  M: SyncedProgress;
  S: SyncedSettings;
  adoption: { uid: string; guestId: string } | null;
}

async function transact(fb: Fb, s: Session): Promise<TxResult> {
  const { sdk } = fb;
  const db = fb.db;
  const ref = sdk.doc(db, 'users', s.uid);
  return sdk.runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const parsed = snap.exists() ? parseDoc(snap.data()) : ({ kind: 'missing' } as const);
    if (parsed.kind === 'newer') throw new OutdatedError();
    const remote: UserDoc | null = parsed.kind === 'ok' ? parsed.doc : null;
    // Recomputed on every SDK retry, from the stores as they are now.
    const meta = readMeta();
    const local = useProgress.getState();
    const adoption = pendingAdoptionFor(meta, s.uid);
    if (!remote && meta.docSeen && !adoption) throw new GoneError();
    let M: SyncedProgress;
    if (adoption) M = adoptGuest(local, adoption.guestId, remote?.progress ?? null);
    else {
      const L = toSynced(local, meta.others, meta.deviceId, localEpoch(meta, remote?.progress.epoch ?? 0));
      M = remote ? mergeProgress(L, remote.progress) : L;
    }
    const Ls = localSettings(meta);
    const S = remote ? mergeSettings(Ls, remote.settings) : Ls;
    const name = profileName(s.name);
    const unchanged =
      remote &&
      remote.schemaVersion === SCHEMA_VERSION &&
      remote.profile.name === name &&
      sameProgress(M, remote.progress) &&
      sameSettings(S, remote.settings);
    if (!unchanged) {
      // A full set is safe: M already contains the server copy.
      tx.set(ref, {
        schemaVersion: SCHEMA_VERSION,
        profile: { name },
        progress: M,
        settings: S,
        clientId: meta.deviceId,
        createdAt: remote && remote.createdAt != null ? remote.createdAt : sdk.serverTimestamp(),
        updatedAt: sdk.serverTimestamp(),
      });
    }
    return { M, S, adoption };
  });
}

async function runFlush(): Promise<FlushResult> {
  const s = session;
  const gen = generation;
  if (!s) return 'saved';
  if (outdated) return 'error';
  if (!dirty()) {
    updateStatus();
    return 'saved';
  }
  // A failed save alone (saveOffline) does not stop the next try: only the browser or the listener can
  // say the connection is down, and a save that cannot reach the server reports it again.
  if (navOffline() || listenerOffline) {
    updateStatus();
    return 'offline';
  }
  let fb = s.fb;
  if (!fb) {
    try {
      fb = s.fb = await loadFirebase();
    } catch {
      return 'offline';
    }
  }
  let refused = 0;
  for (let round = 0; round < 3 && dirty(); ) {
    // The rules allow one save a second per account (docs/ACCOUNTS.md 6.1).
    const wait = lastCommitAt + MIN_SAVE_GAP_MS - Date.now();
    if (wait > 0) {
      await sleep(wait);
      if (gen !== generation) return 'saved';
    }
    const seq = changeSeq;
    let r: TxResult;
    try {
      r = await transact(fb, s);
    } catch (e) {
      if (gen !== generation) return 'saved';
      // Most likely another device of this account saved within the last second: try once more.
      if (errorCode(e) === 'permission-denied' && refused++ === 0) {
        await sleep(RATE_RETRY_MS);
        if (gen !== generation) return 'saved';
        continue;
      }
      return handleFlushError(e, gen);
    }
    round++;
    if (gen !== generation) return 'saved';
    lastCommitAt = Date.now();
    if (r.adoption) {
      // The guest slot is now counted in the account. Meta first (section 5.2.1). The device changes
      // hands, so tabs still holding the guest copy must reload before they write (section 5.6.8).
      const guestSlot = r.M.slots[r.adoption.guestId];
      bumpGen({
        owner: s.uid,
        pendingAdoption: null,
        others: guestSlot ? { [r.adoption.guestId]: guestSlot } : {},
        epoch: r.M.epoch,
        docSeen: true,
      });
    } else writeMeta({ docSeen: true });
    lastRemoteEpoch = r.M.epoch;
    lastRemote = { progress: r.M, settings: r.S };
    savedSeq = seq;
    failure = null;
    saveOffline = false;
    retries = 0;
    applyRemote(r.M, r.S);
  }
  if (!s.unsubSnap) attachListener(gen);
  // Still dirty after three rounds means play kept going during the saves: the next debounce picks it up.
  if (dirty()) scheduleFlush();
  else setUnsaved(false);
  updateStatus();
  return 'saved';
}

function handleFlushError(e: unknown, gen: number): FlushResult {
  if (e instanceof OutdatedError) {
    outdated = true;
    clearTimers();
    updateStatus();
    return 'error';
  }
  if (e instanceof GoneError) {
    void checkDeleted(gen);
    updateStatus();
    return 'error';
  }
  const code = errorCode(e);
  if (OFFLINE_CODES.has(code) || navOffline()) {
    // Try again on a back-off, so a blip while the listener stays connected does not stop saving.
    saveOffline = true;
    scheduleRetry(gen);
    updateStatus();
    return 'offline';
  }
  failure = code || 'unknown';
  scheduleRetry(gen);
  updateStatus();
  return 'error';
}

/** Back off 5 s, 30 s, 2 min, then wait for the next local change. */
function scheduleRetry(gen: number) {
  if (retryTimer || retries >= RETRY_MS.length) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (gen !== generation) return;
    if (session && !session.unsubSnap) attachListener(gen);
    void flushNow();
  }, RETRY_MS[retries++]);
}

/**
 * Saves now. Resolves 'saved' when the account holds everything this device has, 'offline' when it
 * cannot reach the server (or `timeoutMs` passes first), 'error' when the save was refused.
 */
export function flushNow(timeoutMs?: number): Promise<FlushResult> {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (maxTimer) clearTimeout(maxTimer);
  debounceTimer = maxTimer = null;
  const run = async (): Promise<FlushResult> => {
    // A save in flight may have read the stores before the latest change: wait, then save again.
    while (inflight) await inflight.catch(() => undefined);
    const p = runFlush().finally(() => {
      if (inflight === p) inflight = null;
      updateStatus();
    });
    inflight = p;
    updateStatus();
    return p;
  };
  const p = run();
  if (!timeoutMs) return p;
  return Promise.race([p, new Promise<FlushResult>((resolve) => setTimeout(() => resolve('offline'), timeoutMs))]);
}

/**
 * True while sync checks whether the account was deleted elsewhere. Reloading a deleted user makes
 * Firebase sign this device out; the auth listener leaves that sign out to this check.
 */
export function isCheckingDeletion(): boolean {
  return checkingDeletion;
}

/** Local state not yet in the server copy. */
export function hasUnsavedChanges(): boolean {
  return dirty();
}

// ---------- watching the stores ----------

function watchStores(gen: number): (() => void)[] {
  const onProgress = useProgress.subscribe((state, prev) => {
    if (applying || gen !== generation || !session) return;
    const meta = readMeta();
    if (isEmptyProgress(state) && !isEmptyProgress(prev)) {
      // "Reset progress" while signed in: a new generation that every device takes (section 4.6).
      writeMeta({ epoch: Math.max(meta.epoch, lastRemoteEpoch) + 1, others: {} });
    } else if (meta.owner === session.uid && !meta.docSeen && !gotFirstSnapshot && !pendingAdoptionFor(meta, session.uid)) {
      // Play before this device has seen the account (section 5.2, case C). The account may already hold a
      // slot for this device from an earlier sign-in, and a per-slot max would keep only the larger of the
      // two. So this play joins the account like guest progress, as a slot of its own.
      writeMeta({ pendingAdoption: { uid: session.uid, guestId: newId() } });
    }
    markDirty();
    scheduleFlush();
    updateStatus();
  });
  const onSettings = useSettings.subscribe((state, prev) => {
    if (applying || gen !== generation) return;
    const changed = SYNC_SETTING_KEYS.filter((k) => state[k] !== prev[k]);
    if (!changed.length) return;
    const now = Date.now();
    const at = { ...readMeta().settingsAt };
    for (const k of changed) at[k] = now;
    writeMeta({ settingsAt: at });
    markDirty();
    scheduleFlush();
    updateStatus();
  });
  if (typeof window === 'undefined') return [onProgress, onSettings];

  const flushIfDirty = () => {
    if (dirty()) void flushNow();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flushIfDirty();
  };
  const onOnline = () => {
    // The listener may take a while to reconnect (Firestore backs off). Let a save find out instead:
    // if the server is still out of reach, it says so and the status goes back to offline.
    listenerOffline = false;
    saveOffline = false;
    if (dirty()) scheduleFlush(0);
    updateStatus();
  };
  // Another tab's writes reach this one through src/lib/account.ts (applyExternal), which every tab runs.
  window.addEventListener('pagehide', flushIfDirty);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', updateStatus);
  document.addEventListener('visibilitychange', onVisibility);
  return [
    onProgress,
    onSettings,
    () => {
      window.removeEventListener('pagehide', flushIfDirty);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', updateStatus);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  ];
}

/**
 * Another tab of this browser wrote the stores, or this tab found itself stale (section 5.6.8): reload
 * them from storage. That is not a local change. Then check the reloaded copy against the account as this
 * tab last saw it: a copy below what the account already counts is repaired from it (never saved as is),
 * and anything the account lacks (play in a tab that has no sync session) is saved from here.
 */
export function applyExternal(which: ('progress' | 'settings')[]): void {
  applying = true;
  try {
    markTabCurrent();
    // localStorage is synchronous, so each rehydrate has set the store before it returns.
    for (const k of which) void (k === 'progress' ? useProgress : useSettings).persist.rehydrate();
  } finally {
    applying = false;
  }
  const s = session;
  if (!s || !lastRemote || !gotFirstSnapshot || outdated) return;
  // Only while the device still belongs to this session: a sign out elsewhere clears ownership before it
  // empties the stores (resetLocalData), and those empty stores must not be "repaired" back.
  const meta = readMeta();
  if (meta.owner !== s.uid || pendingAdoptionFor(meta, s.uid)) return;
  const { M, S } = applyRemote(lastRemote.progress, lastRemote.settings);
  if (!sameProgress(M, lastRemote.progress) || !sameSettings(S, lastRemote.settings)) {
    markDirty();
    scheduleFlush();
  }
  updateStatus();
}

/** A sync session is running in this tab. */
export function isActive(): boolean {
  return session !== null;
}

// ---------- lifecycle ----------

/** Idempotent per uid. A second call for the same uid only updates the name. */
export function startSync(user: { uid: string; name: string }): void {
  if (session && session.uid === user.uid) {
    if (session.name !== user.name) {
      session.name = user.name;
      markDirty();
      scheduleFlush();
    }
    return;
  }
  if (session) stopSync();
  const gen = ++generation;
  session = { uid: user.uid, name: user.name, fb: loadedFirebase(), unsubSnap: null, cleanups: [], watching: false };
  changeSeq = savedSeq = 0;
  listenerOffline = false;
  saveOffline = false;
  lastCommitAt = 0;
  lastRemote = null;
  gotFirstSnapshot = false;
  outdated = false;
  failure = null;
  retries = 0;
  lastRemoteEpoch = 0;
  setAuth({ sync: 'loading' });
  void begin(gen).catch((e: unknown) => {
    if (gen !== generation) return;
    failure = errorCode(e) || 'unknown';
    updateStatus();
  });
}

async function begin(gen: number) {
  const s = session!;
  let meta = readMeta();
  // D: another account's leftovers (its session ended without signing out). Never merge them.
  if (meta.owner && meta.owner !== s.uid) {
    const user = meta.user;
    await resetLocalData();
    if (gen !== generation) return;
    // meta.user already describes the account signing in (the auth listener wrote it).
    meta = writeMeta({ user });
  }
  if (!meta.owner) {
    // A guest's own choices on this device are its newest settings.
    const defaults = defaultSettings();
    const values = settingsData();
    const now = Date.now();
    const settingsAt = { ...meta.settingsAt };
    for (const k of SYNC_SETTING_KEYS) if (values[k] !== defaults[k] && !settingsAt[k]) settingsAt[k] = now;
    if (isEmptyProgress(useProgress.getState()) && !pendingAdoptionFor(meta, s.uid)) {
      // C: nothing to merge. The first snapshot fills the stores. The device changes hands (section 5.6.8).
      meta = bumpGen({ owner: s.uid, docSeen: false, others: {}, epoch: 0, pendingAdoption: null, settingsAt });
    } else {
      // B: the guest progress merges into the account as its own replica. The id is fixed before any network call.
      const pa = pendingAdoptionFor(meta, s.uid) ?? { uid: s.uid, guestId: newId() };
      meta = writeMeta({ pendingAdoption: pa, settingsAt });
      markDirty();
    }
  }
  // Watch the stores before any await, so no play goes unnoticed (case C relies on seeing the first one).
  if (!s.watching) {
    s.watching = true;
    s.cleanups.push(...watchStores(gen));
  }
  if (!s.fb) {
    try {
      s.fb = await loadFirebase();
    } catch {
      if (gen !== generation) return;
      // Offline and the SDK is not cached: play goes on locally; try again when the connection is back.
      listenerOffline = true;
      updateStatus();
      const retry = () => {
        window.removeEventListener('online', retry);
        if (gen === generation) void begin(gen);
      };
      if (typeof window !== 'undefined') window.addEventListener('online', retry);
      return;
    }
    if (gen !== generation) return;
  }
  attachListener(gen);
  if (dirty()) scheduleFlush(0);
  updateStatus();
}

/** Unsubscribes and cancels timers. Never touches local data. */
export function stopSync(): void {
  generation++;
  clearTimers();
  if (session) {
    session.unsubSnap?.();
    for (const c of session.cleanups) c();
  }
  session = null;
  inflight = null;
  applying = false;
}

async function resetLocalData() {
  // Ownership first, then the stores: another tab sees the device change hands before it sees the empty
  // stores, so it never takes them for a stale copy of the account and "repairs" them (applyExternal).
  clearOwnership();
  applying = true;
  try {
    useProgress.getState().reset();
    useSettings.getState().reset();
  } finally {
    applying = false;
  }
  await wipeLocalFirestore().catch(() => undefined);
}

/** Progress to EMPTY_PROGRESS, settings to defaults, ownership cleared, the local Firestore cache wiped. */
export async function resetDeviceToGuest(): Promise<void> {
  stopSync();
  await resetLocalData();
}

/** Online only. Deletes users/{uid}; used by deleteAccount before deleteUser. */
export async function deleteRemoteDoc(uid: string): Promise<void> {
  const fb = await loadFirebase();
  const del = fb.sdk.deleteDoc(fb.sdk.doc(fb.db, 'users', uid));
  // A delete only resolves once the server has it; offline it would wait forever.
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(Object.assign(new Error('Delete timed out'), { code: 'unavailable' })), 15_000),
  );
  await Promise.race([del, timeout]);
}
