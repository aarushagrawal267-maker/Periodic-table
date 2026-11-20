import { create } from 'zustand';
import { isConfigured } from '../lib/firebase';
import { readMeta, sharedSessionOver } from '../lib/syncMeta';

/**
 * Account state the UI reads (docs/ACCOUNTS.md 2.4). Not persisted, holds no actions: those live in
 * src/lib/account.ts. The initial state is computed synchronously, with no SDK, so a signed-in device
 * shows its avatar at once and a guest or an unconfigured build costs nothing.
 */

export type AuthStatus = 'unconfigured' | 'loading' | 'guest' | 'signed-in';
export type SyncStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'offline' | 'error' | 'outdated';
export type Provider = 'google' | 'password';

export interface AccountUser {
  uid: string;
  /** displayName, else the part of the email before @, else "Student". */
  name: string;
  email: string | null;
  /** 'google' if any providerData entry is google.com, else 'password'. */
  provider: Provider;
  initials: string;
  /** Email sign-ups start unverified until the link in the verification email is opened. Google is verified. */
  verified: boolean;
}

export type Notice =
  /** After sign out on this device. */
  | 'signed-out'
  /** After deleting the account here. */
  | 'deleted'
  /** The account was deleted on another device. */
  | 'deleted-elsewhere'
  /** Firebase signed this device out (token revoked, password changed, account deleted elsewhere); all was saved, so the device was cleared. */
  | 'session-ended'
  /** As above, but this device had progress the account does not have yet: it is kept (see `leftover`). */
  | 'session-ended-unsaved'
  /** A shared computer's session ended after a while without use (section 5.6.9). */
  | 'shared-idle'
  /** "Clear this device" finished. */
  | 'cleared'
  /** A Google redirect came back empty. */
  | 'redirect-failed'
  | null;

export interface AuthData {
  status: AuthStatus;
  user: AccountUser | null;
  sync: SyncStatus;
  /** Background errors (redirect result, sync), already turned into copy. Form errors are returned by the actions. */
  error: { code: string; message: string } | null;
  notice: Notice;
  /** The SDK is loaded and the auth listener is attached. The Google button needs it (a popup must open inside the click). */
  ready: boolean;
  /** The SDK could not be loaded (offline and not cached). */
  sdkOffline: boolean;
  /**
   * Signed out, but the local stores still hold an account's progress that never reached it (its session
   * ended while offline). It is never merged into another account; the guest screen offers "Clear this device".
   */
  leftover: boolean;
  /** Signed in as a shared computer (section 5.6.9). */
  shared: boolean;
}

interface AuthState extends AuthData {
  set: (patch: Partial<AuthData>) => void;
}

/** First letter of the first two words, uppercased; else the first letter of the email; else "?". */
export function initialsOf(name: string, email: string | null): string {
  const first = (s: string) => {
    const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
    if (Seg) {
      for (const { segment } of new Seg(undefined, { granularity: 'grapheme' }).segment(s)) return segment;
      return '';
    }
    return Array.from(s)[0] ?? '';
  };
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const fromName = words.map(first).join('').toLocaleUpperCase('en-US');
  if (fromName) return fromName;
  const e = email?.trim();
  if (e) return first(e).toLocaleUpperCase('en-US');
  return '?';
}

function initialData(): AuthData {
  const base: AuthData = { status: 'guest', user: null, sync: 'idle', error: null, notice: null, ready: false, sdkOffline: false, leftover: false, shared: false };
  if (!isConfigured()) return { ...base, status: 'unconfigured' };
  const meta = readMeta();
  if (meta.redirect === 'pending') return { ...base, status: 'loading' };
  // A shared computer whose session is over shows nobody's name, even for the moment before bootAccounts ends it.
  if (meta.owner && meta.user && !sharedSessionOver(meta)) {
    const { name, email, provider, verified } = meta.user;
    return {
      ...base,
      status: 'signed-in',
      sync: 'loading',
      shared: meta.shared,
      user: { uid: meta.owner, name, email, provider, verified, initials: initialsOf(name, email) },
    };
  }
  return { ...base, leftover: !!meta.owner && !meta.user };
}

export const useAuth = create<AuthState>()((set) => ({
  ...initialData(),
  set: (patch) => set(patch),
}));
