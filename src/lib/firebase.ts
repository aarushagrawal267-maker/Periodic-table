/**
 * Firebase config and the lazy SDK load (docs/ACCOUNTS.md 2.3, ADR-A5).
 *
 * Nothing here imports the SDK statically: `./firebase-sdk` is only ever loaded with import(), and only
 * when the build is configured. Without VITE_FIREBASE_PROJECT_ID accounts are off and nothing is fetched.
 */
import type { FirebaseApp, FirebaseOptions } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

const env = import.meta.env;

/** True when VITE_FIREBASE_PROJECT_ID is set at build time. A constant, so dead branches are removed. */
export const CONFIGURED: boolean = !!import.meta.env.VITE_FIREBASE_PROJECT_ID;

export function isConfigured(): boolean {
  return CONFIGURED;
}

/**
 * The emulators are only for development and tests: the flag counts in a dev server, or with a demo-*
 * project (which reaches nothing real). A production build of a real project never talks to 127.0.0.1,
 * whatever env file it was built with, so passwords and ID tokens cannot go to a local process.
 * vite.config.ts also refuses to build that combination.
 */
export function emulatorsAllowed(flag: string | undefined, projectId: string | undefined, dev: boolean): boolean {
  return flag === '1' && (dev || String(projectId ?? '').startsWith('demo-'));
}

/** VITE_FIREBASE_EMULATORS === '1', in a dev server or for a demo-* project only. */
export function usesEmulators(): boolean {
  return emulatorsAllowed(env.VITE_FIREBASE_EMULATORS, env.VITE_FIREBASE_PROJECT_ID, !!env.DEV);
}

/** Built from the six VITE_FIREBASE_* vars; null when not configured. */
export const firebaseConfig: FirebaseOptions | null = CONFIGURED
  ? {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    }
  : null;

/**
 * The local emulators' addresses. Null in a build without the flag (the env check is written out so the bundler
 * can see it), so a production bundle does not even carry them.
 */
const EMULATORS =
  import.meta.env.VITE_FIREBASE_EMULATORS === '1' ? { authUrl: 'http://127.0.0.1:9099', firestore: { host: '127.0.0.1', port: 8080 } } : null;

export interface Fb {
  sdk: typeof import('./firebase-sdk');
  app: FirebaseApp;
  auth: Auth;
  /** Created on first use, and again after wipeLocalFirestore(). Read it each time; do not keep it. */
  readonly db: Firestore;
}

let loading: Promise<Fb> | null = null;
let current: Fb | null = null;
let dbInstance: Firestore | null = null;

function makeDb(sdk: Fb['sdk'], app: FirebaseApp): Firestore {
  let db: Firestore;
  try {
    db = sdk.initializeFirestore(app, {
      localCache: sdk.persistentLocalCache({ tabManager: sdk.persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  } catch {
    // IndexedDB unavailable (some private windows): the session still syncs, with a memory cache.
    db = sdk.initializeFirestore(app, { localCache: sdk.memoryLocalCache(), ignoreUndefinedProperties: true });
  }
  if (EMULATORS && usesEmulators()) sdk.connectFirestoreEmulator(db, EMULATORS.firestore.host, EMULATORS.firestore.port);
  return db;
}

/**
 * Loads the SDK chunk and initialises app, auth and Firestore once (memoised).
 * Rejects when not configured, or when offline and the chunk is not cached; a later call retries.
 */
export function loadFirebase(): Promise<Fb> {
  if (!CONFIGURED || !firebaseConfig) return Promise.reject(new Error('accounts-not-configured'));
  if (current) return Promise.resolve(current);
  if (!loading) {
    const config = firebaseConfig;
    loading = import('./firebase-sdk')
      .then((sdk) => {
        const app = sdk.initializeApp(config);
        // App Check (docs/ACCOUNTS.md 10, step 13): with it enforced, only this web app can use the project's
        // Auth and Firestore, which is what stops scripts from using up the free quota. Before auth and Firestore.
        const appCheckKey = env.VITE_FIREBASE_APPCHECK_SITE_KEY;
        if (appCheckKey && !usesEmulators()) {
          sdk.initializeAppCheck(app, { provider: new sdk.ReCaptchaEnterpriseProvider(appCheckKey), isTokenAutoRefreshEnabled: true });
        }
        const auth = sdk.initializeAuth(app, {
          persistence: [sdk.indexedDBLocalPersistence, sdk.browserLocalPersistence],
          popupRedirectResolver: sdk.browserPopupRedirectResolver,
        });
        if (EMULATORS && usesEmulators()) sdk.connectAuthEmulator(auth, EMULATORS.authUrl, { disableWarnings: true });
        auth.languageCode = 'en';
        const fb: Fb = {
          sdk,
          app,
          auth,
          get db() {
            return (dbInstance ??= makeDb(sdk, app));
          },
        };
        current = fb;
        return fb;
      })
      .catch((e: unknown) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}

/** The loaded SDK, or null when it has not been loaded in this page. Never triggers a load. */
export function loadedFirebase(): Fb | null {
  return current;
}

/**
 * Removes the cached copy of the account from this browser: terminate(db), then
 * clearIndexedDbPersistence(db). The next use of `fb.db` creates a fresh Firestore instance.
 * When the SDK is not loaded (offline), the IndexedDB databases are deleted by name instead.
 */
export async function wipeLocalFirestore(): Promise<void> {
  if (!current) {
    await deleteDatabases((name) => name.startsWith('firestore/'));
    return;
  }
  const db = dbInstance;
  dbInstance = null;
  if (!db) {
    await deleteDatabases((name) => name.startsWith('firestore/'));
    return;
  }
  await current.sdk.terminate(db);
  try {
    await current.sdk.clearIndexedDbPersistence(db);
  } catch {
    // Another tab still has it open; it is cleared on that tab's next sign out or reload.
  }
}

/**
 * For signing out while the SDK cannot load (offline): forget the saved session and the cached
 * account by deleting Firebase's IndexedDB databases directly.
 */
export async function wipeLocalFirebaseStorage(): Promise<void> {
  await deleteDatabases((name) => name.startsWith('firestore/') || name === 'firebaseLocalStorageDb');
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('firebase:')) localStorage.removeItem(k);
    }
  } catch {
    // Storage unavailable: nothing was saved there either.
  }
}

async function deleteDatabases(match: (name: string) => boolean) {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return;
  try {
    const list = await indexedDB.databases();
    await Promise.all(
      list
        .map((d) => d.name)
        .filter((n): n is string => !!n && match(n))
        .map(
          (n) =>
            new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(n);
              req.onsuccess = req.onerror = req.onblocked = () => resolve();
            }),
        ),
    );
  } catch {
    // Best effort.
  }
}
