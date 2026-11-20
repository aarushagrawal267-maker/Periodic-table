/**
 * A stand-in for src/lib/firebase.ts in unit tests of the sync layer: one account document, its snapshot
 * listeners, and transactions that can be made to fail on demand. Snapshots are only sent when a test
 * calls `emit`, so a test controls exactly what the listener has seen (unlike the emulator suites).
 */
type Listener = { next: (s: unknown) => void; err: (e: unknown) => void };

export const fake: {
  doc: Record<string, unknown> | null;
  writes: Record<string, unknown>[];
  /** Error codes the next transactions throw, in order. */
  failNext: string[];
  listeners: Listener[];
} = { doc: null, writes: [], failNext: [], listeners: [] };

export function resetFake() {
  fake.doc = null;
  fake.writes = [];
  fake.failNext = [];
  fake.listeners = [];
}

const snap = (data: Record<string, unknown> | null, fromCache: boolean) => ({
  exists: () => data !== null,
  data: () => (data ? (JSON.parse(JSON.stringify(data)) as Record<string, unknown>) : undefined),
  metadata: { fromCache, hasPendingWrites: false },
});

/** Sends the document as it is now to every listener, as the server (or the cache) would. */
export function emit(fromCache = false) {
  for (const l of [...fake.listeners]) l.next(snap(fake.doc, fromCache));
}

const sdk = {
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  onSnapshot: (_ref: unknown, _opts: unknown, next: (s: unknown) => void, err: (e: unknown) => void) => {
    const l = { next, err };
    fake.listeners.push(l);
    return () => {
      fake.listeners = fake.listeners.filter((x) => x !== l);
    };
  },
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const code = fake.failNext.shift();
    if (code) throw Object.assign(new Error(code), { code });
    let pending: Record<string, unknown> | null = null;
    const tx = {
      get: async () => snap(fake.doc, false),
      set: (_ref: unknown, data: Record<string, unknown>) => {
        pending = data;
      },
    };
    const r = await fn(tx);
    if (pending) {
      fake.doc = JSON.parse(JSON.stringify({ ...(pending as object), createdAt: 'T', updatedAt: 'T' })) as Record<string, unknown>;
      fake.writes.push(fake.doc);
    }
    return r;
  },
  serverTimestamp: () => 'TS',
  deleteDoc: async () => {
    fake.doc = null;
  },
  signOut: async () => undefined,
};

export const fb = { sdk, app: {}, auth: { currentUser: null }, db: {} };

/** The module shape src/lib/firebase.ts exports, configured, with the SDK replaced by the fake. */
export const fakeFirebaseModule = {
  CONFIGURED: true,
  isConfigured: () => true,
  usesEmulators: () => false,
  emulatorsAllowed: () => false,
  firebaseConfig: { projectId: 'demo-unit' },
  loadFirebase: async () => fb,
  loadedFirebase: () => fb,
  wipeLocalFirestore: async () => undefined,
  wipeLocalFirebaseStorage: async () => undefined,
};
