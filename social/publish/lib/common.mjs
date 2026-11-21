// Shared plumbing for the social publishers: HTTP with retries, error types,
// CLI arg parsing, calendar + posted.json access, dry-run printing.
// Node 22, built-in fetch only. No npm dependencies.

import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLISH_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SOCIAL_DIR = resolve(PUBLISH_DIR, '..');
export const REPO_ROOT = resolve(SOCIAL_DIR, '..');

export function defaultPaths(root = REPO_ROOT) {
  const social = join(root, 'social');
  return {
    root,
    calendar: join(social, 'calendar.json'),
    posted: join(social, 'posted.json'),
    outDir: join(social, 'out'),
    insightsDir: join(social, 'insights'),
  };
}

export function rel(p) {
  const r = relative(process.cwd(), p);
  return r && !r.startsWith('..') ? r : p;
}

// ---------------------------------------------------------------------------
// Errors

/**
 * kind is the stable, machine-readable category a caller branches on:
 *   auth        token missing/expired/revoked (owner must act)
 *   permission  token valid but lacks a scope/permission (owner must act)
 *   rate_limit  call-rate or publishing limit reached (retry later)
 *   quota       daily API quota exhausted (retry tomorrow)
 *   invalid     request rejected as malformed (our bug or bad content)
 *   media       the video/cover failed validation or processing
 *   server      remote 5xx that survived retries
 *   network     connection failure that survived retries
 *   ambiguous   we cannot tell whether the post went live; do NOT retry blindly
 *   config      local configuration problem (env, files)
 *   not_found   resource does not exist
 */
export class PublishError extends Error {
  constructor(message, { platform, kind = 'invalid', status, code, subcode, traceId, retriable = false, hint, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'PublishError';
    this.platform = platform;
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.subcode = subcode;
    this.traceId = traceId;
    this.retriable = retriable;
    this.hint = hint;
  }
  toJSON() {
    const o = { kind: this.kind, message: this.message };
    for (const k of ['status', 'code', 'subcode', 'traceId', 'hint']) if (this[k] !== undefined) o[k] = this[k];
    return o;
  }
}

export function describeError(err) {
  if (err instanceof PublishError) {
    let s = `[${err.platform ?? 'publish'}:${err.kind}] ${err.message}`;
    if (err.hint) s += `\n  -> ${err.hint}`;
    if (err.traceId) s += `\n  (trace id: ${err.traceId})`;
    return s;
  }
  return String(err?.stack || err);
}

// ---------------------------------------------------------------------------
// Runtime context (dependency injection for tests)

export function makeContext(opts = {}) {
  return {
    fetch: opts.fetch ?? globalThis.fetch,
    sleep: opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    now: opts.now ?? (() => new Date()),
    log: opts.log ?? ((...a) => console.error(...a)),
    env: opts.env ?? process.env,
    retries: opts.retries ?? 4,
    baseDelayMs: opts.baseDelayMs ?? 1000,
    random: opts.random ?? Math.random,
  };
}

function backoffMs(ctx, attempt, retryAfterHeader) {
  const ra = Number(retryAfterHeader);
  if (Number.isFinite(ra) && ra >= 0) return Math.min(ra, 300) * 1000;
  const exp = ctx.baseDelayMs * 2 ** attempt;
  return Math.round(exp + ctx.random() * ctx.baseDelayMs);
}

async function readBody(res) {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * HTTP request with retry on network errors, 5xx and 429.
 *   retry: false      -> never retry (non-idempotent call whose duplicate would be harmful)
 *   okStatuses        -> extra statuses treated as success (e.g. 308 for YouTube resumable)
 *   classify(status, body, res) -> PublishError for a non-success response
 * Returns { status, headers, data }.
 */
export async function request(ctx, { method = 'GET', url, headers = {}, body, retry = true, okStatuses = [], classify, platform, label }) {
  const max = retry ? ctx.retries : 0;
  let lastErr;
  for (let attempt = 0; attempt <= max; attempt++) {
    let res;
    try {
      res = await ctx.fetch(url, { method, headers, body });
    } catch (e) {
      lastErr = new PublishError(`${label ?? method} failed: network error (${e?.cause?.code || e?.message || e})`, {
        platform,
        kind: 'network',
        retriable: true,
        cause: e,
      });
      const code = String(e?.cause?.code ?? '');
      if (/CERT|SELF_SIGNED|ERR_TLS|ENOTFOUND/.test(code)) {
        // TLS trust or DNS problems do not fix themselves within a retry window.
        lastErr.retriable = false;
        lastErr.hint = /ENOTFOUND/.test(code)
          ? 'The host could not be resolved. Check the environment\'s network access settings.'
          : 'TLS verification failed. In a cloud session make sure NODE_EXTRA_CA_CERTS / the proxy CA bundle is set (do not disable TLS checks).';
        throw lastErr;
      }
      if (attempt < max) {
        const wait = backoffMs(ctx, attempt);
        ctx.log(`  ${label ?? method}: network error, retrying in ${Math.round(wait / 1000)}s (${attempt + 1}/${max})`);
        await ctx.sleep(wait);
        continue;
      }
      throw lastErr;
    }
    const ok = (res.status >= 200 && res.status < 300) || okStatuses.includes(res.status);
    if (ok) {
      const data = res.status === 204 ? null : await readBody(res);
      return { status: res.status, headers: res.headers, data };
    }
    const data = await readBody(res);
    const err = classify
      ? classify(res.status, data, res)
      : new PublishError(`${label ?? method} -> HTTP ${res.status}`, { platform, status: res.status, kind: res.status >= 500 ? 'server' : 'invalid' });
    const transient = res.status >= 500 || res.status === 429 || err.retriable;
    // Daily quota / publishing caps never clear within a retry window.
    const terminal = err.kind === 'quota' || err.kind === 'auth' || err.kind === 'permission';
    if (transient && !terminal && attempt < max) {
      const wait = backoffMs(ctx, attempt, res.headers?.get?.('retry-after'));
      ctx.log(`  ${label ?? method}: HTTP ${res.status}, retrying in ${Math.round(wait / 1000)}s (${attempt + 1}/${max})`);
      await ctx.sleep(wait);
      lastErr = err;
      continue;
    }
    throw err;
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// CLI args

/** Minimal --flag / --key value / --key=value parser. Repeated keys keep the last value. */
export function parseArgs(argv, { booleans = [] } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const key = (eq > 0 ? a.slice(2, eq) : a.slice(2)).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (eq > 0) out[key] = a.slice(eq + 1);
    else if (booleans.includes(key) || i + 1 >= argv.length || argv[i + 1].startsWith('--')) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Calendar + posted.json

export async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT' && fallback !== undefined) return fallback;
    if (e.code === 'ENOENT') throw new PublishError(`${rel(path)} not found`, { kind: 'config' });
    throw new PublishError(`${rel(path)} is not valid JSON: ${e.message}`, { kind: 'config' });
  }
}

export async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await rename(tmp, path);
}

export function calendarEntries(cal) {
  if (Array.isArray(cal)) return cal;
  if (Array.isArray(cal?.entries)) return cal.entries;
  if (Array.isArray(cal?.posts)) return cal.posts;
  return [];
}

export async function loadEntry(id, paths = defaultPaths()) {
  const cal = await readJson(paths.calendar);
  const entry = calendarEntries(cal).find((e) => e && e.id === id);
  if (!entry) throw new PublishError(`No entry with id "${id}" in ${rel(paths.calendar)}`, { kind: 'config' });
  return entry;
}

export function mediaPaths(entry, paths = defaultPaths()) {
  return {
    videoPath: entry.video ? resolve(paths.root, entry.video) : join(paths.outDir, `${entry.id}.mp4`),
    coverPath: entry.cover ? resolve(paths.root, entry.cover) : join(paths.outDir, `${entry.id}.jpg`),
  };
}

export async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

/** posted.json log: { version: 1, posts: [record...] }. */
export async function loadPosted(path) {
  const data = await readJson(path, { version: 1, posts: [] });
  if (Array.isArray(data)) return { version: 1, posts: data };
  if (!Array.isArray(data.posts)) data.posts = [];
  return data;
}

export function findRecords(log, id, platform) {
  return log.posts.filter((r) => r.id === id && r.platform === platform);
}

export function publishedRecord(log, id, platform) {
  return findRecords(log, id, platform).find((r) => r.status === 'published');
}

// ---------------------------------------------------------------------------
// Dates

export function istDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// ---------------------------------------------------------------------------
// Dry-run printing

export function describeBody(body) {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  if (body?.__binary) return `<binary ${body.size ?? '?'} bytes from ${body.path}>`;
  return body;
}

export function printPlan(title, steps, write = (s) => console.log(s)) {
  write(`\n=== DRY RUN: ${title} ===`);
  steps.forEach((s, i) => {
    if (s.note) {
      write(`\n${i + 1}. ${s.note}`);
      return;
    }
    write(`\n${i + 1}. ${s.method} ${s.url}`);
    if (s.why) write(`   # ${s.why}`);
    for (const [k, v] of Object.entries(s.headers ?? {})) write(`   ${k}: ${v}`);
    const b = describeBody(s.body);
    if (b !== undefined) write(`   body: ${typeof b === 'string' ? b : JSON.stringify(b, null, 2).replace(/\n/g, '\n   ')}`);
  });
  write('');
}
