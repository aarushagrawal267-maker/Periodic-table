/**
 * Firebase error codes to plain sentences (docs/ACCOUNTS.md 7.7 and 7.5). No exclamation marks, no
 * "Firebase", no codes; one-line messages have no trailing period, two-sentence ones keep theirs.
 */

const NO_MATCH = 'That email and password do not match. Check them and try again.';
const OFFLINE = 'You are offline. Connect to the internet and try again.';
const NOT_SET_UP = 'Accounts are not set up correctly yet';
const SIGNED_OUT = 'You were signed out. Sign in again.';
const SHORT_PASSWORD = 'Use at least 8 characters';

const AUTH: Record<string, string | null> = {
  'auth/invalid-credential': NO_MATCH,
  'auth/wrong-password': NO_MATCH,
  'auth/user-not-found': NO_MATCH,
  'auth/invalid-login-credentials': NO_MATCH,
  'auth/invalid-email': 'Enter an email address like name@example.com',
  'auth/missing-email': 'Enter your email address',
  'auth/missing-password': 'Enter your password',
  'auth/email-already-in-use': 'There is already an account with this email. Sign in instead.',
  'auth/weak-password': SHORT_PASSWORD,
  'auth/password-does-not-meet-requirements': SHORT_PASSWORD,
  'auth/too-many-requests': 'Too many tries. Wait a few minutes, then try again.',
  'auth/network-request-failed': OFFLINE,
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site, or use your email.',
  'auth/popup-closed-by-user': null,
  'auth/cancelled-popup-request': null,
  'auth/user-cancelled': null,
  'auth/redirect-cancelled-by-user': null,
  'auth/account-exists-with-different-credential': 'This email already has an account with a different way to sign in. Use that one.',
  'auth/credential-already-in-use': 'This sign-in is already used by another account',
  'auth/requires-recent-login': 'For your security, sign in again to continue',
  'auth/user-disabled': 'This account is turned off',
  'auth/user-token-expired': SIGNED_OUT,
  'auth/invalid-user-token': SIGNED_OUT,
  'auth/operation-not-allowed': 'This way of signing in is not turned on yet',
  'auth/unauthorized-domain': 'Sign in is not set up for this web address yet',
  'auth/invalid-api-key': NOT_SET_UP,
  'auth/app-not-authorized': NOT_SET_UP,
  'auth/api-key-not-valid': NOT_SET_UP,
  'auth/web-storage-unsupported': 'Your browser is blocking the storage sign in needs. Turn off private browsing or try another browser.',
  'auth/operation-not-supported-in-this-environment': 'Google sign in does not work in this browser. Use your email instead.',
  'auth/quota-exceeded': 'Too many sign-ins right now. Try again later.',
  'auth/timeout': 'Sign in took too long. Try again.',
};

/** Every code with its own message, for tests and documentation. */
export const AUTH_CODES = Object.keys(AUTH);

export const GENERIC_ERROR = 'Something went wrong. Try again.';

/** null: say nothing (the student cancelled). */
export function authMessage(code: string): string | null {
  if (code in AUTH) return AUTH[code];
  // Newer SDKs report a rejected API key as auth/api-key-not-valid.-please-pass-a-valid-api-key.
  if (code.startsWith('auth/api-key-not-valid')) return NOT_SET_UP;
  return GENERIC_ERROR;
}

const SAVE_FAILED = 'Could not save to your account. Your progress is still on this device.';

/** Background save errors. `unavailable` and `deadline-exceeded` never reach here: they mean offline. */
export function syncMessage(code: string): string {
  if (code === 'resource-exhausted') return 'Saving is paused for now. Your progress is still on this device.';
  return SAVE_FAILED;
}

/** The code of a thrown Firebase error, or '' for anything else. */
export function errorCode(e: unknown): string {
  return typeof e === 'object' && e !== null && 'code' in e && typeof (e as { code: unknown }).code === 'string' ? (e as { code: string }).code : '';
}

// ---------- validation before any network call (section 7.5) ----------

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;
export const MAX_NAME_LENGTH = 40;

export type FormField = 'name' | 'email' | 'password';
export type FieldErrors = Partial<Record<FormField, string>>;

export function validateName(name: string): string | null {
  const t = name.trim();
  if (!t) return 'Enter a name or nickname';
  if (Array.from(t).length > MAX_NAME_LENGTH) return 'Use 40 characters or fewer';
  // The security rules count UTF-16 units (`size()`), where most emoji take two.
  if (t.length > MAX_NAME_LENGTH) return 'Use a shorter name. Emoji count as two characters.';
  return null;
}

export function validateEmail(email: string): string | null {
  const t = email.trim();
  if (!t) return 'Enter your email address';
  if (!EMAIL_RE.test(t)) return 'Enter an email address like name@example.com';
  return null;
}

/** `creating`: a new password must be at least 8 characters; signing in only needs one. */
export function validatePassword(password: string, creating: boolean): string | null {
  if (!password) return 'Enter your password';
  if (creating && password.length < MIN_PASSWORD) return 'Use at least 8 characters';
  return null;
}

/** Field errors for a form, in the order the fields appear. Empty when the input is fine. */
export function validateForm(form: { name?: string; email?: string; password?: string }, creating: boolean): FieldErrors {
  const out: FieldErrors = {};
  if (form.name !== undefined) {
    const e = validateName(form.name);
    if (e) out.name = e;
  }
  if (form.email !== undefined) {
    const e = validateEmail(form.email);
    if (e) out.email = e;
  }
  if (form.password !== undefined) {
    const e = validatePassword(form.password, creating);
    if (e) out.password = e;
  }
  return out;
}
