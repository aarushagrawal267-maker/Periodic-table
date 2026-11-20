# Periodica accounts contract

This is the contract the builders follow for the account system: optional accounts with Google and email sign in, every signed-in student's progress and settings stored in Cloud Firestore and kept in sync across devices, and a guest mode that stays exactly as it is today.

Read this together with `docs/DESIGN.md` (the unslop design contract). Every screen and string below follows it: sentence case, no exclamation marks, no trailing periods on headlines, labels, buttons or one-line status text, one accent (cobalt), the warm dark ramp, the existing component classes.

---

## 0. Scope and fixed decisions

These come from the owner and are not reopened here.

- Accounts are optional. A guest plays offline with progress in `localStorage`, exactly as today.
- When a guest signs in or creates an account, the guest progress merges into the account. Nothing a student earned is lost.
- Signed in, `useProgress` (`src/store/progress.ts`) and `useSettings` (`src/store/settings.ts`) are stored in `users/{uid}` and synced both ways, with offline support and debounced writes.
- Email sign up asks for a name, email and password; sign in asks for email and password; "Forgot password" sends a reset email. Google uses `signInWithPopup`, and `signInWithRedirect` when the popup is blocked or on small touch screens.
- The signed-in screen shows name, email, provider, sync status, sign out and delete account.
- Sign out returns the device to a fresh guest state after a confirmation.
- Config comes from `VITE_FIREBASE_*` env vars. Without `VITE_FIREBASE_PROJECT_ID` accounts are unavailable and the app makes zero network calls. The SDK is loaded with dynamic `import()`.
- Development and tests use the emulators with project id `demo-periodica`.

---

## 1. Architecture decisions

Short ADRs. Each names what it gives up.

### ADR-A1: Local first, server second

**Context.** The app already keeps all state in two zustand stores persisted to `localStorage`, and every screen reads them synchronously. It must keep working offline and on a cold start with no network.

**Decision.** The zustand stores stay the source the UI reads, signed in or not. The sync layer sits beside them: it watches the stores, merges remote state into them, and flushes local state to Firestore. Screens never talk to Firebase. `localStorage` is the durable offline copy; the Firestore persistent cache is used for reads while offline (a cold start offline still sees the last known account state) and for a fast first snapshot.

**Consequences.** No screen changes for sync, no loading states in gameplay. The price: two local copies (zustand and the Firestore cache) that the sync layer must keep consistent, and multi-tab behaviour is only as good as `localStorage` (section 11).

### ADR-A2: Writes are transactions that merge with the server copy

**Context.** Two devices, one of them offline for days, both hold progress the other lacks. A plain `setDoc` from the stale device would overwrite the server copy, and if the other device has signed out since (and cleared itself, by design), that progress is gone for good.

**Options.**
1. `setDoc` with Firestore's offline write queue. Simple, works offline, but last write wins on the whole `progress` field: lost updates.
2. Field-level `updateDoc` with `increment()`. Works offline, but increments are not idempotent under retries, the per-field writes cannot keep compound values (best score with its stars and time) consistent, and the merge rules for non-counters still need a read.
3. `runTransaction`: read the server document, merge local into it with a pure join, write the result. Atomic, retried by the SDK on contention, never loses an update. Needs a connection.

**Decision.** Option 3. Offline, nothing is lost because `localStorage` holds it (ADR-A1); the flush simply waits for the connection.

**Consequences.** One read plus one write per flush (debounced to at most one every 2 seconds, section 5.4). Writes do not use Firestore's offline queue, so sign-out never strands queued writes for another user. "Saving" can only finish online, which the status copy says plainly.

### ADR-A3: Progress is a join semilattice, counters are per-device slots

**Context.** The merge must be idempotent (applying the same remote state twice changes nothing, which is also what kills echo loops), commutative, associative, and must never lose or double count. A plain number like `xp` cannot satisfy that: `max` loses the other device's XP, `sum` double counts on every re-merge.

**Decision.** Additive counters (XP, rounds, placements, mistakes, quizzes, play time, today's XP) are stored as a grow-only counter per replica: `slots[replicaId]`, each slot written only by its own replica, merged by per-field `max`, totalled by summing slots. Everything else is a lattice with an explicit join (max, union, earliest, latest). Section 4 lists every field.

**Consequences.** Correct by construction and testable as laws. The document carries one small slot per browser that ever used the account, plus one per guest session that was merged in (about 150 bytes each). Explicit resets need an `epoch` (section 4.6), because a join can never go down.

### ADR-A4: One document per user

**Context.** The transaction in ADR-A2 must read and write the whole state atomically.

**Decision.** `users/{uid}` holds everything. Section 3.3 bounds its size at well under 200 KB in the worst case and about 20 KB for a typical student after a year, against Firestore's 1 MiB limit.

**Consequences.** One read per sync, one listener per device, simple rules. If Periodica ever needs per-round history or class views, those go in subcollections, not in this document.

### ADR-A5: The SDK loads only when needed

**Decision.** `firebase/*` is imported only by `src/lib/firebase-sdk.ts`, which is only ever loaded with `import()`. A guest who never opens the account screen never downloads it. A signed-in device loads it at start. The chunk is excluded from the service-worker precache and cached at runtime after first use (section 8.3).

**Consequences.** The guest bundle and offline start stay as they are. A signed-in device that goes offline right after an app update starts without the SDK; it plays normally and shows "Offline, will save when you reconnect" until it can load it.

### ADR-A6: Google redirect is a fallback that heals itself

**Context.** The app is served from `aarushagrawal267-maker.github.io`, while Firebase's auth handler lives on `<project>.firebaseapp.com`. Browsers that partition third-party storage (Safari, and Chrome and Firefox increasingly) can lose a redirect sign-in on such setups, and GitHub Pages cannot host the auth helper on the same origin.

**Decision.** Follow the owner's rule (popup by default, redirect when the popup is blocked or on small touch screens), and detect a redirect that comes back empty: the device is then marked `redirect: 'broken'` and uses the popup from then on, with a plain message (section 7.6).

**Consequences.** One failed attempt at most per device. If phones fail often in real use, the owner can switch `GOOGLE_REDIRECT_ON_TOUCH` (section 2.5) to `false`; the popup works on iOS and Android browsers as a new tab.

---

## 2. Files and module boundaries

### 2.1 Files

| File | Kind | Owns | May import |
| --- | --- | --- | --- |
| `src/lib/firebase.ts` | new | Env config, `isConfigured()`, lazy SDK load, emulator connect, wiping the local Firestore cache | `./firebase-sdk` via `import()` only |
| `src/lib/firebase-sdk.ts` | new | The only static imports of `firebase/app`, `firebase/auth`, `firebase/firestore`; re-exports what the app uses | `firebase/*` |
| `src/lib/merge.ts` | new | Pure types and functions: synced shapes, `mergeProgress`, `toSynced`, `fromSynced`, `adoptGuest`, `mergeSettings`, `parseDoc` | types from `../store/progress` and `../store/settings`, `./daily` (`previousKey`) |
| `src/lib/syncMeta.ts` | new | The `periodica-sync` `localStorage` record (device id, owner, slots already counted, unsaved flag, ownership generation, shared-computer state), the stale-tab write guard (`guardedStorage`) and the shared-computer session cookie | types only |
| `src/lib/sync.ts` | new | Sync lifecycle: adoption, listener, merge-apply, debounced transactional flush, status, reset-to-guest | `./merge`, `./syncMeta`, `./firebase`, the three stores |
| `src/lib/accountCore.ts` | new | What every tab runs from the start: `bootAccounts()`, other tabs, shared computers, `prepareAccounts()`, the auth state listener. The only account module `main.tsx` imports (8.3) | `./firebase`, `./syncMeta`, the three stores; `./sync` via `import()` |
| `src/lib/account.ts` | new | The account API the UI calls: the sign-in, sign-out and delete actions, plus `accountCore`'s public functions re-exported. Loads with the account screen | `./accountCore`, `./firebase`, `./syncMeta`, `./authErrors`, `../store/auth` |
| `src/lib/authErrors.ts` | new | Firebase error code to plain sentence | nothing |
| `src/store/auth.ts` | new | zustand store (not persisted): auth status, user summary, sync status, error, notice | `../lib/firebase` (`isConfigured` only), `../lib/syncMeta` |
| `src/store/progress.ts` | edit | Add `EMPTY_PROGRESS` export (the current `initial`) and a `reconcileAchievements()` action; persist through `guardedStorage` (5.6.8) | `../lib/syncMeta` (`guardedStorage`) |
| `src/store/settings.ts` | edit | Export `SettingsData`, `SETTING_KEYS`, `defaultSettings()`, add `reset()`; persist through `guardedStorage` | `../lib/syncMeta` (`guardedStorage`) |
| `src/env.d.ts` | new | `ImportMetaEnv` with the `VITE_FIREBASE_*` keys | |
| `src/screens/Account.tsx` | new | The account screen, all states | `../store/auth`, `../lib/account`, account components |
| `src/screens/AccountOff.tsx` | new | The account screen of a build without accounts: "Accounts are not set up yet" (8.2) | nothing |
| `src/components/account/*.tsx` | new | `GoogleButton`, `AuthForms`, `AccountPanel`, `SyncStatusLine`, `ConfirmBlock`, `ReauthBlock`, `AccountEntry`, `Initials`, `Field`, `FormError`, `AccountData` | stores, `lib/account` |
| `firebase.json`, `.firebaserc`, `firestore.rules` | new | Emulator config and rules | |
| `.env.example`, `.env.emulators` | new | Documented env keys; demo values for the emulators (not secrets) | |
| `tests/merge.test.ts`, `tests/authErrors.test.ts`, `tests/accounts-off.test.ts`, `tests/accountGuards.test.ts` | new | Pure unit tests, run by `npx vitest run` | |
| `tests/sync.unit.test.ts`, `tests/support/fakeFirebase.ts` | new | The sync layer against a fake Firestore (failed saves, refused saves, `meta.unsaved`, stale tab copies, case C), run by `npx vitest run` | |
| `tests-emulator/rules.test.ts`, `vitest.emulator.config.ts` | new | Rules tests against the Firestore emulator | |
| `tests-emulator/sync.test.ts`, `tests-emulator/support/*` | new | Sync integration tests: simulated devices (one child process each) against the auth and Firestore emulators (6.5.1) | |
| `e2e/accounts-off.spec.ts` | new | Default suite: unconfigured build makes no Firebase requests | |
| `e2e-accounts/accounts.spec.ts`, `e2e-accounts/harness.html`, `e2e-accounts/harness.tsx`, `playwright.accounts.config.ts` | new | Account flows in a real browser against the emulators (6.6). The harness page mounts `<Account />` and calls `bootAccounts()` as phase 2 will; it is served by `vite --mode emulators` only and is never built | |

Nothing in this list edits a file the phone-layout workflow owns. The account components style themselves with existing classes and Tailwind utilities; they never add rules to `src/styles/index.css`.

### 2.2 Dependency rules

- `merge.ts` is pure: no `firebase`, no `localStorage`, no `Date.now()` (callers pass time in). It is the domain core and is tested without a browser.
- Only `firebase-sdk.ts` imports `firebase/*`, and only `firebase.ts` imports `firebase-sdk.ts`, with `import()`. A static import of either anywhere else is a bug (it pulls the SDK into the guest bundle). `tests/merge.test.ts` may assert this with a source grep.
- `sync.ts` is only ever loaded with `import()` from `accountCore.ts`.
- `main.tsx` imports `accountCore.ts` only. The actions in `account.ts` (and `authErrors.ts`) load with the account screen, so they are not part of a guest's first load.
- Screens and components import `store/auth` and `lib/account` only. They never import `firebase.ts`, `sync.ts` or `merge.ts`.
- `store/auth.ts` holds state only. Actions live in `lib/account.ts`.
- The progress and settings stores do not know sync exists. Sync observes them with `subscribe` and writes them with `setState`. Their only link to accounts is `guardedStorage` from `syncMeta.ts` (5.6.8), which is plain `localStorage` until `bootAccounts()` registers a stale-tab handler, and always plain `localStorage` in a build without accounts.

### 2.3 `src/lib/firebase.ts`

```ts
import type { FirebaseOptions } from 'firebase/app'; // type-only, erased at build

/** True when VITE_FIREBASE_PROJECT_ID is set at build time. A constant, so dead branches are removed. */
export const CONFIGURED: boolean;
export function isConfigured(): boolean;
/** flag === '1' and (dev server or a demo-* project). Pure, for tests. */
export function emulatorsAllowed(flag: string | undefined, projectId: string | undefined, dev: boolean): boolean;
/** VITE_FIREBASE_EMULATORS === '1', honoured only in a dev server or for a demo-* project (6.3). */
export function usesEmulators(): boolean;
/** Built from the six VITE_FIREBASE_* vars; null when not configured. */
export const firebaseConfig: FirebaseOptions | null;

export interface Fb {
  sdk: typeof import('./firebase-sdk');
  app: import('firebase/app').FirebaseApp;
  auth: import('firebase/auth').Auth;
  db: import('firebase/firestore').Firestore;
}

/**
 * Loads the SDK chunk and initialises app, auth and Firestore once (memoised promise).
 * Rejects when not configured, or when offline and the chunk is not cached; the memo is cleared on failure so a later call retries.
 */
export function loadFirebase(): Promise<Fb>;

/** terminate(db) then clearIndexedDbPersistence(db). The next use of `fb.db` creates a fresh Firestore instance. */
export function wipeLocalFirestore(): Promise<void>;
/** The loaded SDK or null; never triggers a load. */
export function loadedFirebase(): Fb | null;
/** Signing out while the SDK cannot load: deletes Firebase's IndexedDB databases (session and cache) by name. */
export function wipeLocalFirebaseStorage(): Promise<void>;
```

`Fb.db` is a getter: the Firestore instance is created on first use and again after `wipeLocalFirestore()`, so callers read `fb.db` each time instead of keeping it. `initializeFirestore` also sets `ignoreUndefinedProperties: true`.

Initialisation inside `loadFirebase()`:

- `app = initializeApp(firebaseConfig)`.
- When `VITE_FIREBASE_APPCHECK_SITE_KEY` is set and the emulators are not in use: `initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(key), isTokenAutoRefreshEnabled: true })`, before auth and Firestore (section 10, step 13).
- `auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence], popupRedirectResolver: browserPopupRedirectResolver })`.
- `db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`. If that throws (IndexedDB unavailable, for example a private window in some browsers), fall back to `memoryLocalCache()`.
- When `usesEmulators()`: `connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })` and `connectFirestoreEmulator(db, '127.0.0.1', 8080)`, both before any other call.
- `auth.languageCode = 'en'` (the app is English only).

`firebase-sdk.ts` re-exports exactly the functions used: `initializeApp`; `initializeAppCheck`, `ReCaptchaEnterpriseProvider`; `initializeAuth`, `indexedDBLocalPersistence`, `browserLocalPersistence`, `browserPopupRedirectResolver`, `connectAuthEmulator`, `onAuthStateChanged`, `GoogleAuthProvider`, `EmailAuthProvider`, `signInWithPopup`, `signInWithRedirect`, `getRedirectResult`, `createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `updateProfile`, `sendPasswordResetEmail`, `sendEmailVerification`, `signOut`, `deleteUser`, `reauthenticateWithPopup`, `reauthenticateWithCredential`; `initializeFirestore`, `persistentLocalCache`, `persistentMultipleTabManager`, `memoryLocalCache`, `connectFirestoreEmulator`, `doc`, `onSnapshot`, `runTransaction`, `deleteDoc`, `serverTimestamp`, `terminate`, `clearIndexedDbPersistence`.

### 2.4 `src/store/auth.ts`

```ts
export type AuthStatus = 'unconfigured' | 'loading' | 'guest' | 'signed-in';
export type SyncStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'offline' | 'error' | 'outdated';
export type Provider = 'google' | 'password';

export interface AccountUser {
  uid: string;
  name: string;           // displayName, else the part of the email before @, else "Student"
  email: string | null;
  provider: Provider;     // 'google' if any providerData entry is google.com, else 'password'
  initials: string;       // initialsOf(name, email)
  verified: boolean;      // Google, or an email account whose verification link was opened (5.6.10)
}

export type Notice =
  | 'signed-out'          // after sign out on this device
  | 'deleted'             // after deleting the account here
  | 'deleted-elsewhere'   // the account was deleted on another device
  | 'session-ended'       // Firebase signed this device out (token revoked, password changed, account deleted
                          // while this device was closed); everything was in the account, so the device was cleared
  | 'session-ended-unsaved' // the same, but local progress never reached the account: kept as a leftover
  | 'shared-idle'         // a shared computer's session ended after 30 minutes without use (5.6.9)
  | 'cleared'             // "Clear this device" finished
  | 'redirect-failed'     // a Google redirect came back empty (ADR-A6)
  | null;

interface AuthState {
  status: AuthStatus;
  user: AccountUser | null;
  sync: SyncStatus;
  /** Background errors (redirect result, sync), already turned into copy. Form errors are returned by the actions instead. */
  error: { code: string; message: string } | null;
  notice: Notice;
  /** The SDK is loaded and the auth listener is attached. The Google button needs it (a popup must open inside the click). */
  ready: boolean;
  /** The SDK could not be loaded (offline and not cached). */
  sdkOffline: boolean;
  /** Signed out, but the stores hold an account's progress that never reached it (5.6.3). Never merged elsewhere. */
  leftover: boolean;
  /** Signed in as a shared computer (5.6.9). */
  shared: boolean;
  set: (patch: Partial<Omit<AuthState, 'set'>>) => void;
}

export const useAuth: UseBoundStore<StoreApi<AuthState>>;
export function initialsOf(name: string, email: string | null): string; // first letter of the first two words, uppercased, by grapheme; else first letter of email; else "?"
```

Initial state, computed synchronously at module load from `isConfigured()` and `readMeta()` with no SDK:

| Condition | `status` | `user` | `sync` |
| --- | --- | --- | --- |
| not configured | `unconfigured` | null | `idle` |
| `meta.redirect === 'pending'` | `loading` | null | `idle` |
| `meta.owner` and `meta.user` set, and not a shared computer whose session is over (5.6.9) | `signed-in` (from the cache, so the header avatar does not flicker) | from `meta.user` | `loading` |
| otherwise | `guest` (`leftover` when `meta.owner` is set without `meta.user`) | null | `idle` |

### 2.5 `src/lib/account.ts`

The whole API, in two modules. `accountCore.ts` holds what every tab runs from the start: `bootAccounts`, `prepareAccounts`, `checkSharedSession`, the auth listener, following other tabs and ending shared sessions. `account.ts` holds the actions below and re-exports those three, so screens and tests import `account.ts` only. `main.tsx` imports `accountCore.ts` alone, and `account.ts` loads with the account screen (8.3).

```ts
export type AuthResult =
  | { ok: true }
  // message null: stay silent (user cancelled). Failed validation: code 'invalid-input', `fields` holds the
  // message per field and `message` the first one; no Firebase call was made.
  | { ok: false; code: string; message: string | null; fields?: FieldErrors };
export type SignOutResult = { ok: true } | { ok: false; reason: 'unsaved' } | { ok: false; reason: 'error'; message: string };
export type DeleteResult = { ok: true } | { ok: false; reason: 'reauth' | 'offline' | 'error'; message: string | null };

export const GOOGLE_REDIRECT_ON_TOUCH = true;

/** Call once at start (phase 2: main.tsx). Never loads the SDK for a guest who has not used accounts. */
export function bootAccounts(): void;
/** The account screen calls this on mount: loads the SDK and attaches the listener. Resolves false when offline. */
export function prepareAccounts(): Promise<boolean>;

/** shared: a shared computer (5.6.9). Default defaultShared(): on for computers, off on touch devices. */
export type SignInOptions = { shared?: boolean };
export function defaultShared(): boolean;
export function signInWithGoogle(opts?: SignInOptions): Promise<AuthResult>;
export function signUpWithEmail(name: string, email: string, password: string, opts?: SignInOptions): Promise<AuthResult>;
export function signInWithEmail(email: string, password: string, opts?: SignInOptions): Promise<AuthResult>;
export function sendReset(email: string): Promise<AuthResult>;
/** Sends the verification email again (5.6.10). */
export function resendVerification(): Promise<AuthResult>;
/** Reloads the user so a verification done elsewhere shows; quiet on failure. */
export function refreshUser(): Promise<void>;
/** Ends a shared computer's session when it is over (5.6.9). bootAccounts runs it every minute and on focus. */
export function checkSharedSession(): void;
/** "Clear this device": a signed-out device drops its leftover (5.6.3). */
export function clearThisDevice(): Promise<void>;
/** Google: reauthenticateWithPopup. Email: reauthenticateWithCredential(EmailAuthProvider.credential(email, password)). */
export function reauthenticate(password?: string): Promise<AuthResult>;
/** Flushes, signs out, resets the device to a fresh guest. With unsaved offline changes it returns 'unsaved' unless force. */
export function signOutAndReset(opts?: { force?: boolean }): Promise<SignOutResult>;
/** Deletes users/{uid}, then the auth user, then resets the device. Returns 'reauth' when a fresh sign-in is needed first. */
export function deleteAccount(): Promise<DeleteResult>;
export function dismissNotice(): void;
export const RECENT_SIGN_IN_MS = 5 * 60_000;
// Re-exported from ./authErrors so screens import only this module:
export { validateForm, validateEmail, validateName, validatePassword, type FieldErrors, type FormField };
```

Behaviour that the signatures do not show:

- `bootAccounts()`: if not configured, return. Register the stale-tab handler and listen for `storage`, `pageshow` (back-forward cache), `online`, activity and visibility in every tab (5.6.8, 5.6.9); none of this touches the network. Then: a shared computer whose session is over is ended at once (5.6.9); else if `meta.owner` or `meta.redirect === 'pending'`, call `prepareAccounts()` in the background; otherwise do nothing more (zero network for a guest).
- `prepareAccounts()`: `loadFirebase()`; on failure set `sdkOffline: true` and return false. Otherwise attach `onAuthStateChanged` once, handle a pending redirect (`getRedirectResult`, section 5.1), set `ready: true`.
- Auth listener, user present: build `AccountUser`, write `meta.user`, set `status: 'signed-in'`, then `(await import('./sync')).startSync(...)`.
- Auth listener, no user: if `meta.owner` is set and the change was not started by this module (sign out, delete, a shared session ending), the session ended outside the app (5.6.3): `stopSync()` and always `wipeLocalFirestore()` (the cached account, with the student's name, is useless without the session). Then, if `meta.unsaved` is false, everything is in the account (or was deleted with it): `resetDeviceToGuest()`, `notice: 'session-ended'`. If it is true, keep the stores with `meta.owner` (so they can never be merged into a different account, case D), clear `meta.user`, and set `leftover: true`, `notice: 'session-ended-unsaved'`. The notice is only set when `meta.user` was still there (the first time). Otherwise `status: 'guest'`.
- `signInWithGoogle()`: provider `GoogleAuthProvider` with `setCustomParameters({ prompt: 'select_account' })`, so a shared computer always asks which account. Use redirect when `GOOGLE_REDIRECT_ON_TOUCH && matchMedia('(pointer: coarse) and (max-width: 767px)').matches && meta.redirect !== 'broken'`; else popup, and on `auth/popup-blocked` fall back to redirect (unless broken). Before redirecting write `meta.redirect = 'pending'`.
- All three sign-in actions record the shared-computer choice first (`meta.shared`, `meta.activeAt`, the session cookie; 5.6.9).
- `signUpWithEmail()`: trim the name; `createUserWithEmailAndPassword`, `sendEmailVerification(user)` in the background (5.6.10), then `updateProfile(user, { displayName: name })`. The auth listener fires before `updateProfile` finishes, so the name is passed to the listener through a module variable and used for `AccountUser.name` and `profile.name`.
- All actions validate input first (section 7.5) and never call Firebase with input that fails validation.

### 2.6 `src/lib/sync.ts`

```ts
export function startSync(user: { uid: string; name: string }): void;   // idempotent per uid
export function stopSync(): void;                                        // unsubscribe, cancel timers; never touches local data
export function flushNow(timeoutMs?: number): Promise<'saved' | 'offline' | 'error'>;
export function hasUnsavedChanges(): boolean;                            // local state not yet in the server copy
/** Progress reset to EMPTY_PROGRESS, settings to defaults, meta ownership cleared, local Firestore cache wiped. */
export function resetDeviceToGuest(): Promise<void>;
/** Online only. Deletes users/{uid}; used by deleteAccount before deleteUser. */
export function deleteRemoteDoc(uid: string): Promise<void>;
/** True while the deleted-elsewhere check (5.6.3) runs; the auth listener leaves that sign out to it. */
export function isCheckingDeletion(): boolean;
/** A sync session runs in this tab. */
export function isActive(): boolean;
/** Another tab wrote the stores, or this tab was stale: reload them, repair or save as needed (5.6.8). */
export function applyExternal(which: ('progress' | 'settings')[]): void;
export const DEBOUNCE_MS = 2000, MAX_WAIT_MS = 10_000, MIN_SAVE_GAP_MS = 1200, DELETE_GRACE_MS = 5000;
```

### 2.7 `src/lib/syncMeta.ts`

```ts
export const META_KEY = 'periodica-sync';
export interface SyncMeta {
  v: 1;
  /** Stable per browser, survives sign out. Not personal data. crypto.randomUUID(). */
  deviceId: string;
  /** uid whose data the local stores hold; null means guest data. */
  owner: string | null;
  /** Display cache so a signed-in device starts with its avatar, even offline. Cleared on sign out. */
  user: { name: string; email: string | null; provider: 'google' | 'password'; verified: boolean } | null;
  /** Slots of other replicas, exactly as already counted in the local totals (invariant in 5.3). */
  others: Record<string, Slot>;
  /** Reset generation the local stores belong to (section 4.6). */
  epoch: number;
  /** When each setting was last changed on this device (ms). Missing means never: the account value wins. */
  settingsAt: Partial<Record<SettingKey, number>>;
  /** The account document has existed while this device owned it. Used to tell deletion from a new account. */
  docSeen: boolean;
  /** A guest merge that has started but not committed. guestId is fixed before the transaction, so a retry is idempotent. */
  pendingAdoption: { uid: string; guestId: string } | null;
  redirect: 'pending' | 'broken' | null;
  /** The stores hold something the account does not have yet (5.3.1). Survives reloads. */
  unsaved: boolean;
  /** Ownership generation: changes on sign out, delete, reset to guest, and a sign-in that takes the device (5.6.8). */
  gen: string;
  /** Signed in as a shared computer, and its last activity (ms) (5.6.9). */
  shared: boolean;
  activeAt: number;
}
export function readMeta(): SyncMeta;                  // never throws; fills defaults; creates deviceId on first read
export function writeMeta(patch: Partial<SyncMeta>): SyncMeta;
export function clearOwnership(): SyncMeta;            // keeps deviceId and redirect, resets everything else, new gen
export function bumpGen(patch?: Partial<SyncMeta>): SyncMeta; // writes patch with a new gen; this tab stays current
// Stale tabs (5.6.8)
export const guardedStorage: StateStorage;             // the stores' persist storage
export function tabIsStale(): boolean;
export function markTabCurrent(): void;
export function setStaleHandler(fn: (() => void) | null): void;
// Shared computers (5.6.9)
export const SHARED_IDLE_MS = 30 * 60_000;
export function setSessionCookie(): void;
export function clearSessionCookie(): void;
export function sharedSessionOver(m: SyncMeta, now?: number): boolean;
```

`readMeta()` always reads `localStorage` (no in-memory cache), so two tabs see the same record. Every access is wrapped in try/catch; with storage unavailable, accounts work for the session only.

### 2.8 Store edits

`src/store/progress.ts`:

```ts
export const EMPTY_PROGRESS: ProgressData;          // today's `initial`, exported
// new action on ProgressState:
reconcileAchievements: () => string[];               // runs unlockNew(get()) with no round; sets and returns ids unlocked
```

`src/store/settings.ts`:

```ts
export const SETTING_KEYS = ['sound', 'haptics', 'reduceMotion', 'colorblind', 'difficulty', 'quizTimer'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
export type SettingsData = Pick<SettingsState, SettingKey>;
export function defaultSettings(): SettingsData;    // same defaults as today, reduceMotion from the media query
// new action: reset: () => void   (and `set`'s patch type excludes 'set' | 'reset')
```

Both stores persist with `storage: createJSONStorage(() => guardedStorage)` (5.6.8). Both edits are additive; no screen changes.

### 2.9 Account UI files

| Component | Props | Notes |
| --- | --- | --- |
| `screens/Account.tsx` `Account` | none | Reads `useAuth`; calls `prepareAccounts()` on mount (and again on `online` while `sdkOffline`); renders one of the states in section 7. Uses every screen's page container `mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12` with a left-aligned `max-w-120` (480px) column inside, so the `h1.t-title` sits where every other page title does. When the state changes (sign in, sign out) focus moves to the notice, else the `h1` |
| `screens/AccountOff.tsx` `AccountOff` | none | The `unconfigured` state (7.1), in the same container. `App.tsx` lazy-loads it instead of `Account` when the build has no Firebase project |
| `account/AuthForms.tsx` `AuthPanel` | `{ initialMode?: 'sign-in' \| 'sign-up' \| 'reset'; above?: ReactNode; below?: ReactNode; disabled?: boolean; shared?: boolean }` | The `.seg` switch between Sign in and Create account, and the reset form. `above` (Google) and `below` (the "Shared computer" switch) show except on the reset form. `shared` is passed to the sign-in actions |
| `account/AuthForms.tsx` `SignInForm` | `{ onForgot: (email: string) => void }` | |
| `account/AuthForms.tsx` `SignUpForm` | `{}` | |
| `account/AuthForms.tsx` `ResetForm` | `{ initialEmail: string; onBack: () => void }` | |
| `account/GoogleButton.tsx` `GoogleButton` | `{ onClick: () => void; busy?: boolean; disabled?: boolean; children?: 'Continue with Google' }` | Section 7.3 |
| `account/GoogleButton.tsx` `GoogleMark` | `{ size?: number }` (18) | The standard four-colour G |
| `account/AccountPanel.tsx` `AccountPanel` | `{ user: AccountUser; sync: SyncStatus }` | Signed-in view: what is saved with the sync line as its caption, sign out and delete flows |
| `account/AccountData.tsx` `AccountDataSummary`, `useSignedIn` | `{ onNavigate: () => void }` | The account part of Settings' "Your data" (section 9, item 5) |
| `account/SyncStatusLine.tsx` `SyncStatusLine` | `{ status: SyncStatus }` | Icon plus one line, `role="status"` |
| `account/ConfirmBlock.tsx` `ConfirmBlock` | `{ title: string; body: ReactNode; confirmLabel: string; cancelLabel?: string; tone: 'primary' \| 'danger'; busy?: boolean; busyLabel?: string; onConfirm: () => void; onCancel: () => void; children?: ReactNode; confirmDisabled?: boolean; error?: string \| null; cancelTone?: 'secondary' \| 'primary'; focusCancel?: boolean }` | Inline confirmation, used here and for "Reset progress…" in Settings. A labelled `role="group"`, `p-5 sm:p-6` like the cards it sits under; on open it scrolls itself fully into view (`block: 'nearest'`) and focus goes to cancel (or to `children`, such as the typed confirmation) |
| `account/ReauthBlock.tsx` `ReauthBlock` | `{ user: AccountUser; onDone: () => void \| Promise<void>; onCancel: () => void; error?: string \| null }` | Google button or password field. A wrong password shows under the field: "That password does not match your account. Check it and try again." |
| `account/AccountEntry.tsx` `AccountEntry` | none | Header entry point for phase 2 (section 9) |
| `account/AccountEntry.tsx` `Initials` | `{ initials: string; size?: number }` (32) | Circle avatar |
| `account/Field.tsx` `Field`, `account/FormError.tsx` `FormError` | `{ id: string; label: string; type: 'text' \| 'email' \| 'password'; value: string; onChange: (v: string) => void; autoComplete: string; hint?: string; error?: string \| null; inputMode?: 'email'; maxLength?: number; disabled?: boolean; inputRef?: Ref<HTMLInputElement> }` | Label above, `.field` input, hint or error below, `aria-describedby`, `aria-invalid`; password fields carry the show toggle. `FormError` is the always-present `role="alert"` region above a primary button |

---

## 3. Firestore data model

### 3.1 `users/{uid}`

```ts
interface UserDoc {
  schemaVersion: number;          // int, SCHEMA_VERSION = 1. Never decreases (rules enforce)
  profile: { name: string };      // 1 to 40 UTF-16 units (what the rules' size() counts; most emoji are 2). The display name only
  progress: SyncedProgress;       // section 3.2
  settings: SyncedSettings;       // section 3.2
  clientId: string;               // deviceId of the last writer, 8 to 64 chars. Diagnostics and tests
  createdAt: Timestamp;           // serverTimestamp() on create, never changes
  updatedAt: Timestamp;           // serverTimestamp() on every write
}
```

No email in Firestore. Firebase Auth already holds it, and the audience is 12 to 18, so the document keeps the least it can.

### 3.2 Synced shapes (`src/lib/merge.ts`)

```ts
export const SCHEMA_VERSION = 1;
export const MAX_DAILY_RESULTS = 400;
export const MAX_TRAIL = 64;
export const MAX_SLOTS = 500;

/** One replica's own contributions. Written only by that replica. Each field only grows. */
export interface Slot {
  xp: number; rounds: number; placements: number; mistakes: number; quizzes: number; playMs: number;
  day: string;     // todayKey() of this replica's latest XP, '' before any
  dayXp: number;   // XP this replica earned on `day`
}

export interface SyncedProgress {
  epoch: number;                                     // reset generation, section 4.6
  slots: Record<string, Slot>;                       // replicaId -> slot. All-zero slots are omitted
  mastery: Record<string, Mastery>;                  // "1".."118" -> { s, c, w, t }
  best: Record<string, { score: number; stars: number; timeMs: number }>;
  bestCombo: number;
  daily: { results: Record<string, DailyResult>; streak: number; bestStreak: number; lastKey: string | null };
  achievements: Record<string, number>;              // id -> unlock time (ms)
  explored: number[];                                // ascending, unique
  chapters: Record<string, number>;                  // chapter id -> best stars
}

export interface SyncedSettings {
  values: SettingsData;                              // all six keys
  at: Partial<Record<SettingKey, number>>;           // per key: when it was set (ms); missing = default, never set
}
```

`daily.started` and `today` are not stored: `started` is device-local (section 4.2) and `today` is derived from the slots.

A replica is a browser (`meta.deviceId`) or a merged guest session (`guestId`). Replica ids are `crypto.randomUUID()` strings.

### 3.3 Size bound

| Part | Bound | Worst case | Typical after a year |
| --- | --- | --- | --- |
| `mastery` | 118 entries x ~45 B | 5.3 KB | 3 KB |
| `best` | 7 regions x 3 difficulties x ~60 B | 1.3 KB | 0.5 KB |
| `daily.results` | 400 entries x ~130 B (trail capped at 64) | 52 KB, up to ~180 KB with 64-entry trails | 30 KB |
| `achievements` | 19 x ~30 B | 0.6 KB | 0.4 KB |
| `explored` | 118 numbers | 1 KB | 0.5 KB |
| `chapters` | 13 x ~25 B | 0.3 KB | 0.3 KB |
| `slots` | 500 x ~150 B (rules cap) | 75 KB | 1 KB (5 to 10 slots) |
| `settings`, `profile`, metadata | | 0.5 KB | 0.5 KB |

Worst case is under 270 KB, a quarter of Firestore's 1 MiB limit; a real student stays near 20 to 40 KB. One document is enough, and a sync is one read.

---

## 4. Merge rules

### 4.1 Laws

`mergeProgress(a, b)` is a join on `SyncedProgress`. For every pair of well-formed values (produced by `toSynced`, `adoptGuest`, `parseDoc` or `mergeProgress` itself):

1. Idempotent: `merge(a, a) = a`.
2. Commutative: `merge(a, b) = merge(b, a)`. Every tie is broken by a total order on the value, never by argument position.
3. Associative: `merge(merge(a, b), c) = merge(a, merge(b, c))`.
4. Inflationary (monotone): `merge(merge(a, b), a) = merge(a, b)`. Merging never takes back what either side had, within the same epoch.
5. No double count: every counter total equals the sum over distinct slots; re-merging any input changes no total.
6. No loss: for every counter, `total(merge(a, b)) >= max(total(a), total(b))`.
7. Normalised output: `explored` sorted, zero slots dropped, `daily.results` trimmed to the latest 400 keys, trails cut to 64. `normalize(merge(a, b)) = merge(a, b)`.

Equality is order-insensitive deep equality (`sameProgress(a, b)`), because Firestore does not keep map key order.

The only direction-dependent operations are not merges: `toSynced` / `fromSynced` (local store to and from the synced shape) and `adoptGuest` (guest into account). Settings use their own join, `mergeSettings`, with the same laws.

The laws are what makes sync safe: idempotence means a device that receives its own write back changes nothing and writes nothing (section 5.5); commutativity and associativity mean devices converge whatever order their writes land in.

### 4.2 Field by field

Every field of `ProgressData`. `merge.ts` exports `MERGE_RULES: { [K in keyof ProgressData]: string }` naming the rule for each key, so adding a field to the store without a merge rule fails `tsc`.

| `ProgressData` field | Synced as | Join | Why |
| --- | --- | --- | --- |
| `xp` | `slots[*].xp` | per slot `max`; total = sum of slots | Counter. Each XP is earned on exactly one replica |
| `mastery[n]` `{ s, c, w, t }` | `mastery["n"]` | Latest practice wins: the entry with the larger `t`; ties by larger `s`, then `c`, then `w` | Strength goes down on a wrong answer by design (spaced review). The latest practice is the truth. `c` and `w` ride with the winner (they are not shown anywhere today; see section 11) |
| `best[key]` | `best[key]` | Better result wins: higher `score`, then higher `stars`, then lower `timeMs` | A best score only ever improves; the stars and time belong to that score |
| `stats.rounds` | `slots[*].rounds` | per slot `max`, sum | Counter |
| `stats.placements` | `slots[*].placements` | per slot `max`, sum | Counter |
| `stats.mistakes` | `slots[*].mistakes` | per slot `max`, sum | Counter |
| `stats.quizzes` | `slots[*].quizzes` | per slot `max`, sum | Counter |
| `stats.playMs` | `slots[*].playMs` | per slot `max`, sum | Counter |
| `stats.bestCombo` | `bestCombo` | `max` | A record, not a counter |
| `daily.results[key]` | `daily.results[key]` | Union by key. Same key on two sides: the better result, by `stars`, then `score`, then fewer `mistakes`, then lower `timeMs`, then trail compared as a string. Keep the 400 latest keys | One attempt per day per device; if two devices both played the same daily, the student keeps the better one |
| `daily.lastKey` | `daily.lastKey` | `max(a.lastKey, b.lastKey, latest key in results with stars > 0)`; null is lowest | The last finished daily |
| `daily.streak` | `daily.streak` | `max(run(lastKey), a.streak if a.lastKey = lastKey, b.streak if b.lastKey = lastKey)`; 0 when lastKey is null | `run(k)`: consecutive days ending at `k` (stepping with `previousKey`) whose result has `stars > 0`. Recomputed, so two devices that each played alternate days get the joined streak. The `max` with inputs keeps streaks longer than the 400 kept results |
| `daily.bestStreak` | `daily.bestStreak` | `max(a.bestStreak, b.bestStreak, longestRun(results), streak)` | A record. `longestRun` finds runs that only exist once both devices' days are joined |
| `daily.started` | not synced | Kept from the local side by `fromSynced` | Device-local guard against peeking. Syncing it would make another device record an empty attempt for a daily still being played here (`Daily.tsx` records one when `started === key` and no result exists) |
| `achievements[id]` | `achievements[id]` | Union; earliest unlock time wins | A badge is earned once, at its first moment |
| `explored` | `explored` | Set union, sorted ascending | |
| `chapters[id]` | `chapters[id]` | `max` stars | Stars only improve |
| `today` `{ key, xp }` | `slots[*].day`, `slots[*].dayXp` | Per slot, the larger `(day, dayXp)` pair (day as a string first). Derived: `today.key` = latest `day` over slots; `today.xp` = sum of `dayXp` over slots whose `day` equals it | Today's goal counts XP from every device today, once each |

After a merge is applied locally, sync calls `useProgress.getState().reconcileAchievements()`: the joined state can pass a check neither side passed alone (25 elements explored across two devices, 150 XP today across two devices). That is a local change like any other and is flushed; it shows no toast.

### 4.3 Slot arithmetic: `toSynced` and `fromSynced`

```ts
export function toSynced(local: ProgressData, others: Record<string, Slot>, replicaId: string, epoch: number): SyncedProgress;
export function fromSynced(s: SyncedProgress, local: ProgressData): ProgressData;
```

- `toSynced` derives the device's own slot as `own = local totals - sum(others)`, field by field, clamped at 0. For the day: `own.dayXp = max(0, local.today.xp - sum of others' dayXp whose day = local.today.key)`, and `own.day = local.today.key` only when `own.dayXp > 0`, else `''`. (Correction: with `own.day = local.today.key` always, a device that had not played today would derive `(today, 0)` after another device started the day, which beats its older `(day, dayXp)` on the server, so every device rewrote its slot once per day and convergence took an extra round. `''` loses to any real day under the join, so the server slot stays as it is.) The result is normalised, so `daily.lastKey`, `streak` and `bestStreak` are already in joined form. All lattice fields copy from `local` (mastery keys stringified, `explored` sorted, `bestCombo` from `stats.bestCombo`, `daily` without `started`).
- `fromSynced` sums the slots into `xp`, `stats.*` and `today`, copies the lattice fields back (numeric mastery keys), and keeps `local.daily.started`.
- Round trip: `fromSynced(toSynced(local, others, id, e), local)` equals `local` whenever the invariant in section 5.3 holds. This is a unit test.

### 4.4 Guest adoption: `adoptGuest`

```ts
export function adoptGuest(guest: ProgressData, guestId: string, account: SyncedProgress | null): SyncedProgress;
```

The guest is one more replica. Result = `mergeProgress(account ?? emptySynced(), G)` where `G` is the guest as a synced value in the account's epoch:

- `G.slots = { [guestId]: guest counters }` (xp, the five stats counters, and `day`/`dayXp` from `guest.today`). Setting a slot is idempotent under `max`, so retrying an adoption with the same `guestId` never adds twice.
- Lattice fields from the guest as in `toSynced`.
- Mastery is the one exception: the guest's history and the account's history are independent, so "latest practice wins" would let two right answers as a guest pull a mastered element back to strength 2. For an element present on both sides, adoption takes the component-wise maximum `{ s: max, c: max, w: max, t: max }`. That entry is greater than or equal to the account's under the normal mastery order, so the following normal merges keep it.

`adoptGuest(g, id, adoptGuest(g, id, a)) = adoptGuest(g, id, a)` is a unit test.

### 4.5 Settings: `mergeSettings`

Per key, last writer wins: the side with the larger `at[key]` (missing = 0) gives `values[key]`; equal `at` falls back to comparing `JSON.stringify(value)`. Applying the result locally changes only keys whose merged `at` is newer than this device's (5.4 step 4), so a key nobody ever set keeps the device's own default (for example `reduceMotion` from the media query) even though the document holds the tie-broken value. When a guest signs in (cases B and C), keys whose value differs from `defaultSettings()` are stamped with the sign-in time: they are the student's latest choice on this device. Untouched defaults have no `at`, so on a first sign-in the account's choices win over a fresh device's defaults, while a setting the guest really changed (newer `at`) wins over an older account value.

### 4.6 Resets: `epoch`

A join can never go down, so "Reset progress" in Settings needs an explicit generation number.

- `mergeProgress(a, b)`: if `a.epoch !== b.epoch`, the side with the higher epoch is the result, as is (normalised). Otherwise the joins above. This keeps every law.
- The sync layer treats a local change that turns the progress store into `EMPTY_PROGRESS` (from anything else) as a reset: `meta.epoch = max(meta.epoch, remote epoch) + 1`, `meta.others = {}`, and the next flush writes an empty progress with the new epoch. Every other device takes it on its next snapshot.
- The existing Settings button therefore works signed in with no wiring. Signing out and deleting call `stopSync()` before they reset local data, so they never bump the epoch.
- Trade-off: progress a device made offline in the old epoch is discarded when it reconnects. That is what "erase everything" means.

### 4.7 `parseDoc`

```ts
export type Parsed =
  | { kind: 'missing' }
  | { kind: 'newer'; version: number }
  | { kind: 'ok'; doc: Omit<UserDoc, 'createdAt' | 'updatedAt'> & { createdAt: unknown } };
export function parseDoc(raw: unknown): Parsed;
```

Lenient: a missing or mistyped field becomes its empty value (field by field), never a thrown error. `schemaVersion > SCHEMA_VERSION` returns `newer`. Older versions run through `migrations[v]` in order (none exist yet; the table is there for the first change).

### 4.8 Unit tests (`tests/merge.test.ts`, default `npx vitest run`)

- A seeded generator (`seeded` from `src/lib/random.ts`) builds random well-formed `SyncedProgress` values, including shared and distinct slots, overlapping mastery with equal and different `t`, same-day dailies, and equal values that test tie breaks. 500 iterations per law in 4.1.
- Scenario tests: two devices each earn 100 XP offline, merge = 200, merge again = 200; the same daily on two devices keeps the better; alternate-day dailies give the joined streak; a guest with strength 2 does not lower a mastered element; adoption retried gives the same result; a higher epoch wins whole; the round trip in 4.3; today's goal sums across devices only for the latest day.
- `RULES` covers every `ProgressData` key (compile-time, plus a runtime key comparison against `EMPTY_PROGRESS`).
- Source check: no file other than `src/lib/firebase-sdk.ts` has a value import from `firebase/*` (`import type` is erased at build and allowed, as `firebase.ts` itself uses it); only `firebase.ts` loads `./firebase-sdk`, with `import()`; nothing imports `./sync` statically. (Correction: the earlier wording "contains `from 'firebase/`" contradicted the type import in 2.3.)
- `tests/accounts-off.test.ts`: with every `VITE_FIREBASE_*` stubbed empty, `isConfigured()` is false, `loadFirebase()` rejects, and importing the stores and `lib/account` and calling `bootAccounts`, `prepareAccounts`, `signInWithEmail` and `signInWithGoogle` never runs the (mocked) SDK module and never calls `fetch`. A control case with a project id shows the mock does detect a load.
- A random three-device simulation (play and syncs in random order through one document) checks every device and the document end at exactly the XP earned, and that one more sync changes nothing.

---

## 5. Sync lifecycle

### 5.1 Start of the app

```
bootAccounts()
  not configured                         -> status 'unconfigured'. Nothing else, no network
  meta.redirect === 'pending'            -> status 'loading'; prepareAccounts(); getRedirectResult()
        user returned                    -> meta.redirect = null; listener continues as signed in
        no user and no currentUser       -> meta.redirect = 'broken'; status 'guest'; notice 'redirect-failed'
        error                            -> meta.redirect = null; status 'guest'; error = mapped copy
  shared computer, session over (5.6.9) -> status 'guest' from the first render; end the session (no network)
  meta.owner set                         -> status 'signed-in' from meta.user; prepareAccounts() in background
        SDK cannot load (offline)        -> stays 'signed-in', sync 'offline'; retried on the 'online' event
        listener: same uid               -> startSync
        listener: no user                -> 'session-ended' handling (2.5, 5.6.3)
  otherwise                              -> status 'guest'. The SDK loads only when the account screen opens
```

### 5.2 Signing in: what happens to local data

`startSync(user)` first decides, from `meta.owner`, whose data the local stores hold:

| Case | `meta.owner` | Local data | Action |
| --- | --- | --- | --- |
| A. Same account again (reload, session restored) | = `uid` | the account's | Resume: listener, merge, flush |
| B. Guest with progress | null | guest progress, not `EMPTY_PROGRESS` | Adopt (5.2.1) |
| C. Guest with nothing | null | `EMPTY_PROGRESS` | `meta.owner = uid`, `docSeen = false`, a new `gen`; the first snapshot fills the stores. Play before that snapshot becomes an adoption (below) |
| D. A different account's leftovers (session ended without sign out) | another uid | someone else's | Never merge it. `resetDeviceToGuest()` first (that account's data is in its own document, apart from what that session had not saved), then case C |

Case C correction: signing out keeps `meta.deviceId` (5.6.4), so the account may already hold a slot for this device from an earlier sign-in. Play recorded after `startSync` but before the first server snapshot was derived as `own = local` and joined with that old slot by per-slot `max`, keeping only the larger of the two (165 + 95 XP ended as 165). Now the first progress change while `meta.owner = uid`, `!meta.docSeen` and no snapshot has arrived sets `meta.pendingAdoption` with a fresh `guestId`, so that play joins the account as a slot of its own (5.2.1). The store watcher is attached before any `await` in `begin`, so no such change goes unseen. Tests: `tests-emulator/sync.test.ts` "signing in again on the same device" and `tests/sync.unit.test.ts` "case C".

#### 5.2.1 Adoption (case B)

1. If `meta.pendingAdoption` is null or for another uid, write `meta.pendingAdoption = { uid, guestId: randomUUID() }`. The guest id is fixed before any network call.
2. Status `sync: 'saving'` (or `'offline'`). The guest keeps playing on the guest data meanwhile; it is still the same lineage.
3. When online, one transaction: read the server document, `A = adoptGuest(currentLocalProgress, guestId, server?.progress ?? null)`, settings `mergeSettings(localSynced, server?.settings)`, write the document.
4. After commit, in this order: write meta `{ owner: uid, pendingAdoption: null, others: { [guestId]: A.slots[guestId] }, epoch: A.epoch, docSeen: true }` with a new `gen` (5.6.8), then the normal apply (5.4 step 4) of `A` against the stores as they are now. (Correction: the earlier text set `others` to all of `A.slots` and wrote `fromSynced(A, local)` directly, which drops anything played while the transaction was in flight.) With `others = { guest slot }`, the device's own slot derives as exactly the play since the transaction read the stores, and the join adds the account's other slots. If the tab dies between the meta write and the store write, the next start is case A with `own = local - guest slot >= 0`, which is correct.
5. Start the listener (5.4).

A retry after a failure or crash at any point before step 4 uses the same `guestId`, so the guest slot is set, not added, again.

### 5.3 The local invariant

While `meta.owner = uid`:

> local counter totals = sum of `meta.others` + own slot, with own slot >= 0

`own` is never stored. It is derived each time by `toSynced` from the store and `meta.others`. Gameplay only adds to the store, so it adds to `own`. An apply sets `meta.others` and the store together (meta first). Whatever goes wrong locally, the server's copy of this device's slot is joined by `max`, so `own` can be under-derived for a moment but never over-counted.

Only a stale copy written by another tab can push a counter below the sum of `meta.others` (5.6.8). `toSynced` would clamp `own` at 0 and `M` would equal `L`, hiding the loss, so `applyRemote` also rebuilds the stores whenever `belowOthers(local, meta.others)` is true.

#### 5.3.1 `meta.unsaved`

`meta.unsaved` is the durable form of "dirty": set with the first local change (by sync while a session runs, and by `account.ts` while none does, for example an offline start with the SDK not cached), cleared when a save commits with nothing left, or when a server snapshot shows the account already holds everything. It survives reloads, so a device whose session ends while it is closed knows whether its stores can be dropped (5.6.3), and sign out can tell, without the SDK, whether anything would be lost (5.6.4).

### 5.4 Steady state

Listener: `onSnapshot(doc(db, 'users', uid), { includeMetadataChanges: true }, onSnap)`.

`onSnap(snap)`:

1. `listenerOffline = snap.metadata.fromCache` (a server snapshot also clears `saveOffline`). If the snapshot is from cache and the document is missing, do nothing (the cache does not know yet).
2. `parsed = parseDoc(snap.data())`.
   - `newer`: stop flushing, `sync: 'outdated'`. Local play goes on; nothing is written until the app updates.
   - `missing` from the server: if `meta.docSeen`, the account may have been deleted elsewhere (5.6.3). Else this is a new account: flush creates it.
   - `ok`: `meta.docSeen = true`, continue.
3. `L = toSynced(local, meta.others, deviceId, epoch)`, `M = mergeProgress(L, remote.progress)`, where `epoch = meta.docSeen ? meta.epoch : max(meta.epoch, remote epoch)`. (Correction: in case C `meta.epoch` is 0 until the first snapshot; play in that window would otherwise be in epoch 0 and lose whole to an account that was reset before.) Same for settings with `meta.settingsAt`.
4. If `M` differs from `L`: apply. Set `applying = true`; write meta (`others = M.slots` without `deviceId`, `epoch = M.epoch`); `useProgress.setState(fromSynced(M, local))`; apply the settings keys whose remote `at` is newer and copy those `at` values into `meta.settingsAt`; `applying = false`; `reconcileAchievements()`.
5. If `M` differs from `remote.progress` (or settings differ): there is something only this device has. Mark dirty and schedule a flush.
6. Status: `saving` if dirty or a flush is in flight and connected; `offline` if dirty and not connected; else `saved`.

Local changes: `useProgress.subscribe` and `useSettings.subscribe`:

- Ignore while `applying`.
- Progress turned into `EMPTY_PROGRESS`: reset (4.6).
- Settings: for each key whose value changed, `meta.settingsAt[key] = Date.now()`.
- Mark dirty; schedule a flush: debounce 2000 ms after the last change, at most 10 000 ms after the first unsaved change. Also flush right away on `visibilitychange` to hidden and on `pagehide` (best effort; `localStorage` already holds everything).

Flush (`flushNow`):

1. Not connected (`navigator.onLine === false`, or the listener's last snapshot was from cache): `sync: 'offline'`, keep dirty, return. The next server snapshot schedules a flush, and so does the `online` event, which also clears both offline flags first: Firestore's listener can take minutes to reconnect (it backs off), so the save itself finds out whether the server is reachable. A save that failed with `unavailable` sets `saveOffline` (shown as offline) but does not block the next try, and is retried on the back-off below. (Correction: one `unavailable` save used to set `connected = false` until the listener sent a server snapshot, which never comes while the listener stays connected and nothing changes, so saving stopped for good after a blip; after a reconnect it waited for the listener's back-off, minutes in Chrome. Tests: `tests/sync.unit.test.ts` "saving after a failed save".)
1a. Rate: the rules accept one save a second per account (6.1). A device waits until `MIN_SAVE_GAP_MS` (1.2 s) after its own last commit before the next transaction, and a `permission-denied` is retried once after 1.5 s (another device of the account saved within the second) before it counts as an error.
2. `runTransaction(db, async (tx) => { ... })`, recomputed on every SDK retry:
   - `snap = await tx.get(ref)`; `parsed = parseDoc(...)`; `newer` aborts with `outdated`.
   - `M = mergeProgress(toSynced(local, meta.others, deviceId, meta.epoch), remote.progress or empty)`; settings likewise.
   - If `M` and the settings equal the remote values and the document exists: write nothing.
   - Else `tx.set(ref, { schemaVersion: SCHEMA_VERSION, profile: { name }, progress: M, settings: S, clientId: deviceId, createdAt: exists ? remote.createdAt : serverTimestamp(), updatedAt: serverTimestamp() })`. A full `set` is safe inside the transaction because `M` already contains the server copy.
3. After commit, apply `M` locally exactly as in step 4 of `onSnap`: joined again with the stores as they are now, so play during the round trip is kept. Up to three rounds run while changes keep arriving; anything later is left to the next debounce. Clear dirty if no local change arrived during the flush (a change counter, not a boolean), and then `meta.unsaved`.
4. Errors: `unavailable` or `deadline-exceeded` -> `offline`, retried on the back-off and on reconnect. `permission-denied`, `invalid-argument`, `resource-exhausted`, `failed-precondition` -> `sync: 'error'`, `error` set (7.4), retry with backoff 5 s, 30 s, 2 min, then on the next local change.

`stopSync()` unsubscribes the listener and both store subscriptions and clears the timers.

### 5.5 Echo loops

Three independent guards:

1. Idempotence. A device's own write comes back in a snapshot as `M`; `mergeProgress(L, M) = L` because `L` already contains `M`, so step 4 applies nothing and step 5 schedules nothing.
2. The `applying` flag. Store changes made by an apply are not treated as local changes, so they never schedule a flush.
3. No-op transactions. A flush whose merge equals the server copy writes nothing.

Test: after one round on device A with two devices listening, `updatedAt` changes once (or twice when B also had something to add), then stays still for 10 seconds.

### 5.6 Scenarios

#### 5.6.1 Two devices online at once

A finishes a round: debounced flush, transaction, commit. B's listener gets the snapshot, merges, applies. B's slot is untouched by A, A's slot is replaced in B's `meta.others`, B's totals rise by exactly A's new XP. If both flush at the same moment, Firestore retries one transaction, which then reads the other's write and merges it.

#### 5.6.2 Offline edits, then reconnect

Offline, gameplay goes into the stores and `localStorage` as today; status `offline`. Reconnected, the `online` event or the first server snapshot triggers a flush; the transaction joins whatever the other devices wrote meanwhile. A device that was offline for weeks loses nothing and overwrites nothing.

#### 5.6.3 Account deleted on another device

A server snapshot reports the document missing while `meta.docSeen` is true. Do not recreate it. Call `auth.currentUser.reload()`:

- fails with `auth/user-not-found`, `auth/user-disabled` or `auth/user-token-expired`: `stopSync()`, `resetDeviceToGuest()`, `notice: 'deleted-elsewhere'`, then `signOut`. Firebase itself signs the device out when the reload fails, so the auth listener, which would otherwise report `session-ended`, does nothing while `isCheckingDeletion()` is true.
- succeeds: wait `DELETE_GRACE_MS` (5 s) and reload again. Still there: the document was removed by hand (console), so heal it by flushing from local state. Gone: as above. (Correction: healing on the first successful reload recreated the document of a deleted account. `deleteAccount` removes the document first and the login a moment later (5.6.5), so another online device saw the document vanish while the login still existed, rebuilt the document, and stayed signed in on it. Found by `tests-emulator/sync.test.ts`, "delete account", which holds the deleting device's `accounts:delete` request for 1.5 s to make that window certain. The grace period closes the window for any delete that finishes within 5 s; section 11 has the rest.)

A device that was **closed** while its account was deleted (or its session revoked) learns it on its next start: Firebase reloads the saved user, gets `user-not-found` (or a refused token) and signs it out, and the auth listener sees no user with `meta.owner` set. That is the session-ended path of 2.5: the Firestore cache is always removed, and the stores go too unless `meta.unsaved` says they hold something the account never got. (Correction: that path used to keep everything, so a school laptop that was closed during the delete reopened with the deleted student's full progress, the cached document with their name in IndexedDB, a notice telling them to sign in again to an account that no longer existed, and an offer to move that progress into the next student's account. Tests: `tests-emulator/sync.test.ts` "a device closed while the account changed" and `e2e-accounts/accounts.spec.ts` "deleted on another device", which also checks that no `firestore/*` IndexedDB database is left.) When the stores are kept (`leftover`), the guest screen says so and offers "Clear this device" (7.6.1); signing in to the same account saves them, and a different account clears them (case D).

#### 5.6.4 Sign out (`signOutAndReset`)

1. With a sync session in this tab, if dirty: `await flushNow(8000)`. If it returns `offline` or `error` and `force` is not set, return `{ ok: false, reason: 'unsaved' }`; the UI shows the offline warning (7.2). Without a session (the SDK could not load), `meta.unsaved` decides the same.
2. `stopSync()`.
3. `signOut(auth)`.
4. `resetDeviceToGuest()`: `useProgress.getState().reset()`, `useSettings.getState().reset()`, `clearOwnership()`, `wipeLocalFirestore()` (the cached copy of the account leaves the shared computer too).
5. `status: 'guest'`, `user: null`, `sync: 'idle'`, `notice: 'signed-out'`.

The `deviceId` stays, so signing in again on this device reuses its slot (case C, then the first snapshot restores everything; play before that snapshot is adopted as its own slot, 5.2).

Without the SDK (offline cold start, chunk not cached) the result is `unsaved` when `meta.unsaved` is set, unless `force`; otherwise the stores are reset and `wipeLocalFirebaseStorage()` deletes the saved session and the cached account by name, so the next start is a guest. Every reset to guest also clears the shared-computer cookie and starts a new `gen`.

#### 5.6.5 Delete account (`deleteAccount`)

1. Offline: return `offline`.
2. Recent sign-in check: if the later of the ID token's `auth_time` (`getIdTokenResult().authTime`) and a sign-in or reauthentication completed in this tab is older than 5 minutes, return `reauth` without touching anything. (`auth_time` is what Firebase's own requires-recent-login check uses; `metadata.lastSignInTime` is not refreshed by reauthentication.) The UI shows `ReauthBlock`, then calls `deleteAccount()` again.
3. `stopSync()`, then `deleteRemoteDoc(uid)`.
4. `deleteUser(user)`. On `auth/requires-recent-login` (the 5 minute guess was wrong): `startSync()` again, which recreates the document from the local copy (the device still holds everything), and return `reauth`.
5. `resetDeviceToGuest()`, `status: 'guest'`, `notice: 'deleted'`.

The document goes first because the security rules need a live user to delete it; there is no server code (the free plan has no Cloud Functions).

#### 5.6.6 Sign in on a device with no data

Case C. Status `sync: 'loading'` ("Loading your progress") until the first server snapshot, which fills the stores in one apply.

#### 5.6.7 Schema version changes

- `SCHEMA_VERSION` rises only when the synced shape changes in a way old clients would damage. Adding a field old clients would drop on write counts.
- Newer client, older document: `parseDoc` migrates, and the next flush writes the new version.
- Older client, newer document: `outdated`, read-only, "A newer version of Periodica saved your progress. Reload to keep saving" with a Reload button. The PWA updates itself on the next load (`registerSW` with autoUpdate), so this is short-lived.
- Rules reject any write that lowers `schemaVersion`, so an old cached client cannot downgrade the document even if it tried.
- The local zustand `version` numbers are separate and keep their own migrations.

#### 5.6.8 Several tabs on one device

Same `deviceId`, same `localStorage`, same Firebase session. Three mechanisms keep tabs from writing over each other:

1. **Every tab listens** (`bootAccounts`, not only tabs with a sync session). A `storage` event for `periodica-progress` or `periodica-settings` reloads that store: through `sync.applyExternal` when this tab has a session (not counted as play here; then checked against the account as last seen, so a copy below the others' baseline is repaired and anything the account lacks is saved from here), else with a plain `persist.rehydrate()`. A change of `periodica-sync` follows the other tab: a new `gen` reloads both stores; a new owner makes this tab `prepareAccounts()` (Firebase then signs it in too and it starts its own session); the owner gone stops this tab's sync and releases its Firestore cache. `pageshow` from the back-forward cache reloads both stores, since storage events are not delivered there.
2. **Ownership generation.** `meta.gen` changes whenever the device changes hands: sign out, delete, reset to guest (`clearOwnership`), a sign-in that takes an empty device (case C) and an adoption commit. Each tab remembers the generation its stores were loaded under. The stores persist through `guardedStorage`, which refuses a write from a tab whose generation is old and reloads the stores instead, so a tab that missed the events (frozen, or restored from the back-forward cache) can never write one student's copy over another's.
3. **Transactions and the join** make two tabs with sessions saving the same thing safe; they write the same slot (`deviceId`) with the same value.

(Correction: only a tab with a sync session used to listen. A tab opened as a guest kept its own copy in memory: after student 1 signed up in another tab and signed out, that tab still showed student 1's progress, and opening an element card wrote it back as guest data, which student 2's new account then adopted; or, with student 1 signing back in, it was adopted a second time and counted twice. And a stale guest tab writing over a signed-in tab made that tab drop below the account's total, so the next round there was clamped away and never saved. Tests: `e2e-accounts/accounts.spec.ts` "tabs of one browser", `tests/sync.unit.test.ts` "another tab writes the stores", `tests/accountGuards.test.ts` "stale tabs".)

#### 5.6.9 Shared computers

Signing out clears a shared computer only if the student remembers to. Each sign-in form has a "Shared computer" switch (on by default on computers, off on phones and tablets, `defaultShared()`). With it on, the sign-in writes `meta.shared = true`, `meta.activeAt`, and a session cookie `periodica-session=1` (no expiry, path of the app). A session cookie is shared by every tab and dropped when the browser closes, unlike Firebase's own session persistence, which is per tab.

The session is over when the device has an owner, `meta.shared` is set, and either the cookie is gone (the browser was closed) or `meta.activeAt` is more than `SHARED_IDLE_MS` (30 minutes) old. Activity (`pointerdown`, `keydown`, hiding the page) moves `activeAt`, written at most once a minute. `bootAccounts()` checks at start, on every return to the page and once a minute.

Ending it: synchronously, before the first render at start, the name and email go (`meta.user = null`, `status: 'guest'`, the auth store's initial state already shows a guest); then a running session saves what it can (`flushNow(8000)`), sync stops, and the device is reset to a guest unless something is still unsaved (then it stays as a leftover, as in 5.6.3, without the shared flag). The Firebase session is removed with `signOut` when the SDK is loaded, else by deleting its storage by name, with no network call. `prepareAccounts()` waits for this to finish. After inactivity the guest screen shows `notice: 'shared-idle'`.

Tests: `tests-emulator/sync.test.ts` "shared computer" (a restarted browser, 30 minutes idle, and not shared), `e2e-accounts/accounts.spec.ts` "shared computer" (a real browser restarted from its saved storage and IndexedDB without session cookies), `tests/accountGuards.test.ts`.

#### 5.6.10 Email verification

`signUpWithEmail` sends a verification email (`sendEmailVerification`) without waiting for it. Until the link is opened, `user.verified` is false and the signed-in screen says "Check your inbox for a link to confirm your email address" with "Send again". The screen reloads the user when it is shown again, so a link opened on a phone is picked up. Sync does not wait for verification: a student whose school filters the email still keeps their progress. What this does and does not protect against is in section 11.

---

## 6. Security rules and emulators

### 6.1 `firestore.rules`

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function signedInAs(uid) {
      return request.auth != null && request.auth.uid == uid;
    }

    function isCount(n, max) {
      return n is int && n >= 0 && n <= max;
    }

    function validProfile(d) {
      return !('profile' in d)
        || (d.profile is map
            && d.profile.keys().hasOnly(['name'])
            && d.profile.name is string
            && d.profile.name.size() >= 1
            && d.profile.name.size() <= 40);
    }

    function validDaily(x) {
      return x is map
        && x.keys().hasOnly(['results', 'streak', 'bestStreak', 'lastKey'])
        && x.keys().hasAll(['results', 'streak', 'bestStreak', 'lastKey'])
        && x.results is map && x.results.size() <= 400
        && isCount(x.streak, 100000)
        && isCount(x.bestStreak, 100000)
        && (x.lastKey == null
            || (x.lastKey is string && x.lastKey.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')));
    }

    // Atomic numbers 1 to 118: the only values `explored` may hold.
    function ELEMENTS() {
      return [1, 2, 3, /* ... every atomic number ... */ 118];
    }

    // A time in ms when given; settings.at holds one per setting key.
    function optTime(m, k) {
      return !(k in m) || (m[k] is int && m[k] >= 0 && m[k] <= 100000000000000);
    }

    function validProgress(p) {
      return p is map
        && p.keys().hasOnly(['epoch', 'slots', 'mastery', 'best', 'bestCombo', 'daily', 'achievements', 'explored', 'chapters'])
        && p.keys().hasAll(['epoch', 'slots', 'mastery', 'best', 'bestCombo', 'daily', 'achievements', 'explored', 'chapters'])
        && isCount(p.epoch, 1000000)
        && p.slots is map && p.slots.size() <= 500
        && p.mastery is map && p.mastery.size() <= 118
        && p.best is map && p.best.size() <= 64
        && isCount(p.bestCombo, 100000)
        && validDaily(p.daily)
        && p.achievements is map && p.achievements.size() <= 64
        && p.explored is list && p.explored.size() <= 118
        && p.explored.toSet().hasOnly(ELEMENTS())
        && p.chapters is map && p.chapters.size() <= 64;
    }

    function validSettings(s) {
      return s is map
        && s.keys().hasOnly(['values', 'at'])
        && s.keys().hasAll(['values', 'at'])
        && s.values is map
        && s.values.keys().hasOnly(['sound', 'haptics', 'reduceMotion', 'colorblind', 'difficulty', 'quizTimer'])
        && s.values.keys().hasAll(['sound', 'haptics', 'reduceMotion', 'colorblind', 'difficulty', 'quizTimer'])
        && s.values.sound is bool
        && s.values.haptics is bool
        && s.values.reduceMotion is bool
        && s.values.colorblind is bool
        && s.values.quizTimer is bool
        && s.values.difficulty in ['learner', 'standard', 'expert']
        && s.at is map
        && s.at.keys().hasOnly(['sound', 'haptics', 'reduceMotion', 'colorblind', 'difficulty', 'quizTimer'])
        && optTime(s.at, 'sound') && optTime(s.at, 'haptics') && optTime(s.at, 'reduceMotion')
        && optTime(s.at, 'colorblind') && optTime(s.at, 'difficulty') && optTime(s.at, 'quizTimer');
    }

    function validUser(d) {
      return d.keys().hasOnly(['schemaVersion', 'profile', 'progress', 'settings', 'clientId', 'createdAt', 'updatedAt'])
        && d.keys().hasAll(['schemaVersion', 'progress', 'settings', 'clientId', 'createdAt', 'updatedAt'])
        && d.schemaVersion is int && d.schemaVersion >= 1 && d.schemaVersion <= 1000
        && d.clientId is string && d.clientId.size() >= 8 && d.clientId.size() <= 64
        && d.updatedAt == request.time
        && validProfile(d)
        && validProgress(d.progress)
        && validSettings(d.settings);
    }

    match /users/{uid} {
      allow get: if signedInAs(uid);
      allow list: if false;
      allow create: if signedInAs(uid)
        && validUser(request.resource.data)
        && request.resource.data.createdAt == request.time;
      // At most one save a second per account (docs/ACCOUNTS.md 6.1): sync never needs more (it waits
      // MIN_SAVE_GAP_MS between its own saves and retries a refusal), and it bounds a write loop.
      allow update: if signedInAs(uid)
        && validUser(request.resource.data)
        // createdAt never changes; a stored document without one (edited by hand or by a tool) can be
        // healed once with the request time, which is what sync.ts sends then (serverTimestamp()).
        && (('createdAt' in resource.data)
            ? request.resource.data.createdAt == resource.data.createdAt
            : request.resource.data.createdAt == request.time)
        && request.resource.data.schemaVersion >= resource.data.schemaVersion
        && request.time > resource.data.updatedAt + duration.value(1, 's');
      allow delete: if signedInAs(uid);
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

(`ELEMENTS()` in the file lists all 118 numbers.)

What the rules do and do not do:

- Only the owner reads or writes their document; nobody can list users; every other path is closed.
- The shape is fixed: no unknown fields, settings fully typed (values and their `at` times, which must be whole ms), `explored` limited to atomic numbers 1 to 118, every map and list bounded, timestamps from the server.
- At most one save a second per account: an update must come more than 1 s after the stored `updatedAt`. Sync never needs more (5.4, step 1a); the limit bounds a write loop from developer tools to 86 400 writes a day instead of as many as the network allows. Creating and deleting are not limited.
- Rules cannot loop over map entries, so the contents of each slot, mastery, best, daily and achievement entry are bounded only by the counts and Firestore's 1 MiB document limit: a signed-in user can store up to about 1 MiB of junk in their own document. Neither that nor the write limit stops a determined script from using up the free tier's daily quota (20 000 writes) or filling storage with many sign-ups. That is what App Check, the sign-up quota and a budget alert are for (section 10, steps 13 to 15), not the rules.
- They do not stop a student editing their own XP with developer tools. Nothing depends on XP being trustworthy (there are no leaderboards). If a leaderboard ever comes, scores must be checked on a server.
- Writes are not gated on a verified email (5.6.10, section 11). To require it, add `&& (request.auth.token.email_verified == true || request.auth.token.firebase.sign_in_provider == 'google.com')` to `create` and `update`; sync then shows "Could not save" until the link is opened, so the account screen would need a matching message first.

### 6.2 `firebase.json` and `.firebaserc`

```json
{
  "firestore": { "rules": "firestore.rules" },
  "emulators": {
    "auth": { "host": "127.0.0.1", "port": 9099 },
    "firestore": { "host": "127.0.0.1", "port": 8080 },
    "ui": { "enabled": false },
    "singleProjectMode": true
  }
}
```

`.firebaserc`: `{ "projects": { "default": "demo-periodica" } }`. The owner deploys to the real project with `--project <id>` (section 10), so the real id never needs to be committed.

`.gitignore` gains `firebase-debug.log`, `firestore-debug.log`, `ui-debug.log`, `e2e-accounts/.dist`, `e2e-accounts/.results`, `e2e-accounts/.report`. Local env files already match `*.local`.

### 6.3 Env files

`.env.example` (committed, empty values, a comment saying the web config is public by design and goes in `.env.local`):

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
# Optional: reCAPTCHA Enterprise site key for App Check (section 10). Public, like the rest.
VITE_FIREBASE_APPCHECK_SITE_KEY=
# 1 = connect to local emulators (auth 9099, firestore 8080). Only for dev servers and demo-* projects.
VITE_FIREBASE_EMULATORS=
```

The emulator flag only counts in a dev server or for a `demo-*` project (`emulatorsAllowed`, 2.3), and `vite.config.ts` has a build-time guard (`periodica-firebase-env-guard`) that fails any `vite build` with `VITE_FIREBASE_EMULATORS=1` and a project id that does not start with `demo-`. So an `.env.local` copied from `.env.emulators`, or a repository variable set by mistake, can never ship a bundle that sends students' passwords and tokens to `127.0.0.1`.

`.env.emulators` (committed; demo values that only work against the emulators, used with `vite --mode emulators`):

```
VITE_FIREBASE_API_KEY=demo-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-periodica.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-periodica
VITE_FIREBASE_APP_ID=demo-app
VITE_FIREBASE_EMULATORS=1
```

### 6.4 Scripts

```json
"emulators": "npx -y firebase-tools@15.37.0 emulators:start --only auth,firestore --project demo-periodica",
"dev:accounts": "vite --mode emulators",
"test:rules": "npx -y firebase-tools@15.37.0 emulators:exec --only firestore --project demo-periodica \"vitest run -c vitest.emulator.config.ts tests-emulator/rules.test.ts\"",
"test:accounts": "npx -y firebase-tools@15.37.0 emulators:exec --only auth,firestore --project demo-periodica \"vitest run -c vitest.emulator.config.ts && playwright test -c playwright.accounts.config.ts\"",
"test:accounts:e2e": "npx -y firebase-tools@15.37.0 emulators:exec --only auth,firestore --project demo-periodica \"playwright test -c playwright.accounts.config.ts\""
```

`test:accounts` runs everything that needs the emulators in one emulator session: rules (6.5), sync (6.5.1) and the browser flows (6.6). `test:rules` is the quick rules-only loop and `test:accounts:e2e` the browser flows alone. They start their own emulators on the fixed ports 8080 and 9099, so stop a running `npm run emulators` first (or, with it running, call `npx vitest run -c vitest.emulator.config.ts` and `npx playwright test -c playwright.accounts.config.ts` directly). None of these run in `npm test` or `npm run test:e2e`, so CI without emulators keeps passing.

Dependencies: `firebase@^13` (dependency); `@firebase/rules-unit-testing@^6` (dev; its peer is `firebase@^13`). `firebase-tools` is run with `npx`, not installed, pinned to 15.37.0, the version verified with these suites (Firestore emulator 1.22.0; needs Java 21).

### 6.5 Rules tests (`tests-emulator/rules.test.ts`)

`vitest.emulator.config.ts` includes only `tests-emulator/**/*.test.ts`, so `npx vitest run` never picks these up. Use `initializeTestEnvironment({ projectId: 'demo-periodica', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } })`, a `validDoc()` fixture built with `merge.ts` types, and `assertSucceeds` / `assertFails`:

- Owner creates a valid document with `serverTimestamp()` for both times, then reads it, updates it, deletes it.
- Another signed-in user cannot get, update or delete it. Signed out cannot get it. Listing `users` fails even for a signed-in user.
- Create fails: extra top-level field, missing `progress`, missing `settings`, `updatedAt` as a client time, `createdAt` not the request time, `schemaVersion` 0 or a string, `clientId` of 7 or 65 characters.
- Update fails: `createdAt` changed (to a client time or to the request time), `schemaVersion` lowered. Seeds are written with `updatedAt` a minute ago so they test the rule named, not the rate limit.
- A stored document without `createdAt` (edited by hand or by a tool): a save with `serverTimestamp()` heals it, and the time then stays fixed; an arbitrary time, or a save still without `createdAt`, is refused. (Correction, review finding 12: the update rule used to compare with `resource.data.createdAt` unconditionally, so such a document refused every save forever, although `sync.ts` already sends `serverTimestamp()` in that case.)
- Rate: a second save straight after the first is refused, one 1.1 s later is accepted, delete is not limited.
- Progress fails: 119 mastery keys, 119 explored, 501 slots, 401 daily results, 65 best keys, an unknown key in `progress`, `lastKey` "yesterday", negative `epoch`, a fractional `bestCombo`, `explored` holding 0, 119 or a string.
- Settings fail: `difficulty: 'hard'`, `sound: 'yes'`, a seventh key in `values`, an unknown key in `at`, an `at` time that is a string, a map or negative; all six times pass.
- Profile fails: empty name, 41 characters, 21 emoji (42 UTF-16 units); 20 emoji pass, and `profileName()` of any input (emoji at the cut, 80 characters, blank) passes.
- Any other collection: read and write denied.
- Nobody else creates the document: another user, signed out, or the owner writing under someone else's id. Signed out cannot update or delete it either.
- Size: a document over Firestore's 1 MiB limit is refused with `invalid-argument` even though it passes every count in the rules (entries are not checked one by one, 6.1); the worst case of 3.3, every bound at its cap with 64-entry trails, is accepted.

### 6.5.1 Sync tests (`tests-emulator/sync.test.ts`)

Each simulated device is a child process (`tests-emulator/support/device-process.mjs`) that loads the real `src/` modules through Vite's SSR loader in mode `emulators` (so `import.meta.env` comes from `.env.emulators`). A device therefore has its own `sync.ts` and `account.ts` singletons, zustand stores, Firebase app, `localStorage`, `navigator.onLine`, `fetch` and clock, as a separate browser would. `firebase/auth` is aliased to its browser build, which falls back to in-memory persistence in Node; Firestore falls back to its memory cache. The test drives a device with `device.run((ctx, arg) => ...)`, sending the function's source over IPC, and waits with `device.until(...)` on conditions. Going offline sets `navigator.onLine` false, makes `fetch` fail, calls Firestore's `disableNetwork`, and fires `offline` on `window`; coming back reverses all four. Documents are read through the emulator's REST API with `Authorization: Bearer owner`. Every test signs up its own account with a unique email, so no test depends on another's data.

1. A guest who signs up: the document holds the guest's counters once (sum of slots), lattice fields and changed settings; local state is unchanged; an extra `flushNow()` adds nothing.
2. A guest on a second device signs in to an account with progress: both devices and the document end at the sum.
3. Two devices online: each one's round, explored element and settings reach the other; the receiving device adds no slot of its own.
4. Both devices offline, different play on each (some on the same elements): nothing is written while offline and both say `offline`; both reconnect at once (racing transactions); both devices and the document hold exactly the sum of all play, with counters, chapters and `explored` joined and the same mastery on both; then no write for 5 s and another `flushNow()` changes nothing.
5. Reset on one device empties the account on the other (epoch 1); play after it counts from zero.
6. Sign out saves play made inside the debounce, then leaves a fresh guest (stores, `localStorage` copies, meta, no current user); signing in again restores it with nothing counted twice.
7. Offline with unsaved play, sign out returns `unsaved` and keeps everything; back online it saves and signs out.
8. Delete account with a second device listening: document and login gone, this device `deleted`, the other `deleted-elsewhere`, both fresh guests, and the document never comes back (the case behind the 5.6.3 correction).
9. A document removed by hand while the login exists is rebuilt from the device after the grace period.
10. Delete after an old sign-in (the device clock moved six minutes on) returns `reauth`; a wrong password fails, the right one succeeds and the delete goes through.
11. A device closed during a delete on another device (its storage saved, the process ended, a new process started from that storage with an IndexedDB name list): on start it is a fresh guest with `notice: 'session-ended'`, no `leftover`, and the `firestore/*` database deleted (5.6.3).
12. A device whose session ended with unsaved offline play keeps it as a leftover (`notice: 'session-ended-unsaved'`, no name), and signing in to the same account saves it once; "Clear this device" removes it.
13. Sign out, sign in again and finish a round before the first snapshot: the account holds both rounds (case C, 5.2).
14. A name of 21 emoji is refused before any network call; 20 emoji are saved as the profile name.
15. Email sign-up sends a verification email (the emulator's `oobCodes`); opening its link and `refreshUser()` mark the account verified.
16. Shared computer: a restarted browser (storage kept, no session cookie) starts as a guest with no name and is cleared, the account keeps everything; 30 minutes without use signs out after saving; without the shared choice a long break changes nothing.

Test devices start from another device's saved state with `Device.start(name, { storage, databases })`: `storage` is a `localStorage` dump (`device.storage()`), `databases` a list of IndexedDB names the app can list and delete but not open. Test devices keep Firebase's session in `localStorage` (they have no IndexedDB), so a dump with its `firebase:` keys restores the session and one without them starts signed out.

### 6.6 Account flow tests (`e2e-accounts/`, `npm run test:accounts:e2e`)

`playwright.accounts.config.ts`: `testDir: './e2e-accounts'`, one worker, the preinstalled Chromium when present, and a web server `vite --mode emulators --port 5197` (the dev server, so `.env.emulators` applies and nothing is built). The specs open `e2e-accounts/harness.html`, a test page that calls `bootAccounts()` before rendering `<Account />` and exposes the stores and the account API as `window.__periodica`. It stands in for the wired app until phase 2; after phase 2 it can stay (it is the only page that exposes the API) or the specs can move to `#/account`. Each test uses unique emails, so the emulators are not reset between tests; documents are read with `Authorization: Bearer owner` through `tests-emulator/support/emulator.ts`.

Written (`e2e-accounts/accounts.spec.ts`):

1. Two tabs, two students: student 1 plays as a guest with a second tab open, creates an account in the first tab and signs out; the second tab shows a fresh start, and student 2's new account holds none of student 1's progress (5.6.8).
2. The same, with student 1 signing back in: their progress is in the account once, not twice.
3. A guest tab left open while the student signs in in another tab: an element card opened in the guest tab does not lower the signed-in tab, and the next round there is added to the account.
4. A browser closed while the account is deleted on another: reopened, it is a fresh guest with the `session-ended` notice, no name on screen, and no `firestore/*` IndexedDB database (5.6.3).
5. A shared computer: after a restart (storage and IndexedDB kept, session cookies dropped) it starts as a guest with no name, stays signed out after a reload, and the account keeps everything (5.6.9).

Still to write (the flows below are covered by the sync suite or by hand, not yet in a browser): sign up and the screen copy; guest merge across reloads; two contexts offline and back; sign out copy and IndexedDB cleanup; the offline sign-out warning; delete with reauth; error copy for wrong password, existing email, invalid email and short password; forgot password with the emulator's `PASSWORD_RESET` code; Google through the emulator's popup ("Add new account"); a newer `schemaVersion` showing the outdated line.

### 6.7 Default suites stay green

- `npx vitest run` gains tests that need no emulator: `tests/merge.test.ts`, `tests/authErrors.test.ts`, `tests/accounts-off.test.ts`, `tests/accountGuards.test.ts`, and `tests/sync.unit.test.ts` (the sync layer against `tests/support/fakeFirebase.ts`).
- `npm run test:e2e` gains `e2e/accounts-off.spec.ts`: with the default (unconfigured) build, load Home, open Settings, play nothing; assert no request goes to `googleapis.com`, `firebaseapp.com`, `gstatic.com`, `127.0.0.1:9099` or `:8080`, and no script whose URL contains `firebase-sdk` is requested.

---

## 7. UI states and copy

Copy rules from `docs/DESIGN.md` section 9 apply. One-line status, error and hint text has no trailing period; text of two or more sentences is a paragraph and keeps its periods. Accessible names listed here are what the e2e specs use; keep them.

### 7.1 Screen states

The account screen is a normal page (header and nav visible): the page container every screen uses, with a single left-aligned column of `max-w-120` (480px). `h1` uses `.t-title`. Panels are `.card` with `p-6` (`p-5` on phones), and so are the confirmations that open under them.

| State | `h1` | Content |
| --- | --- | --- |
| `unconfigured` | Accounts are not set up yet | Paragraph: "Your progress is saved in this browser, on this device. You can keep playing as you are." Quiet link "Back to home". `screens/AccountOff.tsx` |
| `loading` (returning from Google) | Finishing sign in | `aria-busy="true"` on the panel; no spinner |
| `guest` | Sign in to save your progress | Sub paragraph: "Save your XP, streak and mastered elements and carry on from any device. You can also keep playing without an account." Then the notice (7.6) if any, the guest-progress note (or the leftover block, 7.6.1), and one card with the Google button, the "or" rule, the email panel and the "Shared computer" switch |
| `guest`, SDK offline | Sign in to save your progress | Paragraph: "You are offline. Connect to the internet to sign in or create an account." Buttons and fields disabled |
| `signed-in` | the user's name | Email and sign-in method, what is saved with the sync status, sign out, delete (7.2) |

Guest-progress note, only when the guest has XP: "The progress on this device ({xp} XP, {n} mastered) moves into your account when you sign in." Numbers in `.mono`, formatted with `toLocaleString('en-US')`. It is the only place that says so (the create form has no second line about it).

The divider between Google and email: a hairline with "or" in `.label` in the middle.

"Shared computer" switch, last row of the card (`mt-6 border-t border-line pt-5`, after the email forms), the Settings sheet's toggle pattern (`Switch` inside a `label`): label "Shared computer", hint "Signs out when the browser closes or after 30 idle minutes". Default `defaultShared()`: on for a fine pointer (computers), off for a coarse one (phones, tablets). Its value goes to the Google button and both email forms (5.6.9).

### 7.2 Signed in

- Avatar (`Initials`, 48px) beside the `h1` name.
- Under the name, `text-sm text-ink-2`: the email on its own line (`break-all`, so a long address wraps rather than overflowing), then the method on a second line: "Google sign-in" or "Email sign-in", plus " · Shared computer" when signed in as one. Each segment is `whitespace-nowrap`, so a line only breaks between segments.
- Email not confirmed yet (5.6.10): "Check your inbox for a link to confirm your email address" and a quiet small button "Send again" (busy "Sending"); after sending, "Sent. Open the link in the email to confirm your address". `role="status"`.
- What is saved: one `.card` with four figures in the Progress screen's stat style (`.label` caption, `.num` figure, a unit in `text-sm text-ink-2`), from `useProgress`: Level "{n}" with its title (Novice…), XP, Mastered "{n} of 118", Streak "{n} days" (the live daily streak). Two columns on phones, four from sm. The `SyncStatusLine` sits under the figures inside the card, as its caption:

| `sync` | Icon (lucide, 16px, 1.5 stroke, `text-ink-2`) | Text |
| --- | --- | --- |
| `loading` | `CloudDownload` | Loading your progress |
| `saving` | `Cloud` | Saving |
| `saved` | `CloudCheck` | Saved to your account |
| `offline` | `CloudOff` | Offline, will save when you reconnect |
| `error` | `CloudAlert` in `text-bad` | Paragraph: "Could not save to your account. Your progress is still on this device." |
| `outdated` | `RefreshCw` | "A newer version of Periodica saved your progress. Reload to keep saving" plus `.btn-secondary` "Reload" |
| `idle` | none | nothing |

  Text is `text-ink-2`, never the accent. No spinner and no pulsing: "Saving" is static text, `role="status"` so it is announced politely.

- Actions: `.btn .btn-secondary` "Sign out". Below a hairline, a quiet danger zone: the line "Deleting your account removes it and its saved progress from every device", under it in `text-sm text-ink-3` "Your name and email are kept by Google Firebase, which runs sign in", and `.btn .btn-quiet` in `text-bad`: "Delete account…".
- Avatar: initials only. `AccountUser` carries no photo URL, and a Google photo would be a request to a third-party image host on every visit.

Sign out confirmation (`ConfirmBlock`, replaces the actions):

| Situation | Title | Body | Buttons |
| --- | --- | --- | --- |
| Online | Sign out on this device? | "Your progress stays in your account. This device goes back to a fresh start, so the next person to use it starts from zero." | "Cancel" (secondary), "Sign out" (primary). Busy: "Saving, then signing out" |
| Offline with unsaved changes (`reason: 'unsaved'`) | You are offline | "Progress from this device since you went offline is not in your account yet. If you sign out now, it is lost." | "Stay signed in" (primary), "Sign out anyway" (danger) |

Delete confirmation:

| Step | Title | Body | Buttons |
| --- | --- | --- | --- |
| Confirm | Delete your account? | "This deletes your account and everything saved in it: XP, streaks, mastered elements, badges and settings, on every device. It cannot be undone." Then a `Field` "Type delete to confirm" (`autoComplete="off"`, case and outer spaces ignored); the delete button stays disabled until it matches | "Cancel" (secondary), "Delete account" (danger). Busy: "Deleting" |
| Offline | You are offline | "Connect to the internet to delete your account." | "Close" (secondary), "Try again" (danger; the delete was already confirmed) |
| Needs a fresh sign-in (`ReauthBlock`) | Confirm it is you | "For your security, sign in again before deleting your account." Google user: `GoogleButton` "Continue with Google". Email user: `Field` "Password" (`current-password`) and `.btn-danger` "Confirm and delete" | "Cancel" quiet |

### 7.3 The Google button

Follows Google's sign-in branding, dark theme:

- Fill `#131314`, 1px border `#8E918F`, text `#E3E3E3`; hover adds an 8% white overlay; disabled: fill `#13131461`, border `#8E918F1F`, text `#E3E3E3` at 38%.
- The standard multicolour "G" mark, 18px, unaltered, 12px from the left edge, 10px gap to the text. `GoogleMark` uses Google's four official paths (`#EA4335`, `#4285F4`, `#FBBC05`, `#34A853`) on a transparent background.
- Text "Continue with Google", font `Roboto, var(--font-sans)` at 500 weight (Roboto is not bundled; Android uses its system copy, elsewhere the interface face stands in).
- Full width of the panel, 44px tall (the app's control height), `rounded-control`. Focus ring is the app's `--focus` ring.
- These colours and the four-colour mark are the one sanctioned exception to the single-accent palette: a third party's mark that must stay recognisable. The values live in the component (Tailwind arbitrary values), not in `index.css`.
- Busy: text stays, `aria-busy="true"`, disabled. Before the SDK is ready (`ready: false`) the button is disabled, so a click always opens the popup inside the user gesture.

### 7.4 Email forms

Seg control (`.seg`, two `.seg-item` with `role="tab"`/`aria-selected` or radios as the `.seg` pattern already uses), labelled "Sign in with email": "Sign in" | "Create account". The choice is kept in the URL-free component state; it starts on "Sign in", or "Create account" when the guest has no progress yet. Exception: a notice (7.6) that says the student was just signed out, or that their progress waits for their account (every notice except `deleted`, `deleted-elsewhere` and `cleared`), starts it on "Sign in", since they have an account.

Sign in:

- `Field` "Email": `type="email"`, `autoComplete="email"`, `inputMode="email"`, `autoCapitalize="none"`, `spellCheck={false}`.
- `Field` "Password": `type="password"`, `autoComplete="current-password"`, with an `.icon-btn` toggle (`Eye`/`EyeOff`), `aria-label="Show password"`, `aria-pressed`.
- `.btn .btn-primary` full width "Sign in". Busy: "Signing in".
- `.btn .btn-quiet` "Forgot password" opens the reset form with the email carried over.

Create account:

- `Field` "Name", hint "First name or a nickname", `autoComplete="nickname"`, max 40.
- `Field` "Email" as above.
- `Field` "Password", hint "At least 8 characters", `autoComplete="new-password"`, show toggle.
- `.btn .btn-primary` "Create account". Busy: "Creating account". Nothing under it: the guest-progress note above the card already says where the guest's progress goes (7.1).

Reset password:

- `h2.t-heading` "Reset your password". Paragraph: "Enter the email you use for Periodica and we will send a link to choose a new password."
- `Field` "Email". `.btn .btn-primary` "Send reset link". Busy: "Sending".
- Success replaces the form: paragraph "If an account uses {email}, a reset link is on its way. Check your inbox and spam folder." Quiet "Back to sign in".
- The message is the same whether or not the email has an account (no account discovery).

Inputs use `text-base` (16px) on top of `.field`, so iOS Safari does not zoom the page on focus. The form-level error sits above the primary button in a `role="alert"` region, `text-bad`, with an `AlertCircle` icon; field errors sit under their field, `text-bad`, linked with `aria-describedby`, and the first invalid field receives focus on submit.

### 7.5 Validation (before any network call)

| Check | Message (under the field) |
| --- | --- |
| Name empty after trimming | Enter a name or nickname |
| Name over 40 characters | Use 40 characters or fewer |
| Name of 40 characters or fewer but over 40 UTF-16 units (emoji), which the rules would refuse | Use a shorter name. Emoji count as two characters. |
| Email empty | Enter your email address |
| Email not like `x@y.z` (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) | Enter an email address like name@example.com |
| Password empty (sign in, reauth) | Enter your password |
| Password under 8 characters (create account) | Use at least 8 characters |

### 7.6 Notices (top of the guest screen, dismissible, `role="status"`)

| `notice` | Text |
| --- | --- |
| `signed-out` | Signed out. This device has a fresh start. |
| `deleted` | Your account is deleted. This device has a fresh start. |
| `deleted-elsewhere` | This account was deleted on another device. This device has a fresh start. |
| `session-ended` | You were signed out on this device. Your progress is in your account, and this device has a fresh start. |
| `session-ended-unsaved` | You were signed out on this device before your latest progress was saved. Sign in to the same account to save it. |
| `shared-idle` | Signed out after 30 minutes without use, because this is a shared computer. This device has a fresh start. |
| `cleared` | This device has a fresh start. |
| `redirect-failed` | Google sign in did not finish in this browser. Try again and it opens in a new window. |

#### 7.6.1 Leftover progress

When `leftover` is true (5.6.3), the guest-progress note is replaced by: "This device has progress ({xp} XP, {n} mastered) from an account that was signed out before it was saved. Sign in to that account to save it. Signing in to a different account clears it." and a quiet button "Clear this device". It opens a `ConfirmBlock` "Clear this device?", body "The progress on this device is removed for good. Anything already saved in the account stays there.", buttons "Cancel" and "Clear this device" (danger, busy "Clearing"). The create-account form does not say the progress moves into the new account.

### 7.7 Firebase error codes (`src/lib/authErrors.ts`)

```ts
export function authMessage(code: string): string | null; // null: say nothing (the student cancelled)
export function syncMessage(code: string): string;
```

| Code | Message |
| --- | --- |
| `auth/invalid-credential`, `auth/wrong-password`, `auth/user-not-found`, `auth/invalid-login-credentials` | That email and password do not match. Check them and try again. |
| `auth/invalid-email` | Enter an email address like name@example.com |
| `auth/missing-email` | Enter your email address |
| `auth/missing-password` | Enter your password |
| `auth/email-already-in-use` | There is already an account with this email. Sign in instead. |
| `auth/weak-password`, `auth/password-does-not-meet-requirements` | Use at least 8 characters |
| `auth/too-many-requests` | Too many tries. Wait a few minutes, then try again. |
| `auth/network-request-failed` | You are offline. Connect to the internet and try again. |
| `auth/popup-blocked` (only when the redirect fallback is not possible) | Your browser blocked the sign-in window. Allow pop-ups for this site, or use your email. |
| `auth/popup-closed-by-user`, `auth/cancelled-popup-request`, `auth/user-cancelled`, `auth/redirect-cancelled-by-user` | null (silent) |
| `auth/account-exists-with-different-credential` | This email already has an account with a different way to sign in. Use that one. |
| `auth/credential-already-in-use` | This sign-in is already used by another account |
| `auth/requires-recent-login` | For your security, sign in again to continue |
| `auth/user-disabled` | This account is turned off |
| `auth/user-token-expired`, `auth/invalid-user-token` | You were signed out. Sign in again. |
| `auth/operation-not-allowed` | This way of signing in is not turned on yet |
| `auth/unauthorized-domain` | Sign in is not set up for this web address yet |
| `auth/invalid-api-key`, `auth/app-not-authorized`, `auth/api-key-not-valid` | Accounts are not set up correctly yet |
| `auth/web-storage-unsupported` | Your browser is blocking the storage sign in needs. Turn off private browsing or try another browser. |
| `auth/operation-not-supported-in-this-environment` | Google sign in does not work in this browser. Use your email instead. |
| `auth/quota-exceeded` | Too many sign-ins right now. Try again later. |
| `auth/timeout` | Sign in took too long. Try again. |
| anything else | Something went wrong. Try again. |

`syncMessage`: `permission-denied`, `invalid-argument` -> "Could not save to your account. Your progress is still on this device."; `resource-exhausted` -> "Saving is paused for now. Your progress is still on this device."; anything else -> the `permission-denied` text. `unavailable` and `deadline-exceeded` never show an error; they set `offline`.

`tests/authErrors.test.ts` checks every code in the table, that no message contains "!" or "Firebase" or "auth/", and that one-line messages have no trailing period.

---

## 8. Build and bundle

### 8.1 Env types

`src/env.d.ts` declares `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_EMULATORS`, `VITE_FIREBASE_APPCHECK_SITE_KEY` as optional strings on `ImportMetaEnv`.

### 8.2 Zero cost when unconfigured

`CONFIGURED` is a build-time constant, and `loadFirebase()` starts with `if (!CONFIGURED) return Promise.reject(...)`, so nothing runs and nothing is fetched: `bootAccounts()` returns at once and the account screen shows the "not set up yet" state.

An unconfigured build also carries no account code. The bundler only folds a condition it can see at the call site, and a constant imported from another module (`CONFIGURED`, `isConfigured()`) is not one, so the few places where the app reaches the account layer test the env var itself, `import.meta.env.VITE_FIREBASE_PROJECT_ID`:

- `main.tsx`: `if (import.meta.env.VITE_FIREBASE_PROJECT_ID) bootAccounts();`
- `App.tsx`: the lazy account screen is `screens/Account` with accounts and `screens/AccountOff` (the "not set up yet" note) without them.
- `Shell.tsx`: the header's account entry and the slot it takes (`HeaderAccount`, `useHeaderAccount`) are `AccountEntry`/`useAccountSlot` with accounts, and constants without.
- `SettingsSheet.tsx`: "Your data" is `AccountDataSummary` with accounts and the local line without; whether the reset reaches every device (`useSignedIn`) is `false` without.
- `firebase.ts`: the emulator addresses exist only when `VITE_FIREBASE_EMULATORS === '1'`, so no production bundle carries `127.0.0.1`.

`vite.config.ts` marks the account modules (`lib/accountCore`, `lib/account`, `lib/authErrors`, `lib/firebase`, `store/auth`, `components/account/*`) free of side effects (`build.rolldownOptions.treeshake.moduleSideEffects`). They only declare things at the top level; without the flag the bundler keeps a module that imports a store even when none of its exports is used.

The stores now import `guardedStorage` from `syncMeta.ts`, which reads `import.meta.env.VITE_FIREBASE_PROJECT_ID` itself instead of importing `firebase.ts`, so the stores never pull `firebase.ts` (and its `import()`) into a build. In an unconfigured build the stale-tab check folds away and `guardedStorage` is plain `localStorage`; `periodica-sync` is never created (checked by `e2e/accounts-off.spec.ts`).

### 8.3 `vite.config.ts`

In `VitePWA({ workbox })`:

```ts
globIgnores: ['**/firebase-sdk-*.js'],
runtimeCaching: [
  {
    urlPattern: ({ url }) => /\/assets\/firebase-sdk-[^/]+\.js$/.test(url.pathname),
    handler: 'CacheFirst',
    options: { cacheName: 'firebase-sdk', expiration: { maxEntries: 4 } },
  },
],
```

The builder checks the real chunk name after `vite build` (the dynamic `import('./firebase-sdk')` should emit `assets/firebase-sdk-<hash>.js`; if the bundler splits shared code into extra chunks, match those too). Budget: in an unconfigured build the main entry chunk grows by at most 4 KB gzip; report the before and after sizes.

Measured after phase 2 (gzip -9, the whole first load: `index.html`'s entry script and its preloads): the last commit before accounts, 201,553 bytes. Unconfigured, 202,906 bytes (+1.4 kB): one entry chunk, no `sync` or SDK chunk at all, and only `guardedStorage` from `syncMeta.ts`, the Settings reset confirmation (`ConfirmBlock`) and the header's account slot. Configured, 208,742 bytes (+7.2 kB): `accountCore`, `syncMeta`, `firebase.ts`, `store/auth` and the header and Settings account parts. The actions (`account.ts`) and the error copy (`authErrors.ts`) are in the lazy `Account` chunk (9.2 kB gzip) and a small shared chunk (1.3 kB gzip); `sync` (6.6 kB gzip) and `firebase-sdk` (200 kB gzip) load only through `import()`.

Measured in the Fix phase (Vite 8, firebase 13.4.0, with App Check): before phase 2 the entry chunk grew by 572 bytes (187 bytes gzip) over the last commit, for `guardedStorage`; a probe build with `e2e-accounts/harness.html` as a second entry emits `firebase-sdk-<hash>.js` at 668 kB (200 kB gzip), `sync-<hash>.js` at 17 kB (6.6 kB gzip) and the account screen and API at 46 kB (14.5 kB gzip), with no SDK code in the main entry. Measured earlier, in the core phase: the configured build emits one SDK chunk, `assets/firebase-sdk-<hash>.js`, 653 kB (195 kB gzip), and a `sync-<hash>.js` chunk of 16 kB (6.1 kB gzip) holding `sync.ts` and `merge.ts`; both load only through `import()`. The unconfigured build has no SDK chunk at all (the `import()` sits behind the `CONFIGURED` constant and is removed); it still emits the small sync chunk, which is never requested. (That estimate for phase 2 missed that the account screen shares these modules with the entry: a static import from `main.tsx` put all of `lib/account` and `lib/authErrors` into the first load, +8.9 kB gzip, until the split into `accountCore` and the env checks above.)

---

## 9. Phase 2 wiring (files owned by the phone-layout workflow)

Everything below is in files this workflow did not touch. The account side is finished and tested; these are the only changes left.

1. `src/lib/router.ts`: add `| { name: 'account' }` to `Route` and `case 'account': return { name: 'account' };` in `parse`. Done in phase 2 together with item 2, because `App.tsx`'s `switch` and `titleFor` must handle the new name in the same change.
2. `src/App.tsx`: `const Account = lazy(() => import.meta.env.VITE_FIREBASE_PROJECT_ID ? import('./screens/Account').then((m) => ({ default: m.Account })) : import('./screens/AccountOff').then((m) => ({ default: m.AccountOff })))` (8.2); `case 'account': screen = <Suspense fallback={null}><Account /></Suspense>`; `titleFor` returns `t('Your account')`. Not immersive.
3. `src/main.tsx`: `import { bootAccounts } from './lib/accountCore'` and `if (import.meta.env.VITE_FIREBASE_PROJECT_ID) bootAccounts();` before `createRoot(...)` (8.2). Required, not optional: it is what makes every tab follow the others (5.6.8) and what ends a shared computer's session before the first render (5.6.9). Without it the stale-tab guard stays off and a closed shared session shows the last student until the account screen is opened. It costs a guest no network call.
4. `src/components/Shell.tsx` header: `<AccountEntry />` (from `src/components/account/AccountEntry.tsx`, through `HeaderAccount`, 8.2) just before the Settings `icon-btn`. It renders: `unconfigured` -> nothing; `guest` -> a quiet text link "Sign in" to `#/account` (`btn btn-quiet btn-sm` on desktop; hidden below 400px wide, where the Settings sheet row covers it); `loading` -> a 32px empty circle placeholder (no shimmer) so the header does not shift; `signed-in` -> `Initials` 32px linking to `#/account`, `aria-label="Your account, {name}"`, with a small `--bad` dot only when `sync === 'error'`. Touch target 44px on phones.
5. `src/components/SettingsSheet.tsx`, section "Your data" (the account part is `AccountDataSummary` in `src/components/account/AccountData.tsx`, 8.2):
   - `unconfigured`: unchanged ("Progress is saved on this device only. Nothing is sent anywhere.").
   - `guest`: "Progress is saved in this browser, on this device" and the link "Sign in to save it to an account" to `#/account` (closes the sheet).
   - `signed-in`: a row with `Initials`, the name and the email, the `SyncStatusLine`, and the link "Manage account" to `#/account` (closes the sheet).
   - Both links use the app's text-link pattern (Home's "Explore the full periodic table"): `text-sm font-medium text-ink`, a lucide `ArrowRight` at 16px and 1.5 stroke, 8px gap, 44px tall, text on the column's left edge. A quiet button there read as a second line of the caption.
   - "Reset progress…" opens a `ConfirmBlock` in its place, in every state: title "Erase your progress?", body "This erases your progress on every device signed in to this account" when signed in (the row above already shows which account), else "This erases your progress in this browser"; buttons "Cancel" (secondary, focused) and "Erase everything" (danger). It scrolls fully into view when it opens; closing it puts focus back on "Reset progress…". The store reset itself needs no change (section 4.6).
6. `src/screens/Home.tsx` `ForTeachers`: replace the "No accounts" point with title "Accounts are optional", body "Students can play without signing up, and progress stays in this browser. If they sign in with Google or an email, progress is saved to their account with Google Firebase and follows them to any device. On a shared computer, closing the browser or signing out clears it." The section sub "Free, private, and built around short practice" stays.
7. `.github/workflows/deploy.yml` (done): the public web config comes from either of two sources, and both work.
   - Repository variables `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`, `FIREBASE_APPCHECK_SITE_KEY`. A step before the build, "Firebase web config from repository variables", appends each **non-empty** one to `$GITHUB_ENV` as `VITE_FIREBASE_*`. Empty ones are not exported, because Vite gives the process environment priority over `.env` files and an empty string would blank out a value from `.env.production`.
   - A committed `.env.production` with the `VITE_FIREBASE_*` values (`.gitignore` only ignores `*.local`). A repository variable that is set wins over the file.

   The first command of "Type-check and build" refuses the build (`::error::Deploy builds must not use the emulators or a local env file`, exit 1) when `VITE_FIREBASE_EMULATORS` is set in the environment, when `.env.local` or `.env.production.local` exists, or when `.env` or `.env.production` sets `VITE_FIREBASE_EMULATORS`. Repository variables, not secrets: the web config ships in the bundle anyway, and access is enforced by the rules and App Check. Until either source is configured, the build is unconfigured and behaves as today. (`vite.config.ts` already refuses `VITE_FIREBASE_EMULATORS=1` with a non-demo project; the step makes the intent explicit.)
8. `.github/workflows/ci.yml` (done): a third job, `accounts`, with `actions/setup-node` (Node 22, npm cache, as the other jobs), `actions/setup-java` (temurin 21), `npm ci`, `npx playwright install --with-deps chromium`, `npm run test:accounts` (rules, sync and the browser flows, in one emulator session).
9. Optional: once `#/account` exists, `e2e-accounts/accounts.spec.ts` can open `#/account` instead of `e2e-accounts/harness.html` (one constant, `HARNESS`). The harness also exposes the API the specs drive, so keeping it is fine. The temporary preview entry (`account-preview.html`, `src/account-preview.tsx`) is already deleted.

---

## 10. Owner steps in the Firebase console

1. console.firebase.google.com: Add project, name "Periodica". Google Analytics is not needed. The free Spark plan is enough to start (but see step 15).
2. Project overview, Add app, Web (`</>`), nickname "Periodica web". No Firebase Hosting. Copy the six config values.
3. Give the deploy build the config, in either of two ways (both work; the web config is public, it ships in the bundle):
   - **Repository variables**: GitHub repository, Settings, Secrets and variables, Actions, Variables tab: add `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID` (and `FIREBASE_APPCHECK_SITE_KEY` after step 13). Variables, not secrets.
   - **Or send the config to be committed** as `.env.production` at the repository root:
     ```
     VITE_FIREBASE_API_KEY=...
     VITE_FIREBASE_AUTH_DOMAIN=<project-id>.firebaseapp.com
     VITE_FIREBASE_PROJECT_ID=<project-id>
     VITE_FIREBASE_STORAGE_BUCKET=...
     VITE_FIREBASE_MESSAGING_SENDER_ID=...
     VITE_FIREBASE_APP_ID=...
     VITE_FIREBASE_APPCHECK_SITE_KEY=...   (after step 13)
     ```

   If both are present, a repository variable that is set wins over the file. The next push to `main` deploys with accounts. For local work, put the same values in `.env.local` with the `VITE_` prefix (never committed). Never set `VITE_FIREBASE_EMULATORS` in any of these: the deploy refuses to build.
4. Build, Authentication, Get started, Sign-in method:
   - Email/Password: enable (leave "Email link" off).
   - Google: enable, set the public-facing name "Periodica" and a support email.
5. Authentication, Settings, Authorized domains: add `aarushagrawal267-maker.github.io` (`localhost` is there already).
6. Authentication, Settings, User actions: keep "Email enumeration protection" on (the copy above assumes it).
7. Authentication, Templates: Password reset and Email address verification, sender name "Periodica".
8. Build, Firestore Database, Create database: **production mode**, location near the students (for example `eur3` or `nam5`; it cannot be changed later).
9. Deploy the rules from the repository root (needs Node; `firebase.json` points at `firestore.rules`):
   ```
   npx -y firebase-tools@15.37.0 login
   npx -y firebase-tools@15.37.0 deploy --only firestore:rules --project <project-id>
   ```
   Run it again whenever `firestore.rules` changes. (Or paste `firestore.rules` into Firestore, Rules, and Publish.)
10. Hardening: Google Cloud console, APIs and Services, Credentials, the browser API key: restrict HTTP referrers to `https://aarushagrawal267-maker.github.io/*`, `https://<project-id>.firebaseapp.com/*` and `http://localhost:*/*`.
11. Before inviting students: write a short privacy note (what is stored, by whom, how to delete), and check the rules for the students' ages where they live (for example parental consent rules for under-13s in the US).
12. Free-tier headroom: each flush is one read and one write, debounced to at most one every 2 seconds, roughly 20 per active student per day, plus one read per change on each other listening device. The Spark limits (50 000 reads and 20 000 writes a day) cover several hundred daily students, as long as nobody abuses them (steps 13 to 15).
13. App Check (stops scripts that are not the web app): Build, App Check, Apps, register the web app with **reCAPTCHA Enterprise** (let the console create the key, with the domain `aarushagrawal267-maker.github.io`). Put the site key in the repository variable `FIREBASE_APPCHECK_SITE_KEY` (or send it for `.env.production` as `VITE_FIREBASE_APPCHECK_SITE_KEY`) and redeploy. Watch the App Check metrics for a few days; when nearly all requests are verified, press **Enforce** for Cloud Firestore and for Authentication. Local development uses the emulators, which do not check App Check.
14. Authentication, Settings, Sign-up quota: lower it from the default to what a class needs (for example 50 sign-ups an hour from one IP address), so a script cannot create accounts in bulk.
15. Budget: Google Cloud console, Billing, Budgets and alerts: a budget with email alerts. Before a school-wide rollout, move to the Blaze plan with that budget, so a spike slows nobody down at 20 000 writes; on Spark, a quota spent by one abuser pauses saving for every student ("Saving is paused for now") until the daily reset.

---

## 11. Known limitations

- Mastery `c` and `w` (right and wrong counts per element) follow the winning entry, so if two devices practise the same element while both offline, one device's counts for that element are dropped. Nothing displays them today. If they are ever shown, move them into the slots like the other counters.
- A daily played on two devices on the same day keeps the better result. A determined student could use a second device to practise first. `started` is not synced on purpose (section 4.2).
- Two tabs of the same browser share `localStorage` and follow each other (5.6.8); a round finished in two tabs within the same few milliseconds can still lose one, as for guests today. A write refused by the stale-tab guard (a tab that missed a change of hands) is dropped in that tab, which then shows the current copy.
- A reset in Settings discards offline progress made in the old epoch on other devices.
- The slot map grows by one small entry per browser and per merged guest session; at the 500 cap, writes fail with the "Could not save" message. A real student would need years of daily sign-ins on new school computers to get near it; if it ever happens, add a server-side compaction.
- Rules do not stop a student editing their own numbers. Nothing depends on that today.
- Rules cannot check each entry of a map, so a signed-in user can fill their own document with up to about 1 MiB of junk, and the one-save-a-second rule still allows 86 400 writes a day per account. Quota abuse is stopped by App Check, the sign-up quota and a budget (section 10), not by the rules.
- Email addresses are not verified before use (5.6.10). Someone who knows a classmate's address can register it first: the real owner is then told the address already has an account and must reset the password (which only they can, through their inbox). If the address is a Google account, signing in with Google later takes the account over (Firebase drops the unverified password), but the document keeps whatever the first person stored and their chosen name. Gating writes on `email_verified` (6.1) prevents that at the cost of sync waiting for the email.
- A shared computer's session ends when the browser closes, which some browsers skip when they restore the last session ("Continue where you left off" keeps session cookies). The 30-minute inactivity limit still applies there. A student who unticks "Shared computer" on a shared machine relies on signing out.
- When a session ends while the device holds unsaved progress (closed offline, then the session was revoked or the account deleted), that progress stays on the device as a leftover, without a name, until someone signs in to that account or clears it. On a shared computer it is visible to the next person as numbers only.
- Deleting an account removes the document, then the login. If the login delete takes longer than `DELETE_GRACE_MS` (5 s) after the document is gone, another online device can still take the gap for a hand edit and rebuild the document (5.6.3). A fully safe delete needs the login gone first, which needs server code (an Admin SDK function, not on the free plan) or a tombstone the rules understand.
