/**
 * Account flows that need a real browser (docs/ACCOUNTS.md 6.6): tabs of one browser sharing localStorage and
 * Firebase's session, a browser closed and reopened, and the Firestore cache in IndexedDB. The emulators must
 * be running (`npm run test:accounts:e2e` starts them). The document is read as an administrator.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type * as AccountApi from '../src/lib/account';
import type * as SyncMetaApi from '../src/lib/syncMeta';
import type { useAuth } from '../src/store/auth';
import type { RoundSummary, useProgress } from '../src/store/progress';
import { readUserDoc, total, uniqueEmail } from '../tests-emulator/support/emulator';

type Api = { account: typeof AccountApi; syncMeta: typeof SyncMetaApi; useAuth: typeof useAuth; useProgress: typeof useProgress };
declare global {
  interface Window {
    __periodica: Api;
  }
}

const PASSWORD = 'correct horse';
/**
 * The flows below drive the account API and read the stores through window.__periodica, which only the harness
 * exposes, so they keep opening it. The app itself (header, Settings, #/account) is tested through its UI below.
 */
const HARNESS = 'e2e-accounts/harness.html';

const round = (n: number): RoundSummary => ({
  kind: 'quiz',
  difficulty: 'standard',
  score: 800,
  correct: 1,
  mistakes: 0,
  hints: 0,
  timeMs: 40_000,
  maxCombo: 2,
  stars: 2,
  completed: true,
  results: { [n]: true },
  trail: ['hit'],
});

/** A tab of the app with accounts booted, as phase 2 runs it. */
async function openTab(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(HARNESS);
  await page.waitForFunction(() => !!window.__periodica);
  return page;
}

const state = (p: Page) =>
  p.evaluate(() => {
    const { useAuth, useProgress, syncMeta } = window.__periodica;
    const a = useAuth.getState();
    const progress = useProgress.getState();
    return { status: a.status, sync: a.sync, notice: a.notice, leftover: a.leftover, name: a.user?.name ?? null, xp: progress.xp, explored: progress.explored, meta: syncMeta.readMeta() };
  });

const play = (p: Page, n: number) => p.evaluate((r) => window.__periodica.useProgress.getState().recordRound(r).xpGained, round(n));
const explore = (p: Page, n: number) => p.evaluate((x) => void window.__periodica.useProgress.getState().markExplored(x), n);

async function settled(p: Page) {
  await p.waitForFunction(() => {
    const a = window.__periodica.useAuth.getState();
    return a.status === 'signed-in' && a.sync === 'saved';
  });
}

async function signUp(p: Page, name: string, email: string, shared = false) {
  const r = await p.evaluate(([n, e, pw, s]) => window.__periodica.account.signUpWithEmail(n, e, pw, { shared: s }), [name, email, PASSWORD, shared] as const);
  expect(r).toEqual({ ok: true });
  await settled(p);
  return (await p.evaluate(() => window.__periodica.useAuth.getState().user!.uid)) as string;
}

async function signIn(p: Page, email: string) {
  const r = await p.evaluate(([e, pw]) => window.__periodica.account.signInWithEmail(e, pw, { shared: false }), [email, PASSWORD] as const);
  expect(r).toEqual({ ok: true });
  await settled(p);
}

const contexts: BrowserContext[] = [];
async function browserContext(browser: Browser, opts: Parameters<Browser['newContext']>[0] = {}) {
  const c = await browser.newContext({ serviceWorkers: 'block', ...opts });
  contexts.push(c);
  return c;
}
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

test.describe('tabs of one browser (section 5.6.8)', () => {
  test("a tab opened before sign in never carries one student's progress into another account", async ({ browser }) => {
    const ctx = await browserContext(browser);
    const p = await openTab(ctx);
    // Student 1 plays as a guest, with a second tab of the app open.
    await explore(p, 79);
    const xp1 = await play(p, 79);
    const g = await openTab(ctx);
    expect((await state(g)).xp).toBe(xp1);

    // Student 1 creates an account in tab P (the guest progress moves into it), then signs out.
    const uid1 = await signUp(p, 'One', uniqueEmail('student1'));
    expect(await p.evaluate(() => window.__periodica.account.signOutAndReset())).toEqual({ ok: true });

    // Student 2 sits down at the other tab: it shows a fresh start, and opening a card writes nothing of student 1's.
    await expect.poll(async () => (await state(g)).xp).toBe(0);
    await explore(g, 8);
    expect((await state(g)).explored).toEqual([8]);

    // Student 2 creates their own account.
    await p.reload();
    await p.waitForFunction(() => !!window.__periodica);
    const uid2 = await signUp(p, 'Two', uniqueEmail('student2'));
    const doc2 = await readUserDoc(uid2);
    expect(total(doc2)).toBe(0);
    expect(doc2!.progress.explored).toEqual([8]);
    expect(Object.keys(doc2!.progress.mastery)).toEqual([]);
    expect(total(await readUserDoc(uid1))).toBe(xp1);
  });

  test('student 1 signing back in adds their guest progress once, not twice', async ({ browser }) => {
    const ctx = await browserContext(browser);
    const p = await openTab(ctx);
    const xp1 = await play(p, 79);
    const g = await openTab(ctx);
    const email = uniqueEmail('twice');
    const uid = await signUp(p, 'One', email);
    expect(await p.evaluate(() => window.__periodica.account.signOutAndReset())).toEqual({ ok: true });
    await expect.poll(async () => (await state(g)).xp).toBe(0);
    await explore(g, 8);
    await signIn(p, email);
    await expect.poll(async () => (await state(p)).xp).toBe(xp1);
    await settled(p);
    expect(total(await readUserDoc(uid))).toBe(xp1);
  });

  test('a guest tab left open cannot erase rounds played in the signed-in tab', async ({ browser }) => {
    // The account has progress from another device.
    const other = await browserContext(browser);
    const a = await openTab(other);
    const email = uniqueEmail('stale-tab');
    const uid = await signUp(a, 'Ada', email);
    const base = (await play(a, 1)) + (await play(a, 2));
    await settled(a);

    // On this computer the app is open as a guest in tab G; the student signs in in tab P.
    const ctx = await browserContext(browser);
    const g = await openTab(ctx);
    const p = await openTab(ctx);
    await signIn(p, email);
    await expect.poll(async () => (await state(p)).xp).toBe(base);
    // Tab G opens an element card.
    await explore(g, 8);
    await expect.poll(async () => (await state(p)).explored).toContain(8);
    expect((await state(p)).xp).toBe(base);

    // A round in tab P counts on top of the account.
    const gained = await play(p, 9);
    await expect.poll(async () => total(await readUserDoc(uid))).toBe(base + gained);
    await settled(p);
    expect((await state(p)).xp).toBe(base + gained);
    expect((await readUserDoc(uid))!.progress.explored).toContain(8);
  });
});

test.describe('a browser closed while its account changed', () => {
  test('deleted on another device: reopening leaves no progress, no name and no cached copy', async ({ browser }) => {
    const ctxA = await browserContext(browser);
    const a = await openTab(ctxA);
    const email = uniqueEmail('deleted-closed');
    const uid = await signUp(a, 'Quinn Deleteprobe', email);
    const xp = await play(a, 6);
    await settled(a);

    // A school laptop signs in, syncs, and its tab is closed. Browser storage stays.
    const ctxB = await browserContext(browser);
    let b = await openTab(ctxB);
    await signIn(b, email);
    await expect.poll(async () => (await state(b)).xp).toBe(xp);
    await settled(b);
    await b.close();

    expect(await a.evaluate(() => window.__periodica.account.deleteAccount())).toEqual({ ok: true });
    expect(await readUserDoc(uid)).toBeNull();

    // The laptop is opened again: Firebase finds the user gone and signs it out.
    b = await openTab(ctxB);
    await expect.poll(async () => {
      const s = await state(b);
      return s.status === 'guest' && s.xp === 0 && s.meta.owner === null;
    }).toBe(true);
    const s = await state(b);
    expect(s.leftover).toBe(false);
    expect(s.notice).toBe('session-ended');
    expect(JSON.parse((await b.evaluate(() => localStorage.getItem('periodica-progress')))!).state.xp).toBe(0);
    await expect
      .poll(() => b.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).filter((n) => n?.startsWith('firestore/'))))
      .toEqual([]);
    await expect(b.getByText('Quinn Deleteprobe')).toHaveCount(0);
  });
});

test.describe('shared computer (section 5.6.9)', () => {
  test('a browser restart after a shared sign-in starts as a fresh guest; the account keeps everything', async ({ browser }) => {
    const ctx = await browserContext(browser);
    const p = await openTab(ctx);
    const uid = await signUp(p, 'Val Sharedprobe', uniqueEmail('shared'), true);
    const xp = await play(p, 6);
    await settled(p);
    expect((await state(p)).meta.shared).toBe(true);

    // Close the browser: everything on disk stays (localStorage, IndexedDB with Firebase's session), session cookies go.
    const saved = await ctx.storageState({ indexedDB: true });
    const restarted = await browserContext(browser, { storageState: { ...saved, cookies: saved.cookies.filter((c) => c.expires !== -1) } });
    const r = await openTab(restarted);
    await expect.poll(async () => {
      const s = await state(r);
      return s.status === 'guest' && s.xp === 0 && s.meta.owner === null;
    }).toBe(true);
    expect((await state(r)).name).toBeNull();
    await expect(r.getByText('Val Sharedprobe')).toHaveCount(0);
    await expect(r.getByRole('heading', { name: 'Sign in to save your progress' })).toBeVisible();
    // Firebase's saved session is gone too: nothing signs this browser back in.
    await r.reload();
    await r.waitForFunction(() => !!window.__periodica);
    await r.waitForTimeout(1500);
    expect((await state(r)).status).toBe('guest');
    expect(total(await readUserDoc(uid))).toBe(xp);
  });
});

test.describe('the app with accounts set up', () => {
  test('the header and Settings follow the account: "Sign in" for a guest, the avatar and "Manage account" once signed in', async ({ browser }) => {
    const ctx = await browserContext(browser);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./#/');
    const banner = page.getByRole('banner');

    // A guest: a quiet "Sign in" link in the header, and the sign-in link in Settings.
    await expect(banner.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings.getByText('Progress is saved in this browser, on this device', { exact: true })).toBeVisible();
    await expect(settings.getByRole('link', { name: 'Sign in to save it to an account' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settings).toHaveCount(0);

    // Sign up through the account screen.
    await banner.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/#\/account$/);
    await expect(page).toHaveTitle('Your account · Periodica');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in to save your progress' })).toBeVisible();
    await page.getByRole('tab', { name: 'Create account' }).click();
    const email = uniqueEmail('header');
    await page.getByRole('textbox', { name: 'Name' }).fill('Hedy Headerprobe');
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Hedy Headerprobe' })).toBeVisible();

    // Signed in: the avatar replaces "Sign in".
    await expect(banner.getByRole('link', { name: 'Your account, Hedy Headerprobe' })).toBeVisible();
    await expect(banner.getByRole('link', { name: 'Sign in' })).toHaveCount(0);

    // Settings, opened from another screen: the signed-in row, the sync line, and "Manage account" back to #/account.
    await page.goto('./#/progress');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(settings.getByText('Hedy Headerprobe', { exact: true })).toBeVisible();
    await expect(settings.getByText(email, { exact: true })).toBeVisible();
    await expect(settings.getByRole('status').filter({ hasText: 'Saved to your account' })).toBeVisible();
    await expect(settings.getByRole('link', { name: 'Sign in to save it to an account' })).toHaveCount(0);

    // The reset confirmation says it reaches every device on the account, and opens fully in view with focus on Cancel.
    await settings.getByRole('button', { name: 'Reset progress…' }).click();
    const erase = settings.getByRole('group', { name: 'Erase your progress?' });
    await expect(erase).toContainText('This erases your progress on every device signed in to this account');
    await expect(erase.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expect(erase.getByRole('button', { name: 'Erase everything' })).toBeInViewport({ ratio: 1 });
    await erase.getByRole('button', { name: 'Cancel' }).click();
    await expect(erase).toHaveCount(0);
    await expect(settings.getByRole('button', { name: 'Reset progress…' })).toBeFocused();

    await settings.getByRole('link', { name: 'Manage account' }).click();
    await expect(page).toHaveURL(/#\/account$/);
    await expect(settings).toHaveCount(0);
    const heading = page.getByRole('heading', { level: 1, name: 'Hedy Headerprobe' });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    expect(errors).toEqual([]);
  });
});
