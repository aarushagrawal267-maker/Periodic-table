/**
 * The `periodica-sync` record in localStorage (docs/ACCOUNTS.md 2.7): this browser's replica id,
 * whose data the local stores hold, and the other replicas' slots already counted in them.
 * Always read from storage (no in-memory cache), so two tabs see the same record. Never throws;
 * with storage unavailable, accounts work for the session only.
 */
import type { StateStorage } from 'zustand/middleware';
import type { Slot } from './merge';
import type { SettingKey } from '../store/settings';

export const META_KEY = 'periodica-sync';

export interface SyncMeta {
  v: 1;
  /** Stable per browser, survives sign out. Not personal data. */
  deviceId: string;
  /** uid whose data the local stores hold; null means guest data. */
  owner: string | null;
  /** Display cache so a signed-in device starts with its avatar, even offline. Cleared on sign out. */
  user: { name: string; email: string | null; provider: 'google' | 'password'; verified: boolean } | null;
  /** Slots of other replicas, exactly as already counted in the local totals (section 5.3). */
  others: Record<string, Slot>;
  /** Reset generation the local stores belong to (section 4.6). */
  epoch: number;
  /** When each setting was last changed on this device (ms). Missing means never: the account value wins. */
  settingsAt: Partial<Record<SettingKey, number>>;
  /** The account document has existed while this device owned it. Tells a deletion from a new account. */
  docSeen: boolean;
  /** A guest merge that has started but not committed. guestId is fixed before the transaction. */
  pendingAdoption: { uid: string; guestId: string } | null;
  redirect: 'pending' | 'broken' | null;
  /**
   * The local stores hold something the account does not have yet (section 5.3.1). Set with the first
   * unsaved change, cleared once a save commits. Survives a reload, so a device whose session ends knows
   * whether its local copy can be dropped (it is all in the account) or must be kept.
   */
  unsaved: boolean;
  /**
   * Ownership generation (section 5.6.8). Changes whenever the device changes hands: sign out, delete,
   * a reset to guest, and a sign-in that takes ownership. A tab whose stores were loaded under an older
   * generation may not write them (see `guardedStorage`).
   */
  gen: string;
  /** Signed in as a shared computer (section 5.6.9): the session ends with the browser or after inactivity. */
  shared: boolean;
  /** Last activity on a shared computer (ms). */
  activeAt: number;
}

/** A random replica id. crypto.randomUUID needs a secure context, so plain http on a LAN falls back. */
export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Used only when localStorage is unavailable. */
let memory: SyncMeta | null = null;

/** The generation of a device that has never changed hands (also what an older meta without `gen` means). */
const FIRST_GEN = '0';

function defaults(deviceId: string): SyncMeta {
  return {
    v: 1,
    deviceId,
    owner: null,
    user: null,
    others: {},
    epoch: 0,
    settingsAt: {},
    docSeen: false,
    pendingAdoption: null,
    redirect: null,
    unsaved: false,
    gen: FIRST_GEN,
    shared: false,
    activeAt: 0,
  };
}

function clean(raw: unknown): SyncMeta | null {
  if (!isObj(raw) || typeof raw.deviceId !== 'string' || raw.deviceId.length < 8) return null;
  const m = defaults(raw.deviceId);
  if (typeof raw.owner === 'string' && raw.owner) m.owner = raw.owner;
  if (isObj(raw.user) && typeof raw.user.name === 'string') {
    m.user = {
      name: raw.user.name,
      email: typeof raw.user.email === 'string' ? raw.user.email : null,
      provider: raw.user.provider === 'google' ? 'google' : 'password',
      verified: raw.user.verified !== false,
    };
  }
  if (isObj(raw.others)) m.others = raw.others as Record<string, Slot>;
  if (typeof raw.epoch === 'number' && Number.isInteger(raw.epoch) && raw.epoch >= 0) m.epoch = raw.epoch;
  if (isObj(raw.settingsAt)) m.settingsAt = raw.settingsAt as SyncMeta['settingsAt'];
  m.docSeen = raw.docSeen === true;
  const pa = raw.pendingAdoption;
  if (isObj(pa) && typeof pa.uid === 'string' && typeof pa.guestId === 'string') m.pendingAdoption = { uid: pa.uid, guestId: pa.guestId };
  if (raw.redirect === 'pending' || raw.redirect === 'broken') m.redirect = raw.redirect;
  m.unsaved = raw.unsaved === true;
  if (typeof raw.gen === 'string' && raw.gen) m.gen = raw.gen;
  m.shared = raw.shared === true;
  if (typeof raw.activeAt === 'number' && Number.isFinite(raw.activeAt)) m.activeAt = raw.activeAt;
  return m;
}

function store(m: SyncMeta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
    memory = null;
  } catch {
    memory = m;
  }
}

export function readMeta(): SyncMeta {
  let m: SyncMeta | null = null;
  try {
    const raw = localStorage.getItem(META_KEY);
    m = raw ? clean(JSON.parse(raw)) : null;
  } catch {
    m = memory;
  }
  if (!m) {
    m = memory ?? defaults(newId());
    store(m);
  }
  return m;
}

export function writeMeta(patch: Partial<SyncMeta>): SyncMeta {
  const m = { ...readMeta(), ...patch, v: 1 as const };
  store(m);
  return m;
}

/**
 * Keeps deviceId and redirect, resets everything else: the device holds guest data again. Starts a new
 * ownership generation, which this tab takes at once (its stores were just reset by the caller).
 */
export function clearOwnership(): SyncMeta {
  const cur = readMeta();
  const m = { ...defaults(cur.deviceId), redirect: cur.redirect, gen: newId() };
  store(m);
  tabGen = m.gen;
  return m;
}

/** Starts a new ownership generation for a sign-in that takes this device's stores (section 5.6.8). */
export function bumpGen(patch: Partial<SyncMeta> = {}): SyncMeta {
  const m = writeMeta({ ...patch, gen: newId() });
  tabGen = m.gen;
  return m;
}

// ---------- stale tabs (section 5.6.8) ----------

/** The generation in storage, read without creating the record. */
function storedGen(): string {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return memory?.gen ?? FIRST_GEN;
    const g = (JSON.parse(raw) as { gen?: unknown }).gen;
    return typeof g === 'string' && g ? g : FIRST_GEN;
  } catch {
    return memory?.gen ?? FIRST_GEN;
  }
}

/** The generation this tab's stores were loaded under. Read once at start, before the stores hydrate. */
let tabGen: string = storedGen();
let onStale: (() => void) | null = null;

/**
 * True when another tab changed hands since this tab last loaded its stores. Never without accounts.
 * Reads the env directly rather than ./firebase, so the stores do not pull that module into a build without accounts.
 */
export function tabIsStale(): boolean {
  return !!import.meta.env.VITE_FIREBASE_PROJECT_ID && storedGen() !== tabGen;
}

/** This tab has (re)loaded its stores from storage: it is current again. */
export function markTabCurrent(): void {
  tabGen = storedGen();
}

/** The account layer registers how a stale tab reloads its stores. Until then nothing is refused. */
export function setStaleHandler(fn: (() => void) | null): void {
  onStale = fn;
}

/**
 * localStorage for the persisted stores, with one guard: a stale tab (one that has not seen a sign out,
 * delete or sign-in made in another tab) never writes its old copy over the new one. It reloads instead.
 * Without accounts (or before the account layer has started) it is plain localStorage.
 */
export const guardedStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    if (onStale && tabIsStale()) {
      const reload = onStale;
      // After the store's own set() has returned, so the reload is not undone by the rest of that update.
      queueMicrotask(reload);
      return;
    }
    try {
      localStorage.setItem(name, value);
    } catch {
      // Storage full or blocked: the session keeps its state in memory, as before.
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // As above.
    }
  },
};

// ---------- shared computers (section 5.6.9) ----------

/** A shared computer's session ends after this long without use, even with the browser left open. */
export const SHARED_IDLE_MS = 30 * 60_000;
const SESSION_COOKIE = 'periodica-session';

function cookiePath(): string {
  try {
    return new URL('.', location.href).pathname;
  } catch {
    return '/';
  }
}

/** Session cookies work here (a test runtime or a locked-down browser may have none). */
function cookiesWork(): boolean {
  return typeof document !== 'undefined' && typeof document.cookie === 'string' && (typeof navigator === 'undefined' || navigator.cookieEnabled !== false);
}

/**
 * Marks this browser session. A cookie with no expiry is shared by every tab and dropped when the browser
 * closes, which is exactly a shared computer's session (Firebase's own session persistence is per tab).
 */
export function setSessionCookie(): void {
  if (!cookiesWork()) return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${SESSION_COOKIE}=1; path=${cookiePath()}; SameSite=Lax${secure}`;
}

export function clearSessionCookie(): void {
  if (!cookiesWork()) return;
  document.cookie = `${SESSION_COOKIE}=; path=${cookiePath()}; Max-Age=0; SameSite=Lax`;
}

function hasSessionCookie(): boolean {
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${SESSION_COOKIE}=1`));
}

/** A shared computer's session is over: the browser was closed since sign-in, or it sat unused too long. */
export function sharedSessionOver(m: SyncMeta, now = Date.now()): boolean {
  if (!m.owner || !m.shared) return false;
  if (cookiesWork() && !hasSessionCookie()) return true;
  return now - m.activeAt > SHARED_IDLE_MS;
}
