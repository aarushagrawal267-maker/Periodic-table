/**
 * The part of the account layer every tab runs from the start (docs/ACCOUNTS.md 2.5): following the other
 * tabs, ending a shared computer's session, and the auth listener once the SDK is loaded. main.tsx imports
 * only this module. The sign-in, sign-out and delete actions are in ./account, which loads with the account
 * screen, so a guest's first load carries none of them (section 8.3).
 *
 * Statically this module pulls in no Firebase code: the SDK comes from ./firebase with import(), and the
 * sync layer from ./sync with import(). A guest who never opens the account screen loads neither.
 */
import type { User } from 'firebase/auth';
import { EMPTY_PROGRESS, useProgress } from '../store/progress';
import { SETTING_KEYS, useSettings } from '../store/settings';
import { initialsOf, useAuth, type AccountUser } from '../store/auth';
import { isConfigured, loadFirebase, loadedFirebase, wipeLocalFirebaseStorage, wipeLocalFirestore, type Fb } from './firebase';
import { META_KEY, clearOwnership, clearSessionCookie, markTabCurrent, readMeta, setStaleHandler, sharedSessionOver, writeMeta } from './syncMeta';

type SyncModule = typeof import('./sync');
let syncModule: Promise<SyncModule> | null = null;
/** The sync module once loaded, for the synchronous checks below. */
let syncLoaded: SyncModule | null = null;
export const loadSync = () =>
  (syncModule ??= import('./sync').then(
    (m) => (syncLoaded = m),
    (e: unknown) => {
      syncModule = null;
      throw e;
    },
  ));
/** The sync module if it has loaded in this page. Never triggers a load. */
export const loadedSync = () => syncLoaded;
/** A sync session runs in this tab. */
export const syncActive = () => !!syncLoaded?.isActive();

let booted = false;
let preparing: Promise<boolean> | null = null;
let listening = false;
/** Set while the account layer signs the user out, so the listener does not report an ended session. */
let intentionalSignOut = false;
/** The name typed at sign up, used before updateProfile has finished. */
let pendingName: string | null = null;
/** When this tab last completed a sign-in or reauthentication. */
let lastAuthAt = 0;
/** Orders auth listener callbacks: only the latest one acts after its awaits. */
let authSeq = 0;
/** Set while this tab reloads its stores from storage: not a change made here. */
let rehydrating = false;
/** A shared computer's session being ended (section 5.6.9). prepareAccounts waits for it. */
let ending: Promise<void> | null = null;
/** Last write of meta.activeAt from this tab (throttled). */
let activityWrittenAt = 0;

// For ./account, which shares this state with the listener.
/** Runs `fn` as a sign out or delete started here: the auth listener then leaves the clean-up to `fn`. */
export async function signingOut<T>(fn: () => Promise<T>): Promise<T> {
  intentionalSignOut = true;
  try {
    return await fn();
  } finally {
    intentionalSignOut = false;
  }
}
export const setPendingName = (name: string | null) => {
  pendingName = name;
};
/** A sign-in or reauthentication just completed in this tab. */
export const noteSignIn = () => {
  lastAuthAt = Date.now();
};
export const lastSignInHere = () => lastAuthAt;

export const setAuth = (patch: Parameters<ReturnType<typeof useAuth.getState>['set']>[0]) => useAuth.getState().set(patch);

export function accountUserOf(user: User): AccountUser {
  const email = user.email ?? null;
  const name = (pendingName ?? user.displayName ?? '').trim() || (email ? email.split('@')[0] : '') || 'Student';
  const provider = user.providerData.some((p) => p.providerId === 'google.com') ? 'google' : 'password';
  return { uid: user.uid, name, email, provider, verified: provider === 'google' || user.emailVerified, initials: initialsOf(name, email) };
}

export const metaUserOf = (a: AccountUser) => ({ name: a.name, email: a.email, provider: a.provider, verified: a.verified });

/** Back to a fresh guest: through sync when it is loaded, else by hand. */
export async function resetDevice() {
  clearSessionCookie();
  if (syncLoaded) await syncLoaded.resetDeviceToGuest();
  else await resetLocally();
}

/** Progress and settings back to a fresh start without the sync layer (used when it cannot load). */
async function resetLocally() {
  // Ownership first, then the stores (see sync.ts resetLocalData). clearOwnership makes this tab current.
  clearOwnership();
  useProgress.setState({ ...EMPTY_PROGRESS });
  useSettings.getState().reset();
  await wipeLocalFirestore().catch(() => undefined);
}

// ---------- start ----------

/**
 * Call once at start (main.tsx), before the first render. Never loads the SDK for a guest who has not
 * used accounts. Every tab listens for the other tabs' writes (section 5.6.8), signed in or not.
 */
export function bootAccounts(): void {
  if (!isConfigured() || booted) return;
  booted = true;
  // A tab that missed a sign out or sign-in elsewhere reloads instead of writing its old copy.
  setStaleHandler(() => reloadStores(['progress', 'settings']));
  watchWithoutSession();
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
    // Back from the back-forward cache: storage events that happened meanwhile were never delivered.
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) reloadStores(['progress', 'settings']);
    });
    window.addEventListener('online', () => {
      if (useAuth.getState().sdkOffline) void prepareAccounts();
    });
    window.addEventListener('pointerdown', noteActivity, { passive: true });
    window.addEventListener('keydown', noteActivity, { passive: true });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkSharedSession();
        else noteActivity();
      });
    }
    const timer = setInterval(checkSharedSession, 60_000) as unknown as { unref?: () => void };
    timer.unref?.();
  }
  const meta = readMeta();
  if (sharedSessionOver(meta)) void endSharedSession('boot');
  else if (meta.owner || meta.redirect === 'pending') void prepareAccounts();
}

// ---------- other tabs (section 5.6.8) ----------

/** Reloads stores from storage: through sync when this tab has a session, so it is not taken for play here. */
function reloadStores(which: ('progress' | 'settings')[]) {
  if (syncActive()) {
    syncLoaded!.applyExternal(which);
    return;
  }
  rehydrating = true;
  try {
    markTabCurrent();
    // localStorage is synchronous: each store is set before rehydrate returns.
    for (const k of which) void (k === 'progress' ? useProgress : useSettings).persist.rehydrate();
  } finally {
    rehydrating = false;
  }
}

function onStorage(e: StorageEvent) {
  if (e.key === 'periodica-progress') reloadStores(['progress']);
  else if (e.key === 'periodica-settings') reloadStores(['settings']);
  else if (e.key === META_KEY || e.key === null) onMetaChange(e.oldValue);
}

/** Another tab changed the sync record: follow a change of hands, a sign-in or a sign out made there. */
function onMetaChange(oldRaw: string | null) {
  let before: { gen?: unknown; owner?: unknown } | null = null;
  try {
    before = oldRaw ? (JSON.parse(oldRaw) as { gen?: unknown; owner?: unknown }) : null;
  } catch {
    before = null;
  }
  const now = readMeta();
  if ((typeof before?.gen === 'string' ? before.gen : '0') !== now.gen) reloadStores(['progress', 'settings']);
  if (now.owner && !syncActive()) {
    // Signed in there: sign in here too (Firebase shares the session between tabs).
    if (now.owner !== before?.owner) void prepareAccounts();
  } else if (!now.owner && syncActive()) {
    // Signed out or deleted there. Stop here, and let go of the local cache so it can be removed.
    syncLoaded!.stopSync();
    void wipeLocalFirestore().catch(() => undefined);
    setAuth({ status: 'guest', user: null, sync: 'idle', error: null, leftover: false, notice: 'signed-out' });
  }
}

/**
 * Changes made while no sync session runs (offline start, or the SDK still loading) are not in the account:
 * remember that across reloads (meta.unsaved), and when each setting changed, so they are saved later.
 */
function watchWithoutSession() {
  useProgress.subscribe(() => {
    if (rehydrating || syncActive()) return;
    const m = readMeta();
    if (m.owner && !m.unsaved) writeMeta({ unsaved: true });
  });
  useSettings.subscribe((state, prev) => {
    if (rehydrating || syncActive()) return;
    const changed = SETTING_KEYS.filter((k) => state[k] !== prev[k]);
    const m = readMeta();
    if (!changed.length || !m.owner) return;
    const at = { ...m.settingsAt };
    const now = Date.now();
    for (const k of changed) at[k] = now;
    writeMeta({ settingsAt: at, unsaved: true });
  });
}

// ---------- shared computers (section 5.6.9) ----------

function noteActivity() {
  const now = Date.now();
  if (now - activityWrittenAt < 60_000) return;
  const m = readMeta();
  if (!m.owner || !m.shared) return;
  activityWrittenAt = now;
  writeMeta({ activeAt: now });
}

/** Ends a shared computer's session once the browser was closed since sign-in or it sat unused too long. */
export function checkSharedSession(): void {
  if (!ending && sharedSessionOver(readMeta())) void endSharedSession('idle');
}

/**
 * Signs a shared computer's session out and clears the device, so the next person finds a fresh start.
 * Saves first when it can. Progress that still never reached the account is kept, without the name or
 * email, as a leftover that can only go back to that account (or be cleared).
 */
function endSharedSession(reason: 'boot' | 'idle'): Promise<void> {
  return (ending ??= (async () => {
    intentionalSignOut = true;
    try {
      // Nothing above the first await: at start-up the name must be gone before the first render.
      const keep = readMeta().unsaved && !syncActive();
      writeMeta({ user: null });
      clearSessionCookie();
      setAuth({ status: 'guest', user: null, sync: 'idle', error: null, leftover: keep, notice: reason === 'idle' ? 'shared-idle' : null });
      if (syncActive() && syncLoaded!.hasUnsavedChanges()) await syncLoaded!.flushNow(8000);
      const stillUnsaved = syncActive() ? syncLoaded!.hasUnsavedChanges() : readMeta().unsaved;
      syncLoaded?.stopSync();
      if (stillUnsaved) {
        writeMeta({ shared: false });
        setAuth({ leftover: true });
      } else {
        await resetDevice();
        setAuth({ leftover: false });
      }
      // Forget the saved session: through the SDK when loaded, else straight from its storage.
      const fb = loadedFirebase();
      if (fb) await fb.sdk.signOut(fb.auth).catch(() => undefined);
      else await wipeLocalFirebaseStorage();
      await wipeLocalFirestore().catch(() => undefined);
    } finally {
      intentionalSignOut = false;
      ending = null;
    }
  })());
}

/** The account screen calls this on mount: loads the SDK and attaches the listener. Resolves false when offline. */
export function prepareAccounts(): Promise<boolean> {
  if (!isConfigured()) return Promise.resolve(false);
  if (listening && !ending) return Promise.resolve(true);
  return (preparing ??= (async () => {
    if (ending) await ending;
    if (listening) return true;
    let fb: Fb;
    try {
      fb = await loadFirebase();
    } catch {
      const status = useAuth.getState().status;
      // Back from a Google redirect but offline: show the guest screen; the redirect is finished on the next try.
      setAuth({ sdkOffline: true, ...(status === 'signed-in' ? { sync: 'offline' as const } : status === 'loading' ? { status: 'guest' as const } : {}) });
      return false;
    }
    setAuth({ sdkOffline: false });
    if (readMeta().redirect === 'pending') await finishRedirect(fb);
    if (!listening) {
      listening = true;
      fb.sdk.onAuthStateChanged(fb.auth, (user) => void onAuthChange(fb, user));
      await fb.auth.authStateReady();
    }
    setAuth({ ready: true });
    return true;
  })().finally(() => {
    preparing = null;
  }));
}

/** Coming back from a Google redirect (section 5.1). An empty result marks the redirect broken here (ADR-A6). */
async function finishRedirect(fb: Fb) {
  try {
    const res = await fb.sdk.getRedirectResult(fb.auth);
    await fb.auth.authStateReady();
    if (res?.user || fb.auth.currentUser) {
      lastAuthAt = Date.now();
      writeMeta({ redirect: null });
    } else {
      writeMeta({ redirect: 'broken' });
      setAuth({ status: 'guest', notice: 'redirect-failed' });
    }
  } catch (e) {
    writeMeta({ redirect: null });
    // The error copy comes with the sync module, so it is not part of the first load.
    const sync = await loadSync().catch(() => null);
    const code = sync?.errorCode(e) || 'unknown';
    const message = sync ? sync.authMessage(code) : 'Something went wrong. Try again.';
    setAuth({ status: 'guest', error: message ? { code, message } : null });
  }
}

async function onAuthChange(fb: Fb, user: User | null) {
  const seq = ++authSeq;
  if (user) {
    const account = accountUserOf(user);
    writeMeta({ user: metaUserOf(account) });
    setAuth({ status: 'signed-in', user: account, notice: null, error: null, leftover: false, shared: readMeta().shared });
    const sync = await loadSync().catch(() => null);
    if (seq !== authSeq || fb.auth.currentUser?.uid !== user.uid) return;
    if (sync) sync.startSync({ uid: user.uid, name: account.name });
    else setAuth({ sync: 'offline' });
    return;
  }
  // Decided now, before any await: a sign out started here may finish while we wait below.
  const meta = readMeta();
  const ended = !!meta.owner && !intentionalSignOut;
  const hadUser = !!meta.user;
  const loaded = syncModule ? await syncModule.catch(() => null) : null;
  if (seq !== authSeq) return;
  // Sync is checking whether the account was deleted on another device; it decides what happens next.
  if (loaded?.isCheckingDeletion()) return;
  loaded?.stopSync();
  if (ended) {
    // Signed out outside the app: a revoked token, a changed password, or the account deleted on another
    // device while this one was closed. The cached account (with the student's name) is no use without the
    // session, so it always goes. The local stores go too when everything in them reached the account.
    await wipeLocalFirestore().catch(() => undefined);
    if (seq !== authSeq) return;
    if (!readMeta().unsaved) {
      await resetDevice();
      setAuth({ status: 'guest', user: null, sync: 'idle', error: null, leftover: false, notice: hadUser ? 'session-ended' : null });
    } else {
      // Progress the account never got: keep it, never merged into a different account (meta.owner stays).
      writeMeta({ user: null, shared: false });
      setAuth({ status: 'guest', user: null, sync: 'idle', leftover: true, notice: hadUser ? 'session-ended-unsaved' : null });
    }
    return;
  }
  setAuth({ status: 'guest', user: null, sync: 'idle', leftover: !!readMeta().owner });
}
