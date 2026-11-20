import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Without VITE_FIREBASE_PROJECT_ID, accounts are off: nothing imports the SDK and nothing is fetched
 * (docs/ACCOUNTS.md 8.2). The SDK module is replaced by a mock whose factory records that it ran,
 * which only happens if some code path actually imports it.
 */
const loaded = vi.hoisted(() => ({ sdk: 0 }));

vi.mock('../src/lib/firebase-sdk', () => {
  loaded.sdk++;
  return {};
});

const FIREBASE_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_EMULATORS',
];

describe('accounts without config', () => {
  const fetchSpy = vi.fn(() => Promise.reject(new Error('no network in this test')));

  beforeEach(() => {
    vi.resetModules();
    loaded.sdk = 0;
    for (const k of FIREBASE_ENV) vi.stubEnv(k, '');
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test('isConfigured() is false and loadFirebase() rejects without loading anything', async () => {
    const fb = await import('../src/lib/firebase');
    expect(fb.isConfigured()).toBe(false);
    expect(fb.CONFIGURED).toBe(false);
    expect(fb.firebaseConfig).toBeNull();
    await expect(fb.loadFirebase()).rejects.toThrow();
    expect(loaded.sdk).toBe(0);
  });

  test('importing the app modules and using the account actions imports no Firebase code', async () => {
    const { useAuth } = await import('../src/store/auth');
    const account = await import('../src/lib/account');
    await import('../src/store/progress');
    await import('../src/store/settings');

    expect(useAuth.getState().status).toBe('unconfigured');
    account.bootAccounts();
    expect(await account.prepareAccounts()).toBe(false);
    expect((await account.signInWithEmail('sam@example.com', 'password1')).ok).toBe(false);
    expect((await account.signInWithGoogle()).ok).toBe(false);

    expect(loaded.sdk).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useAuth.getState().status).toBe('unconfigured');
  });

  test('control: a configured build does import the SDK when asked', async () => {
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-periodica');
    const fb = await import('../src/lib/firebase');
    expect(fb.isConfigured()).toBe(true);
    await fb.loadFirebase().catch(() => undefined);
    expect(loaded.sdk).toBe(1);
  });
});
