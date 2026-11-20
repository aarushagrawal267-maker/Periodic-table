/**
 * Talks to the emulators directly, as an administrator (`Authorization: Bearer owner` bypasses the
 * security rules), to look at what the app wrote without going through the app.
 */
export const PROJECT = 'demo-periodica';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const ADMIN = { Authorization: 'Bearer owner' };

type RestValue = Record<string, unknown>;

/** Firestore REST value to plain JavaScript (integers as numbers, timestamps as ISO strings). */
export function decode(v: RestValue): unknown {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue as { values?: RestValue[] }).values ?? []).map(decode);
  if ('mapValue' in v) return decodeFields((v.mapValue as { fields?: Record<string, RestValue> }).fields ?? {});
  throw new Error(`Unknown Firestore value ${JSON.stringify(v)}`);
}

function decodeFields(fields: Record<string, RestValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));
}

export interface StoredSlot {
  xp: number;
  rounds: number;
  placements: number;
  mistakes: number;
  quizzes: number;
  playMs: number;
  day: string;
  dayXp: number;
}

export interface StoredDoc {
  schemaVersion: number;
  profile?: { name: string };
  progress: {
    epoch: number;
    slots: Record<string, StoredSlot>;
    mastery: Record<string, { s: number; c: number; w: number; t: number }>;
    best: Record<string, { score: number; stars: number; timeMs: number }>;
    bestCombo: number;
    daily: { results: Record<string, unknown>; streak: number; bestStreak: number; lastKey: string | null };
    achievements: Record<string, number>;
    explored: number[];
    chapters: Record<string, number>;
  };
  settings: { values: Record<string, unknown>; at: Record<string, number> };
  clientId: string;
  createdAt: string;
  updatedAt: string;
  /** The server's write time for the whole document (changes on every write, even a same-value one). */
  updateTime: string;
}

/** users/{uid} as stored, or null when there is no document. */
export async function readUserDoc(uid: string): Promise<StoredDoc | null> {
  const res = await fetch(`${DOCS}/users/${uid}`, { headers: ADMIN });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`read users/${uid}: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { fields: Record<string, RestValue>; updateTime: string };
  return { ...(decodeFields(body.fields) as Omit<StoredDoc, 'updateTime'>), updateTime: body.updateTime };
}

/** Sum of one counter over every slot: what every device should show as its total. */
export function total(doc: StoredDoc | null, field: keyof Omit<StoredSlot, 'day'> = 'xp'): number {
  if (!doc) return 0;
  return Object.values(doc.progress.slots).reduce((s, slot) => s + Number(slot[field] ?? 0), 0);
}

/** Writes fields of users/{uid} as an administrator (a newer app version, or a hand edit). */
export async function patchUserDoc(uid: string, fields: Record<string, RestValue>, mask: string[]): Promise<void> {
  const q = mask.map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join('&');
  const res = await fetch(`${DOCS}/users/${uid}?${q}`, {
    method: 'PATCH',
    headers: { ...ADMIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`patch users/${uid}: ${res.status} ${await res.text()}`);
}

/** Deletes users/{uid} as an administrator (a hand edit in the console). */
export async function deleteUserDoc(uid: string): Promise<void> {
  const res = await fetch(`${DOCS}/users/${uid}`, { method: 'DELETE', headers: ADMIN });
  if (!res.ok) throw new Error(`delete users/${uid}: ${res.status} ${await res.text()}`);
}

/** The auth user, or null when the emulator has no such account. */
export async function lookupAuthUser(uid: string): Promise<{ localId: string; email?: string; displayName?: string } | null> {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, {
    method: 'POST',
    headers: { ...ADMIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: [uid] }),
  });
  if (!res.ok) throw new Error(`lookup ${uid}: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { users?: { localId: string; email?: string; displayName?: string }[] };
  return body.users?.[0] ?? null;
}

/** Deletes the auth user as an administrator: "deleted on another device" without that device. */
export async function deleteAuthUser(uid: string): Promise<void> {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`, {
    method: 'POST',
    headers: { ...ADMIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uid }),
  });
  if (!res.ok) throw new Error(`delete ${uid}: ${res.status} ${await res.text()}`);
}

/** Links in the emails the auth emulator would have sent to `email` (VERIFY_EMAIL, PASSWORD_RESET). */
export async function oobLinks(email: string, type: 'VERIFY_EMAIL' | 'PASSWORD_RESET'): Promise<string[]> {
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  if (!res.ok) throw new Error(`oobCodes: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { oobCodes?: { email: string; requestType: string; oobLink: string }[] };
  return (body.oobCodes ?? []).filter((c) => c.email === email && c.requestType === type).map((c) => c.oobLink);
}

/** Fails fast with a clear message when the emulators are not running. */
export async function assertEmulatorsUp(): Promise<void> {
  const check = async (url: string, name: string) => {
    try {
      await fetch(url);
    } catch {
      throw new Error(`The ${name} emulator is not reachable at ${url}. Run these tests with \`npm run test:accounts\`.`);
    }
  };
  await check(`${AUTH}/`, 'auth');
  await check(`${FIRESTORE}/`, 'Firestore');
}

let counter = 0;
/** An email no other test uses, so tests never share an account and can run in any order. */
export function uniqueEmail(label: string): string {
  return `${label}-${Date.now().toString(36)}-${(++counter).toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;
}

/** Polls `fn` (on the test side) until it returns a truthy value. A condition, not a fixed sleep. */
export async function waitFor<T>(what: string, fn: () => Promise<T> | T, timeoutMs = 20_000): Promise<NonNullable<T>> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v as NonNullable<T>;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out after ${timeoutMs} ms waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}
