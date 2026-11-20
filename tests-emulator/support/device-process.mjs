/**
 * One simulated device for the account sync tests (docs/ACCOUNTS.md 6.5.1). Runs as a child process of a
 * test, so every device has what a real browser has to itself: its own module graph (so the sync and
 * account singletons, the zustand stores and the Firebase app are separate), its own localStorage, its
 * own network switch and its own clock. The test drives it over IPC: it sends a function's source, the
 * device runs it with the context below and sends back the result.
 *
 * The app modules are loaded through Vite's SSR loader in mode `emulators`, so `import.meta.env` comes
 * from `.env.emulators` exactly as in `npm run dev:accounts`. Plain JavaScript on purpose: Node runs it
 * without a build step.
 */
import { createServer } from 'vite';

const root = new URL('../../', import.meta.url).pathname;

// ---------- what a browser would give this device ----------

// A device can start from another one's saved state (a browser reopened after its tab was closed):
// PERIODICA_DEVICE_SEED = { storage: {key: value}, databases: [IndexedDB names] }.
const seed = process.env.PERIODICA_DEVICE_SEED ? JSON.parse(process.env.PERIODICA_DEVICE_SEED) : {};
const mem = new Map(Object.entries(seed.storage ?? {}));
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: (k) => void mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null,
  clear: () => mem.clear(),
  get length() {
    return mem.size;
  },
};

let online = true;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    userAgent: 'periodica-test-device',
    language: 'en',
    get onLine() {
      return online;
    },
  },
});

// A minimal window and document: zustand's persist reads window.localStorage, and sync listens for
// online, offline, pagehide, storage and visibilitychange on them. Events are fired like a browser does.
const windowEvents = new EventTarget();
for (const k of ['addEventListener', 'removeEventListener', 'dispatchEvent']) globalThis[k] = windowEvents[k].bind(windowEvents);
globalThis.window = globalThis;
const documentEvents = new EventTarget();
globalThis.document = Object.assign(documentEvents, { visibilityState: 'visible' });

// Session cookies, as far as the app uses them: name=value pairs that live as long as this process (the
// browser session). `Max-Age=0` removes one. A reopened device (a new process) starts with none.
const cookies = new Map();
Object.defineProperty(globalThis.document, 'cookie', {
  configurable: true,
  get: () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
  set: (str) => {
    const [pair, ...attrs] = String(str).split(';');
    const i = pair.indexOf('=');
    const name = pair.slice(0, i).trim();
    if (attrs.some((a) => /^\s*max-age=0\s*$/i.test(a))) cookies.delete(name);
    else cookies.set(name, pair.slice(i + 1).trim());
  },
});

// IndexedDB exists only as a list of database names, so a test can see which ones the app deletes. It
// cannot be opened, so Firebase falls back to memory (as in a private window). Only with a seed.
const databases = new Set(seed.databases ?? []);
if (seed.databases) {
  globalThis.indexedDB = {
    databases: async () => [...databases].map((name) => ({ name, version: 1 })),
    deleteDatabase: (name) => {
      const req = {};
      setTimeout(() => {
        databases.delete(name);
        req.onsuccess?.({});
      }, 0);
      return req;
    },
    open: () => {
      throw new Error('IndexedDB is not available on this test device');
    },
  };
}

// Auth talks to its emulator with fetch: offline, it fails the way a browser's fetch does.
// A slow network can be simulated per URL: requests whose URL contains a pattern wait first.
const realFetch = globalThis.fetch;
const delays = new Map();
globalThis.fetch = async (...args) => {
  if (!online) throw new TypeError('Failed to fetch');
  const url = String(args[0] instanceof Request ? args[0].url : args[0]);
  for (const [part, ms] of delays) if (url.includes(part)) await new Promise((r) => setTimeout(r, ms));
  if (!online) throw new TypeError('Failed to fetch');
  return realFetch(...args);
};

// A clock this device can move forward (the recent sign-in check reads Date.now()).
const realNow = Date.now.bind(Date);
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;

// ---------- the app, in this device's own module graph ----------

const server = await createServer({
  configFile: false,
  root,
  envDir: root,
  mode: 'emulators',
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  // Node has no popup or IndexedDB: the browser build of auth falls back to in-memory persistence,
  // which is what a private window gives.
  resolve: { alias: [{ find: /^firebase\/auth$/, replacement: root + 'node_modules/@firebase/auth/dist/esm/index.js' }] },
});

const load = (p) => server.ssrLoadModule(p);
const [progressMod, settingsMod, authMod, account, sync, firebase, merge, syncMeta, firestore] = await Promise.all([
  load('/src/store/progress.ts'),
  load('/src/store/settings.ts'),
  load('/src/store/auth.ts'),
  load('/src/lib/account.ts'),
  load('/src/lib/sync.ts'),
  load('/src/lib/firebase.ts'),
  load('/src/lib/merge.ts'),
  load('/src/lib/syncMeta.ts'),
  // The same module instance firebase-sdk.ts uses (both resolve to the externalised package).
  load('firebase/firestore'),
]);

// Tests only ever talk to the local emulators with the demo project, whatever env files exist.
if (firebase.firebaseConfig?.projectId !== 'demo-periodica' || !firebase.usesEmulators()) {
  throw new Error(`Refusing to run: the device would use project ${firebase.firebaseConfig?.projectId} without the emulators`);
}

/** Goes offline or back online: navigator.onLine, fetch, and Firestore's own network. */
async function setOnline(next) {
  online = next;
  const fb = firebase.loadedFirebase();
  if (fb) await (next ? firestore.enableNetwork(fb.db) : firestore.disableNetwork(fb.db));
  window.dispatchEvent(new Event(next ? 'online' : 'offline'));
}

const ctx = {
  useProgress: progressMod.useProgress,
  EMPTY_PROGRESS: progressMod.EMPTY_PROGRESS,
  useSettings: settingsMod.useSettings,
  defaultSettings: settingsMod.defaultSettings,
  useAuth: authMod.useAuth,
  account,
  sync,
  firebase,
  merge,
  syncMeta,
  storage: globalThis.localStorage,
  net: {
    offline: () => setOnline(false),
    online: () => setOnline(true),
    isOnline: () => online,
    /** Requests whose URL contains `urlPart` take `ms` longer (0 removes the delay). */
    slow: (urlPart, ms) => {
      if (ms > 0) delays.set(urlPart, ms);
      else delays.delete(urlPart);
    },
  },
  clock: {
    advance: (ms) => {
      clockOffset += ms;
    },
  },
  browser: {
    /** IndexedDB database names still present (seeded devices only). */
    databases: () => [...databases],
    cookies: () => document.cookie,
    /** Fires a window event the way a browser would (online, pageshow, ...). */
    fire: (type) => window.dispatchEvent(new Event(type)),
  },
};

// ---------- IPC ----------

process.on('message', async (msg) => {
  if (!msg || typeof msg.id !== 'number') return;
  try {
    const fn = (0, eval)(`(${msg.src})`);
    const value = await fn(ctx, msg.arg);
    process.send({ id: msg.id, ok: true, value });
  } catch (e) {
    process.send({ id: msg.id, ok: false, error: e instanceof Error ? (e.stack ?? e.message) : String(e) });
  }
});

process.on('disconnect', () => process.exit(0));
process.on('unhandledRejection', (e) => {
  console.error('[device] unhandled rejection:', e instanceof Error ? (e.stack ?? e.message) : e);
});

process.send({ ready: true });
