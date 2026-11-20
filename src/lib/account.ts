/**
 * The account API the UI calls (docs/ACCOUNTS.md 2.5). Screens import this and `store/auth` only.
 *
 * This module holds the actions (sign in, sign up, password reset, sign out, delete) and loads with the
 * account screen. What every tab runs from the start (bootAccounts, the auth listener, other tabs, shared
 * computers) is in ./accountCore, which main.tsx imports on its own (section 8.3); it is re-exported here,
 * so this module is still the whole API. Statically neither pulls in Firebase code: the SDK comes from
 * ./firebase with import(), and the sync layer from ./sync with import().
 */
import type { User } from 'firebase/auth';
import { useAuth } from '../store/auth';
import { authMessage, errorCode, validateForm, type FieldErrors, type FormField } from './authErrors';
import { loadFirebase, loadedFirebase, wipeLocalFirebaseStorage, wipeLocalFirestore, type Fb } from './firebase';
import {
  accountUserOf,
  lastSignInHere,
  loadSync,
  metaUserOf,
  noteSignIn,
  prepareAccounts,
  resetDevice,
  setAuth,
  setPendingName,
  signingOut,
  syncActive,
} from './accountCore';
import { clearSessionCookie, readMeta, setSessionCookie, writeMeta } from './syncMeta';

export { bootAccounts, checkSharedSession, prepareAccounts } from './accountCore';
/** Form validation for the account screen (section 7.5), so screens need only this module. */
export { validateForm, validateEmail, validateName, validatePassword, type FieldErrors, type FormField } from './authErrors';

export type AuthResult =
  | { ok: true }
  /** message null: stay silent (the student cancelled). `fields` is set when the input failed validation. */
  | { ok: false; code: string; message: string | null; fields?: FieldErrors };
export type SignOutResult = { ok: true } | { ok: false; reason: 'unsaved' } | { ok: false; reason: 'error'; message: string };
export type DeleteResult = { ok: true } | { ok: false; reason: 'reauth' | 'offline' | 'error'; message: string | null };
/**
 * `shared`: this is a shared computer (section 5.6.9). The session then ends when the browser closes or
 * after SHARED_IDLE_MS without use, and the device is cleared. Default: `defaultShared()`.
 */
export type SignInOptions = { shared?: boolean };

/** Google sign in uses a redirect on small touch screens. Set to false if redirects fail often on phones (ADR-A6). */
export const GOOGLE_REDIRECT_ON_TOUCH = true;
/** deleteAccount asks for a fresh sign-in when the last one is older than this. */
export const RECENT_SIGN_IN_MS = 5 * 60_000;

const fail = (e: unknown): AuthResult => {
  const code = errorCode(e) || 'unknown';
  return { ok: false, code, message: authMessage(code) };
};

const invalid = (fields: FieldErrors): AuthResult => {
  const first = (['name', 'email', 'password'] as FormField[]).find((f) => fields[f]);
  return { ok: false, code: 'invalid-input', message: first ? fields[first]! : null, fields };
};

const OFFLINE_RESULT: AuthResult = { ok: false, code: 'auth/network-request-failed', message: authMessage('auth/network-request-failed') };

/** The shared-computer choice's default: on for computers (school labs), off for phones and tablets. */
export function defaultShared(): boolean {
  return !(typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
}

/** Records the shared-computer choice just before a sign-in (it only counts once the device has an owner). */
function applySharedChoice(opts: SignInOptions) {
  const shared = opts.shared ?? defaultShared();
  writeMeta({ shared, activeAt: Date.now() });
  if (shared) setSessionCookie();
  else clearSessionCookie();
}

async function ready(): Promise<Fb | null> {
  const ok = await prepareAccounts();
  return ok ? loadedFirebase() : null;
}

// ---------- sign in ----------

export function signInWithGoogle(opts: SignInOptions = {}): Promise<AuthResult> {
  const fb = loadedFirebase();
  // The popup must open inside the click, so the SDK must already be loaded (the button waits for `ready`).
  if (!fb) return ready().then((f) => (f ? googleWith(f, opts) : OFFLINE_RESULT));
  return googleWith(fb, opts);
}

async function googleWith(fb: Fb, opts: SignInOptions): Promise<AuthResult> {
  const { sdk, auth } = fb;
  // Synchronous, so the popup still opens inside the click.
  applySharedChoice(opts);
  const provider = new sdk.GoogleAuthProvider();
  // A shared computer always asks which account.
  provider.setCustomParameters({ prompt: 'select_account' });
  const broken = readMeta().redirect === 'broken';
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse) and (max-width: 767px)').matches;
  const redirect = async (): Promise<AuthResult> => {
    writeMeta({ redirect: 'pending' });
    try {
      await sdk.signInWithRedirect(auth, provider);
      return { ok: true };
    } catch (e) {
      writeMeta({ redirect: null });
      return fail(e);
    }
  };
  if (GOOGLE_REDIRECT_ON_TOUCH && touch && !broken) return redirect();
  try {
    await sdk.signInWithPopup(auth, provider);
    noteSignIn();
    return { ok: true };
  } catch (e) {
    if (errorCode(e) === 'auth/popup-blocked' && !broken) return redirect();
    return fail(e);
  }
}

export async function signUpWithEmail(name: string, email: string, password: string, opts: SignInOptions = {}): Promise<AuthResult> {
  const fields = validateForm({ name, email, password }, true);
  if (Object.keys(fields).length) return invalid(fields);
  const fb = await ready();
  if (!fb) return OFFLINE_RESULT;
  const displayName = name.trim();
  setPendingName(displayName);
  applySharedChoice(opts);
  try {
    const cred = await fb.sdk.createUserWithEmailAndPassword(fb.auth, email.trim(), password);
    noteSignIn();
    // Proves the address belongs to the student (section 5.6.10). Never holds up the sign-up.
    void fb.sdk.sendEmailVerification(cred.user).catch(() => undefined);
    try {
      await fb.sdk.updateProfile(cred.user, { displayName });
    } catch {
      // The account exists; the name is still saved in the account document.
    }
    if (fb.auth.currentUser?.uid === cred.user.uid) {
      const account = accountUserOf(cred.user);
      writeMeta({ user: metaUserOf(account) });
      setAuth({ user: account });
      (await loadSync().catch(() => null))?.startSync({ uid: account.uid, name: account.name });
    }
    return { ok: true };
  } catch (e) {
    return fail(e);
  } finally {
    setPendingName(null);
  }
}

export async function signInWithEmail(email: string, password: string, opts: SignInOptions = {}): Promise<AuthResult> {
  const fields = validateForm({ email, password }, false);
  if (Object.keys(fields).length) return invalid(fields);
  const fb = await ready();
  if (!fb) return OFFLINE_RESULT;
  applySharedChoice(opts);
  try {
    await fb.sdk.signInWithEmailAndPassword(fb.auth, email.trim(), password);
    noteSignIn();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** The same answer whether or not the email has an account (no account discovery). */
export async function sendReset(email: string): Promise<AuthResult> {
  const fields = validateForm({ email }, false);
  if (Object.keys(fields).length) return invalid(fields);
  const fb = await ready();
  if (!fb) return OFFLINE_RESULT;
  try {
    await fb.sdk.sendPasswordResetEmail(fb.auth, email.trim());
    return { ok: true };
  } catch (e) {
    const code = errorCode(e);
    if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') return { ok: true };
    return fail(e);
  }
}

/** Sends the verification email again (signed in with email, not yet verified). */
export async function resendVerification(): Promise<AuthResult> {
  const fb = await ready();
  const user = fb?.auth.currentUser;
  if (!fb) return OFFLINE_RESULT;
  if (!user) return { ok: false, code: 'auth/user-token-expired', message: authMessage('auth/user-token-expired') };
  try {
    await fb.sdk.sendEmailVerification(user);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Reloads the user, so a verification done in another tab or on the phone shows here. Quiet on failure. */
export async function refreshUser(): Promise<void> {
  const fb = loadedFirebase();
  const user = fb?.auth.currentUser;
  if (!fb || !user) return;
  try {
    await user.reload();
  } catch {
    return;
  }
  if (fb.auth.currentUser?.uid !== user.uid) return;
  const account = accountUserOf(user);
  writeMeta({ user: metaUserOf(account) });
  setAuth({ user: account });
}

/** Google: reauthenticateWithPopup. Email: reauthenticateWithCredential with the password. */
export async function reauthenticate(password?: string): Promise<AuthResult> {
  const fb = await ready();
  if (!fb) return OFFLINE_RESULT;
  const user = fb.auth.currentUser;
  if (!user) return { ok: false, code: 'auth/user-token-expired', message: authMessage('auth/user-token-expired') };
  try {
    if (user.providerData.some((p) => p.providerId === 'google.com')) {
      const provider = new fb.sdk.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await fb.sdk.reauthenticateWithPopup(user, provider);
    } else {
      const fields = validateForm({ password: password ?? '' }, false);
      if (Object.keys(fields).length) return invalid(fields);
      await fb.sdk.reauthenticateWithCredential(user, fb.sdk.EmailAuthProvider.credential(user.email ?? '', password!));
    }
    noteSignIn();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- sign out and delete ----------

/** Saves, signs out, resets the device to a fresh guest. With unsaved offline changes it returns 'unsaved' unless force. */
export async function signOutAndReset(opts: { force?: boolean } = {}): Promise<SignOutResult> {
  const force = !!opts.force;
  const fb = await loadFirebase().catch(() => null);
  const sync = fb ? await loadSync().catch(() => null) : null;
  if (sync?.isActive()) {
    if (sync.hasUnsavedChanges()) {
      const r = await sync.flushNow(8000);
      if (r !== 'saved' && !force) return { ok: false, reason: 'unsaved' };
    }
  } else if (readMeta().unsaved && !force) {
    // No session to save with (the SDK cannot load offline): what was played since the last save is only here.
    return { ok: false, reason: 'unsaved' };
  }
  return signingOut(async (): Promise<SignOutResult> => {
    sync?.stopSync();
    if (fb) {
      try {
        await fb.sdk.signOut(fb.auth);
      } catch (e) {
        if (!force) return { ok: false, reason: 'error', message: authMessage(errorCode(e) || 'unknown') ?? 'Something went wrong. Try again.' };
      }
    }
    await resetDevice();
    // Without the SDK the saved session is removed by hand, so the next start is a guest.
    if (!fb) await wipeLocalFirebaseStorage();
    setAuth({ status: 'guest', user: null, sync: 'idle', error: null, leftover: false, notice: 'signed-out' });
    return { ok: true };
  });
}

/** When the current sign-in happened: the ID token's auth_time, or a sign-in in this tab. */
async function lastSignIn(user: User): Promise<number> {
  const token = await user.getIdTokenResult();
  const authTime = Date.parse(token.authTime);
  return Math.max(Number.isFinite(authTime) ? authTime : 0, lastSignInHere());
}

/** Deletes users/{uid}, then the auth user, then resets the device. 'reauth' means a fresh sign-in is needed first. */
export async function deleteAccount(): Promise<DeleteResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline', message: null };
  const fb = await ready();
  const user = fb?.auth.currentUser;
  if (!fb || !user) return { ok: false, reason: fb ? 'error' : 'offline', message: fb ? 'Something went wrong. Try again.' : null };
  try {
    if (Date.now() - (await lastSignIn(user)) > RECENT_SIGN_IN_MS) return { ok: false, reason: 'reauth', message: null };
  } catch (e) {
    return errorCode(e) === 'auth/network-request-failed' ? { ok: false, reason: 'offline', message: null } : { ok: false, reason: 'error', message: authMessage(errorCode(e) || 'unknown') };
  }
  const sync = await loadSync().catch(() => null);
  if (!sync) return { ok: false, reason: 'offline', message: null };
  const name = useAuth.getState().user?.name ?? 'Student';
  sync.stopSync();
  // The document first: the rules need a live user to delete it (there is no server code).
  try {
    await sync.deleteRemoteDoc(user.uid);
  } catch (e) {
    sync.startSync({ uid: user.uid, name });
    const code = errorCode(e);
    return code === 'unavailable' || code === 'deadline-exceeded' ? { ok: false, reason: 'offline', message: null } : { ok: false, reason: 'error', message: 'Something went wrong. Try again.' };
  }
  return signingOut(async (): Promise<DeleteResult> => {
    try {
      await fb.sdk.deleteUser(user);
    } catch (e) {
      // The document is gone but the login is not: recreate the document from this device's copy.
      writeMeta({ docSeen: false });
      sync.startSync({ uid: user.uid, name });
      const code = errorCode(e);
      if (code === 'auth/requires-recent-login') return { ok: false, reason: 'reauth', message: null };
      if (code === 'auth/network-request-failed') return { ok: false, reason: 'offline', message: null };
      return { ok: false, reason: 'error', message: authMessage(code || 'unknown') };
    }
    await resetDevice();
    setAuth({ status: 'guest', user: null, sync: 'idle', error: null, leftover: false, notice: 'deleted' });
    return { ok: true };
  });
}

/**
 * "Clear this device" on the guest screen while it holds an ended session's unsaved progress (`leftover`):
 * removes it for good, so the next person starts fresh.
 */
export async function clearThisDevice(): Promise<void> {
  if (syncActive()) return;
  await resetDevice();
  await wipeLocalFirestore().catch(() => undefined);
  setAuth({ status: 'guest', user: null, sync: 'idle', error: null, leftover: false, notice: 'cleared' });
}

/** Dismisses the notice at the top of the guest screen. */
export function dismissNotice(): void {
  setAuth({ notice: null });
}
