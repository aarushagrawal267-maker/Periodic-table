import { describe, expect, test } from 'vitest';
import { AUTH_CODES, GENERIC_ERROR, authMessage, syncMessage, validateForm, validateName } from '../src/lib/authErrors';

/** The table in docs/ACCOUNTS.md 7.7. */
const TABLE: Record<string, string | null> = {
  'auth/invalid-credential': 'That email and password do not match. Check them and try again.',
  'auth/wrong-password': 'That email and password do not match. Check them and try again.',
  'auth/user-not-found': 'That email and password do not match. Check them and try again.',
  'auth/invalid-login-credentials': 'That email and password do not match. Check them and try again.',
  'auth/invalid-email': 'Enter an email address like name@example.com',
  'auth/missing-email': 'Enter your email address',
  'auth/missing-password': 'Enter your password',
  'auth/email-already-in-use': 'There is already an account with this email. Sign in instead.',
  'auth/weak-password': 'Use at least 8 characters',
  'auth/password-does-not-meet-requirements': 'Use at least 8 characters',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes, then try again.',
  'auth/network-request-failed': 'You are offline. Connect to the internet and try again.',
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site, or use your email.',
  'auth/popup-closed-by-user': null,
  'auth/cancelled-popup-request': null,
  'auth/user-cancelled': null,
  'auth/redirect-cancelled-by-user': null,
  'auth/account-exists-with-different-credential': 'This email already has an account with a different way to sign in. Use that one.',
  'auth/credential-already-in-use': 'This sign-in is already used by another account',
  'auth/requires-recent-login': 'For your security, sign in again to continue',
  'auth/user-disabled': 'This account is turned off',
  'auth/user-token-expired': 'You were signed out. Sign in again.',
  'auth/invalid-user-token': 'You were signed out. Sign in again.',
  'auth/operation-not-allowed': 'This way of signing in is not turned on yet',
  'auth/unauthorized-domain': 'Sign in is not set up for this web address yet',
  'auth/invalid-api-key': 'Accounts are not set up correctly yet',
  'auth/app-not-authorized': 'Accounts are not set up correctly yet',
  'auth/api-key-not-valid': 'Accounts are not set up correctly yet',
  'auth/web-storage-unsupported': 'Your browser is blocking the storage sign in needs. Turn off private browsing or try another browser.',
  'auth/operation-not-supported-in-this-environment': 'Google sign in does not work in this browser. Use your email instead.',
  'auth/quota-exceeded': 'Too many sign-ins right now. Try again later.',
  'auth/timeout': 'Sign in took too long. Try again.',
};

/** Copy rules (docs/DESIGN.md): no "!", no product or code names; one sentence has no trailing period, two or more keep theirs. */
function checkCopy(m: string) {
  expect(m).not.toMatch(/!/);
  expect(m).not.toMatch(/firebase/i);
  expect(m).not.toMatch(/auth\//);
  const sentences = m.split(/(?<=\.)\s+/).length;
  if (sentences === 1) expect(m.endsWith('.'), m).toBe(false);
  else expect(m.endsWith('.'), m).toBe(true);
}

describe('authMessage', () => {
  test('every code in the table has its copy', () => {
    for (const [code, message] of Object.entries(TABLE)) expect(authMessage(code), code).toBe(message);
    expect(AUTH_CODES.sort()).toEqual(Object.keys(TABLE).sort());
  });

  test('unknown codes get the generic line', () => {
    expect(authMessage('auth/something-new')).toBe(GENERIC_ERROR);
    expect(authMessage('')).toBe(GENERIC_ERROR);
    expect(authMessage('auth/api-key-not-valid.-please-pass-a-valid-api-key.')).toBe('Accounts are not set up correctly yet');
  });

  test('copy follows the design rules', () => {
    for (const code of AUTH_CODES) {
      const m = authMessage(code);
      if (m) checkCopy(m);
    }
    checkCopy(GENERIC_ERROR);
    for (const code of ['permission-denied', 'invalid-argument', 'resource-exhausted', 'internal']) checkCopy(syncMessage(code));
  });
});

describe('syncMessage', () => {
  test('save errors', () => {
    expect(syncMessage('permission-denied')).toBe('Could not save to your account. Your progress is still on this device.');
    expect(syncMessage('invalid-argument')).toBe('Could not save to your account. Your progress is still on this device.');
    expect(syncMessage('resource-exhausted')).toBe('Saving is paused for now. Your progress is still on this device.');
    expect(syncMessage('anything')).toBe('Could not save to your account. Your progress is still on this device.');
  });
});

describe('form validation (section 7.5)', () => {
  test('sign up', () => {
    expect(validateForm({ name: '  ', email: '', password: '' }, true)).toEqual({
      name: 'Enter a name or nickname',
      email: 'Enter your email address',
      password: 'Enter your password',
    });
    expect(validateForm({ name: 'x'.repeat(41), email: 'sam@school', password: 'short' }, true)).toEqual({
      name: 'Use 40 characters or fewer',
      email: 'Enter an email address like name@example.com',
      password: 'Use at least 8 characters',
    });
    expect(validateForm({ name: 'Sam', email: ' sam@example.com ', password: 'long enough' }, true)).toEqual({});
  });

  test('names are measured the way the security rules measure them (UTF-16 units)', () => {
    // 20 emoji are 40 units: accepted. 21 are 42: refused before any network call (docs/ACCOUNTS.md 7.5).
    expect(validateName('🧪'.repeat(20))).toBeNull();
    expect(validateName('🧪'.repeat(21))).toBe('Use a shorter name. Emoji count as two characters.');
    expect(validateName('🧪'.repeat(25))).not.toBeNull();
    expect(validateName('a'.repeat(38) + '🧪')).toBeNull();
    expect(validateName('a'.repeat(39) + '🧪')).not.toBeNull();
    expect(validateName('a'.repeat(35) + '🧪🧪🧪')).not.toBeNull();
    expect(validateName('x'.repeat(41))).toBe('Use 40 characters or fewer');
    checkCopy(validateName('🧪'.repeat(21))!);
  });

  test('sign in only needs a password, not a long one', () => {
    expect(validateForm({ email: 'sam@example.com', password: 'short' }, false)).toEqual({});
    expect(validateForm({ email: 'sam@example.com', password: '' }, false)).toEqual({ password: 'Enter your password' });
  });

  test('messages follow the copy rules', () => {
    const all = validateForm({ name: '', email: 'bad', password: 'x' }, true);
    for (const m of Object.values(all)) checkCopy(m!);
  });
});
