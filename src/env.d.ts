/// <reference types="vite/client" />

/** Firebase web config (docs/ACCOUNTS.md 6.3). All optional: without a project id, accounts are off. */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** '1' connects to the local emulators (auth 9099, firestore 8080). */
  readonly VITE_FIREBASE_EMULATORS?: string;
  /** reCAPTCHA Enterprise site key for Firebase App Check (docs/ACCOUNTS.md 10). Optional; ignored with the emulators. */
  readonly VITE_FIREBASE_APPCHECK_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
