#!/usr/bin/env node
// Instagram Reels publisher (Instagram API with Instagram Login, graph.instagram.com).
//
// Flow (developers.facebook.com/docs/instagram-platform/content-publishing):
//   1. GET  /me?fields=user_id,username                         -> IG professional account id
//   2. GET  /<IG_ID>/content_publishing_limit                   -> refuse if the 24h cap is used up
//   3. POST /<IG_ID>/media  media_type=REELS                    -> container id
//        either video_url=<public URL> (documented for Instagram Login)
//        or     upload_type=resumable + POST rupload.facebook.com/ig-api-upload/<ver>/<container>
//   4. GET  /<container>?fields=status_code,status              -> poll until FINISHED
//   5. POST /<IG_ID>/media_publish creation_id=<container>      -> media id (never blindly retried)
//   6. GET  /<media>?fields=permalink,shortcode,timestamp
//
// CLI:
//   node social/publish/instagram.mjs --id <calendar id> [--dry-run] [--force]
//   node social/publish/instagram.mjs --check-token
//   node social/publish/instagram.mjs --refresh-token [--print-token | --out <file>]
//
// Env: INSTAGRAM_ACCESS_TOKEN (required), INSTAGRAM_USER_ID (optional),
//      INSTAGRAM_TOKEN_EXPIRES_AT (optional ISO date, enables the 10-day expiry warning),
//      INSTAGRAM_MEDIA_BASE_URL (optional public base URL serving social/out/, enables video_url + cover_url),
//      INSTAGRAM_GRAPH_HOST (optional, default graph.instagram.com; graph.facebook.com for Facebook Login tokens),
//      INSTAGRAM_API_VERSION (optional, default v27.0).
// INSTAGRAM_ACCESS_TOKEN=network-secret means the real token is a cloud-environment network secret that
// the agent proxy attaches to graph.instagram.com / rupload.facebook.com requests; we then send no
// Authorization header ourselves.

import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PublishError, makeContext, request, fileSize, parseArgs, describeError, printPlan, rel } from './lib/common.mjs';
import { probeMp4, checkReelSpec } from './lib/mp4.mjs';

export const PLATFORM = 'instagram';
export const DEFAULT_API_VERSION = 'v27.0';
export const TOKEN_WARN_DAYS = 10;
const TOKEN_PLACEHOLDER = '<INSTAGRAM_ACCESS_TOKEN>';

// Poll schedule for container processing. Meta suggests about once a minute for up to five
// minutes; short clips usually finish sooner, so we start tighter and back off (about 13 calls, 8 minutes max).
export const DEFAULT_POLL_MS = [10_000, 15_000, 20_000, 30_000, 45_000, 60_000, 60_000, 60_000, 60_000, 60_000, 60_000];

// ---------------------------------------------------------------------------
// Config

export function instagramConfig(env = process.env, { dryRun = false } = {}) {
  const token = (env.INSTAGRAM_ACCESS_TOKEN ?? '').trim();
  if (!token && !dryRun) {
    throw new PublishError('INSTAGRAM_ACCESS_TOKEN is not set', {
      platform: PLATFORM,
      kind: 'config',
      hint: 'Add it in the cloud environment settings (see docs/SOCIAL_SETUP.md, Parts A and C).',
    });
  }
  // INSTAGRAM_ACCESS_TOKEN=network-secret: the token is stored as a cloud-environment network
  // secret and the agent proxy adds the Authorization header itself, so we must not send one.
  const proxyAuth = /^(network-secret|proxy-injected)$/i.test(token);
  // Facebook Login tokens start with EAA; Instagram Login tokens with IG. Allow an explicit override.
  const host = (env.INSTAGRAM_GRAPH_HOST || (token.startsWith('EAA') ? 'graph.facebook.com' : 'graph.instagram.com')).replace(/^https?:\/\//, '').replace(/\/$/, '');
  return {
    token: token || TOKEN_PLACEHOLDER,
    hasToken: Boolean(token) && !proxyAuth,
    proxyAuth,
    host,
    version: env.INSTAGRAM_API_VERSION || DEFAULT_API_VERSION,
    userId: (env.INSTAGRAM_USER_ID ?? '').trim() || null,
    mediaBaseUrl: (env.INSTAGRAM_MEDIA_BASE_URL ?? '').trim().replace(/\/+$/, '') || null,
    tokenExpiresAt: (env.INSTAGRAM_TOKEN_EXPIRES_AT ?? '').trim() || null,
  };
}

const api = (cfg, path) => `https://${cfg.host}/${cfg.version}/${path}`;
const authHeaders = (cfg, extra = {}) => (cfg.proxyAuth ? { ...extra } : { Authorization: `Bearer ${cfg.token}`, ...extra });

// ---------------------------------------------------------------------------
// Error mapping (Graph API error object: { error: { code, error_subcode, message, error_user_msg, fbtrace_id, is_transient } })

export function classifyGraphError(status, body) {
  if (body && typeof body === 'object' && body.debug_info) {
    // rupload.facebook.com error shape
    const d = body.debug_info;
    const auth = /NotAuthorized|OAuth/i.test(d.type ?? '');
    return new PublishError(`Upload rejected: ${d.message ?? d.type ?? `HTTP ${status}`}`, {
      platform: PLATFORM,
      kind: auth ? 'permission' : d.retriable ? 'server' : 'media',
      status,
      retriable: Boolean(d.retriable),
      hint: auth
        ? 'Resumable upload is documented for Facebook Login apps only. Set INSTAGRAM_MEDIA_BASE_URL so the video is sent by public URL instead (docs/SOCIAL_SETUP.md, "Instagram upload mode").'
        : undefined,
    });
  }
  const e = (body && typeof body === 'object' && body.error) || {};
  const code = e.code;
  const subcode = e.error_subcode;
  const message = e.error_user_msg || e.message || (typeof body === 'string' && body) || `HTTP ${status}`;
  const base = { platform: PLATFORM, status, code, subcode, traceId: e.fbtrace_id };

  if (code === 190 || status === 401) {
    const why = { 463: 'the token has expired', 460: 'the Instagram password was changed', 458: 'the app was removed from the account', 464: 'the account is not confirmed' }[subcode];
    return new PublishError(`Instagram access token rejected${why ? `: ${why}` : ''} (${e.message ?? message})`, {
      ...base,
      kind: 'auth',
      hint: 'Generate a new long-lived token in the Meta app dashboard (docs/SOCIAL_SETUP.md, step A5) and update INSTAGRAM_ACCESS_TOKEN.',
    });
  }
  if (code === 10 || code === 3 || (code >= 200 && code < 300)) {
    return new PublishError(`Instagram permission missing: ${message}`, {
      ...base,
      kind: 'permission',
      hint: 'The token needs instagram_business_basic and instagram_business_content_publish (plus _manage_comments and _manage_insights for comments/insights). Regenerate it with those permissions.',
    });
  }
  if (code === 9 || subcode === 2207042) {
    return new PublishError(`Instagram publishing limit reached: ${message}`, { ...base, kind: 'rate_limit', hint: 'The account hit its rolling 24-hour publishing cap. Try again tomorrow.' });
  }
  if ([4, 17, 32, 613, 80002].includes(code)) {
    return new PublishError(`Instagram API call-rate limit: ${message}`, { ...base, kind: 'rate_limit', hint: 'Too many API calls in the last hour. Wait an hour and re-run.' });
  }
  if (e.is_transient || code === 1 || code === 2 || status >= 500) {
    return new PublishError(`Instagram temporary error: ${message}`, { ...base, kind: 'server', retriable: true });
  }
  if (status === 404 || code === 803) return new PublishError(`Instagram object not found: ${message}`, { ...base, kind: 'not_found' });
  if (String(subcode ?? '').startsWith('2207')) return new PublishError(`Instagram rejected the media: ${message}`, { ...base, kind: 'media' });
  return new PublishError(`Instagram request rejected: ${message}`, { ...base, kind: 'invalid' });
}

const igRequest = (ctx, req) => request(ctx, { platform: PLATFORM, classify: classifyGraphError, ...req });

// ---------------------------------------------------------------------------
// Request builders (shared by the live path and the dry-run plan, so the plan is exactly what is sent)

export const build = {
  me: (cfg) => ({ method: 'GET', url: api(cfg, 'me?fields=user_id,username'), headers: authHeaders(cfg), label: 'GET /me' }),
  limit: (cfg, igId) => ({ method: 'GET', url: api(cfg, `${igId}/content_publishing_limit?fields=quota_usage,config`), headers: authHeaders(cfg), label: 'GET content_publishing_limit' }),
  recentMedia: (cfg, igId, limit = 10) => ({ method: 'GET', url: api(cfg, `${igId}/media?fields=id,caption,timestamp,permalink&limit=${limit}`), headers: authHeaders(cfg), label: 'GET recent media' }),
  createContainer: (cfg, igId, params) => ({
    method: 'POST',
    url: api(cfg, `${igId}/media`),
    headers: authHeaders(cfg, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(params),
    label: 'POST /media (create REELS container)',
  }),
  upload: (cfg, uri, { size, offset = 0, body }) => ({
    method: 'POST',
    url: uri,
    headers: { ...(cfg.proxyAuth ? {} : { Authorization: `OAuth ${cfg.token}` }), offset: String(offset), file_size: String(size) },
    body,
    label: 'POST rupload (video bytes)',
  }),
  status: (cfg, containerId) => ({ method: 'GET', url: api(cfg, `${containerId}?fields=status_code,status`), headers: authHeaders(cfg), label: 'GET container status' }),
  uploadProgress: (cfg, containerId) => ({ method: 'GET', url: api(cfg, `${containerId}?fields=video_status`), headers: authHeaders(cfg), label: 'GET upload progress' }),
  publish: (cfg, igId, containerId) => ({
    method: 'POST',
    url: api(cfg, `${igId}/media_publish`),
    headers: authHeaders(cfg, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ creation_id: containerId }),
    label: 'POST /media_publish',
  }),
  mediaInfo: (cfg, mediaId) => ({ method: 'GET', url: api(cfg, `${mediaId}?fields=id,permalink,shortcode,timestamp`), headers: authHeaders(cfg), label: 'GET media permalink' }),
  refresh: (cfg) => ({
    method: 'GET',
    url: `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(cfg.token)}`,
    label: 'GET refresh_access_token',
  }),
};

export function ruploadUri(cfg, containerId) {
  return `https://rupload.facebook.com/ig-api-upload/${cfg.version}/${containerId}`;
}

// ---------------------------------------------------------------------------
// Token helpers

export function tokenExpiryStatus(env = process.env, now = new Date()) {
  const raw = (env.INSTAGRAM_TOKEN_EXPIRES_AT ?? '').trim();
  if (!raw) {
    return { level: 'unknown', expiresAt: null, daysLeft: null, message: 'Token expiry unknown (set INSTAGRAM_TOKEN_EXPIRES_AT to get a warning 10 days before it lapses).' };
  }
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return { level: 'unknown', expiresAt: null, daysLeft: null, message: `INSTAGRAM_TOKEN_EXPIRES_AT="${raw}" is not a date (use YYYY-MM-DD).` };
  const daysLeft = Math.floor((at.getTime() - now.getTime()) / 86_400_000);
  const day = at.toISOString().slice(0, 10);
  if (daysLeft < 0) return { level: 'expired', expiresAt: at, daysLeft, message: `Instagram token expired on ${day}. Generate a new one (docs/SOCIAL_SETUP.md, step A5).` };
  if (daysLeft <= TOKEN_WARN_DAYS) {
    return { level: 'warn', expiresAt: at, daysLeft, message: `WARNING: Instagram token expires in ${daysLeft} day(s), on ${day}. Renew it now (docs/SOCIAL_SETUP.md, step A6).` };
  }
  return { level: 'ok', expiresAt: at, daysLeft, message: `Instagram token valid until ${day} (${daysLeft} days).` };
}

export async function resolveUserId(ctx, cfg) {
  if (cfg.userId) return cfg.userId;
  if (cfg.host !== 'graph.instagram.com') {
    throw new PublishError('INSTAGRAM_USER_ID is required with a Facebook Login token (graph.facebook.com)', { platform: PLATFORM, kind: 'config' });
  }
  const { data } = await igRequest(ctx, build.me(cfg));
  const id = data?.user_id ?? data?.id;
  if (!id) throw new PublishError('GET /me returned no user_id', { platform: PLATFORM, kind: 'invalid' });
  return String(id);
}

export async function refreshLongLivedToken(opts = {}) {
  const ctx = makeContext(opts);
  const cfg = instagramConfig(ctx.env);
  if (cfg.proxyAuth) {
    throw new PublishError('The token is a network secret, so this session cannot read or refresh it.', {
      platform: PLATFORM,
      kind: 'config',
      hint: 'Generate a new token in the Meta app dashboard and replace the network secret (docs/SOCIAL_SETUP.md, step A6).',
    });
  }
  if (cfg.host !== 'graph.instagram.com') {
    throw new PublishError('Token refresh here only works for Instagram Login tokens (graph.instagram.com).', {
      platform: PLATFORM,
      kind: 'config',
      hint: 'For a Facebook Login token, exchange it with fb_exchange_token in the Meta app or use a Page token.',
    });
  }
  const { data } = await igRequest(ctx, build.refresh(cfg));
  if (!data?.access_token) throw new PublishError('refresh_access_token returned no token', { platform: PLATFORM, kind: 'invalid' });
  const expiresIn = Number(data.expires_in) || null;
  const expiresAt = expiresIn ? new Date(ctx.now().getTime() + expiresIn * 1000) : null;
  return { token: data.access_token, expiresIn, expiresAt, changed: data.access_token !== cfg.token };
}

// ---------------------------------------------------------------------------
// Publishing steps

export async function checkPublishingLimit(ctx, cfg, igId) {
  const { data } = await igRequest(ctx, build.limit(cfg, igId));
  const row = Array.isArray(data?.data) ? data.data[0] : data;
  const usage = Number(row?.quota_usage ?? 0);
  const total = Number(row?.config?.quota_total ?? 0) || null;
  const durationSec = Number(row?.config?.quota_duration ?? 0) || null;
  if (total != null && usage >= total) {
    throw new PublishError(`Instagram publishing limit reached: ${usage}/${total} posts in the last ${Math.round((durationSec ?? 86400) / 3600)}h`, {
      platform: PLATFORM,
      kind: 'rate_limit',
      hint: 'Wait until the rolling window frees up, then re-run.',
    });
  }
  return { usage, total, durationSec };
}

const normCaption = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Look for an already-live post with the same caption (guards against a crash between publish and logging). */
export async function findRecentDuplicate(ctx, cfg, igId, caption) {
  try {
    const { data } = await igRequest(ctx, { ...build.recentMedia(cfg, igId), retry: true });
    const want = normCaption(caption);
    const hit = (data?.data ?? []).find((m) => m.caption && normCaption(m.caption) === want);
    return hit ? { mediaId: hit.id, permalink: hit.permalink ?? null, publishedAt: hit.timestamp ?? null } : null;
  } catch (e) {
    if (e.kind === 'auth' || e.kind === 'permission') throw e;
    ctx.log(`  instagram: duplicate check skipped (${e.message})`);
    return null;
  }
}

async function uploadResumable(ctx, cfg, uri, containerId, buf) {
  let offset = 0;
  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const { data } = await igRequest(ctx, { ...build.upload(cfg, uri, { size: buf.length, offset, body: buf.subarray(offset) }), retry: false });
      if (data && data.success === false) throw new PublishError(`Upload failed: ${data.message ?? 'unknown'}`, { platform: PLATFORM, kind: 'server', retriable: true });
      return;
    } catch (e) {
      if (!(e.kind === 'network' || e.kind === 'server' || e.retriable) || attempt === 3) throw e;
      // Resume from what Meta already has, per the resumable-upload guide (video_status.uploading_phase.bytes_transferred).
      try {
        const { data } = await igRequest(ctx, build.uploadProgress(cfg, containerId));
        const got = Number(data?.video_status?.uploading_phase?.bytes_transferred);
        offset = Number.isFinite(got) && got > 0 && got < buf.length ? got : 0;
      } catch {
        offset = 0;
      }
      const wait = ctx.baseDelayMs * 2 ** attempt;
      ctx.log(`  instagram: upload interrupted (${e.message}); resuming at byte ${offset} in ${Math.round(wait / 1000)}s`);
      await ctx.sleep(wait);
    }
  }
}

export async function waitForContainer(ctx, cfg, containerId, schedule = DEFAULT_POLL_MS) {
  let last;
  for (const wait of schedule) {
    await ctx.sleep(wait);
    const { data } = await igRequest(ctx, build.status(cfg, containerId));
    last = data?.status_code;
    if (last === 'FINISHED' || last === 'PUBLISHED') return last;
    if (last === 'ERROR') {
      throw new PublishError(`Instagram could not process the video: ${data?.status ?? 'ERROR'}`, {
        platform: PLATFORM,
        kind: 'media',
        hint: 'Check the render matches the Reels spec (H.264/AAC MP4, moov atom first, 3 s to 15 min, at most 300 MB).',
      });
    }
    if (last === 'EXPIRED') throw new PublishError('Instagram container expired before publishing', { platform: PLATFORM, kind: 'media' });
    ctx.log(`  instagram: container ${containerId} ${last ?? 'unknown'}…`);
  }
  const total = Math.round(schedule.reduce((a, b) => a + b, 0) / 60000);
  throw new PublishError(`Instagram still processing after ${total} min (status ${last ?? 'unknown'}); nothing was published`, { platform: PLATFORM, kind: 'server', retriable: true });
}

async function findPublishedMedia(ctx, cfg, igId, startedAt) {
  const { data } = await igRequest(ctx, build.recentMedia(cfg, igId, 5));
  const since = startedAt.getTime() - 120_000;
  return (data?.data ?? []).find((m) => !m.timestamp || new Date(m.timestamp).getTime() >= since) ?? null;
}

/**
 * Crash recovery: if a container from an interrupted run reports PUBLISHED, return the live media
 * ({ mediaId, permalink, publishedAt }); otherwise null (that container never went live).
 */
export async function recoverContainer(opts, containerId, startedAt) {
  const ctx = makeContext(opts);
  const cfg = instagramConfig(ctx.env);
  const { data } = await igRequest(ctx, build.status(cfg, containerId));
  if (data?.status_code !== 'PUBLISHED') return null;
  const igId = await resolveUserId(ctx, cfg);
  const m = await findPublishedMedia(ctx, cfg, igId, new Date(startedAt));
  if (!m) throw new PublishError(`Container ${containerId} is PUBLISHED but its media was not found`, { platform: PLATFORM, kind: 'ambiguous' });
  return { mediaId: String(m.id), permalink: m.permalink ?? null, publishedAt: m.timestamp ?? null };
}

/** media_publish is not idempotent: on an unclear failure, ask the container what happened instead of retrying. */
async function publishContainer(ctx, cfg, igId, containerId, startedAt) {
  try {
    const { data } = await igRequest(ctx, { ...build.publish(cfg, igId, containerId), retry: false });
    if (!data?.id) throw new PublishError('media_publish returned no media id', { platform: PLATFORM, kind: 'ambiguous' });
    return String(data.id);
  } catch (e) {
    if (!(e.kind === 'network' || e.kind === 'server')) throw e;
    ctx.log(`  instagram: media_publish failed unclearly (${e.message}); checking the container before doing anything else`);
    await ctx.sleep(ctx.baseDelayMs * 5);
    let code;
    try {
      code = (await igRequest(ctx, build.status(cfg, containerId))).data?.status_code;
    } catch (e2) {
      throw new PublishError(`Could not confirm whether the reel was published (${e.message}; status check: ${e2.message})`, {
        platform: PLATFORM,
        kind: 'ambiguous',
        hint: `Check the Instagram profile. If the reel is live, record it in social/posted.json; if not, re-run with --force. Container: ${containerId}`,
      });
    }
    if (code === 'PUBLISHED') {
      const m = await findPublishedMedia(ctx, cfg, igId, startedAt);
      if (m) return String(m.id);
      throw new PublishError('Reel was published but its media id could not be found', { platform: PLATFORM, kind: 'ambiguous', hint: `Container ${containerId} reports PUBLISHED.` });
    }
    if (code === 'FINISHED') {
      ctx.log('  instagram: container not published yet; retrying media_publish once');
      const { data } = await igRequest(ctx, { ...build.publish(cfg, igId, containerId), retry: false });
      return String(data.id);
    }
    throw e;
  }
}

/** Decide how the video and cover reach Meta. */
export function planMedia(cfg, { videoPath, coverPath, videoUrl, coverUrl, coverExists, thumbOffsetMs }) {
  const v = videoUrl || (cfg.mediaBaseUrl ? `${cfg.mediaBaseUrl}/${encodeURIComponent(basename(videoPath))}` : null);
  const c = coverUrl || (cfg.mediaBaseUrl && coverExists ? `${cfg.mediaBaseUrl}/${encodeURIComponent(basename(coverPath))}` : null);
  const notes = [];
  if (!c && coverExists) notes.push(`cover ${rel(coverPath)} not used on Instagram: cover_url must be a public URL (set INSTAGRAM_MEDIA_BASE_URL); Instagram will use ${thumbOffsetMs != null ? `the frame at thumb_offset=${thumbOffsetMs} ms` : 'the first frame (or set thumbOffsetMs in the calendar entry)'}`);
  return { mode: v ? 'video_url' : 'resumable', videoUrl: v, coverUrl: c, notes };
}

export function containerParams({ caption, shareToFeed = true, media, thumbOffsetMs }) {
  const p = { media_type: 'REELS', caption, share_to_feed: shareToFeed };
  if (media.mode === 'video_url') p.video_url = media.videoUrl;
  else p.upload_type = 'resumable';
  if (media.coverUrl) p.cover_url = media.coverUrl;
  else if (thumbOffsetMs != null) p.thumb_offset = Math.max(0, Math.round(thumbOffsetMs));
  return p;
}

async function checkPublicUrl(ctx, url, expectedSize, what) {
  let res;
  try {
    res = await request(ctx, { method: 'HEAD', url, platform: PLATFORM, label: `HEAD ${what}` });
  } catch (e) {
    throw new PublishError(`${what} is not reachable at ${url} (${e.message})`, {
      platform: PLATFORM,
      kind: 'config',
      hint: 'Meta downloads the file from this URL; it must be public before posting. Check INSTAGRAM_MEDIA_BASE_URL.',
    });
  }
  const len = Number(res.headers?.get?.('content-length'));
  if (expectedSize && len && len !== expectedSize) ctx.log(`  instagram: WARNING ${what} at ${url} is ${len} bytes but the local file is ${expectedSize} bytes (stale upload?)`);
}

/**
 * Publish one Reel. Returns { platform, mediaId, containerId, permalink, shortcode, publishedAt, uploadMode, warnings }.
 * With opts.dryRun: no network calls; returns { dryRun: true, plan, warnings }.
 * opts.onProgress({ containerId }) is called once the container exists (lets the caller log it for crash recovery).
 */
export async function publishReel({ videoPath, coverPath, caption, videoUrl, coverUrl, thumbOffsetMs, shareToFeed = true }, opts = {}) {
  const ctx = makeContext(opts);
  const dryRun = Boolean(opts.dryRun);
  const cfg = instagramConfig(ctx.env, { dryRun });
  const warnings = [];
  const onProgress = opts.onProgress ?? (() => {});
  if (!caption) throw new PublishError('caption is required', { platform: PLATFORM, kind: 'config' });

  const size = await fileSize(videoPath);
  if (size == null && !dryRun) throw new PublishError(`Video not found: ${rel(videoPath)}`, { platform: PLATFORM, kind: 'config' });
  const buf = size != null ? await readFile(videoPath) : null;
  if (buf) {
    const spec = checkReelSpec(probeMp4(buf), size);
    warnings.push(...spec.warnings);
    if (spec.errors.length && !dryRun) throw new PublishError(`Video fails the Reels spec: ${spec.errors.join('; ')}`, { platform: PLATFORM, kind: 'media' });
    if (spec.errors.length) warnings.push(...spec.errors.map((e) => `WOULD FAIL: ${e}`));
  } else {
    warnings.push(`video ${rel(videoPath)} does not exist yet`);
  }
  const coverExists = coverPath ? (await fileSize(coverPath)) != null : false;
  const media = planMedia(cfg, { videoPath, coverPath, videoUrl, coverUrl, coverExists, thumbOffsetMs });
  warnings.push(...media.notes);
  const params = containerParams({ caption, shareToFeed, media, thumbOffsetMs: media.coverUrl ? undefined : thumbOffsetMs });

  if (dryRun) {
    const igId = cfg.userId ?? '<INSTAGRAM_USER_ID from step 1>';
    const steps = [];
    if (!cfg.userId) steps.push({ ...build.me(cfg), why: 'resolve the Instagram professional account id' });
    steps.push({ ...build.limit(cfg, igId), why: 'stop if the rolling 24h publishing cap is used up' });
    steps.push({ ...build.recentMedia(cfg, igId), why: 'skip if a post with this exact caption is already live' });
    if (media.mode === 'video_url') steps.push({ method: 'HEAD', url: media.videoUrl, why: 'confirm Meta will be able to download the video' });
    steps.push({ ...build.createContainer(cfg, igId, params), why: `upload mode: ${media.mode}` });
    if (media.mode === 'resumable') {
      steps.push({ ...build.upload(cfg, ruploadUri(cfg, '<CONTAINER_ID>'), { size: size ?? '<size>', body: { __binary: true, size, path: rel(videoPath) } }), why: 'send the MP4 bytes (no public URL needed)' });
    }
    steps.push({ ...build.status(cfg, '<CONTAINER_ID>'), why: `poll until status_code=FINISHED (up to ${DEFAULT_POLL_MS.length} checks)` });
    steps.push({ ...build.publish(cfg, igId, '<CONTAINER_ID>'), why: 'make it live (sent once, never blindly retried)' });
    steps.push({ ...build.mediaInfo(cfg, '<MEDIA_ID>'), why: 'fetch the permalink for social/posted.json' });
    return { platform: PLATFORM, dryRun: true, plan: redactPlan(steps, cfg), warnings, uploadMode: media.mode };
  }

  const startedAt = ctx.now();
  const expiry = tokenExpiryStatus(ctx.env, startedAt);
  if (expiry.level === 'warn' || expiry.level === 'expired') {
    ctx.log(`  ${expiry.message}`);
    warnings.push(expiry.message);
  }

  const igId = await resolveUserId(ctx, cfg);
  if (opts.checkDuplicate !== false) {
    const dup = await findRecentDuplicate(ctx, cfg, igId, caption);
    if (dup) {
      ctx.log(`  instagram: a post with this caption is already live (${dup.permalink ?? dup.mediaId}); not posting again`);
      return { platform: PLATFORM, ...dup, duplicate: true, warnings };
    }
  }
  const quota = await checkPublishingLimit(ctx, cfg, igId);
  if (media.mode === 'video_url') {
    await checkPublicUrl(ctx, media.videoUrl, size, 'video');
    if (media.coverUrl) await checkPublicUrl(ctx, media.coverUrl, null, 'cover');
  }

  const { data: created } = await igRequest(ctx, build.createContainer(cfg, igId, params));
  const containerId = created?.id && String(created.id);
  if (!containerId) throw new PublishError('Container creation returned no id', { platform: PLATFORM, kind: 'invalid' });
  await onProgress({ containerId });
  ctx.log(`  instagram: container ${containerId} created (${media.mode})`);

  if (media.mode === 'resumable') {
    // Only ever send the token to Meta's upload host, whatever uri the API hands back.
    const uri = typeof created.uri === 'string' && /^https:\/\/rupload\.facebook\.com\//.test(created.uri) ? created.uri : ruploadUri(cfg, containerId);
    await uploadResumable(ctx, cfg, uri, containerId, buf);
    ctx.log(`  instagram: uploaded ${buf.length} bytes`);
  }

  const state = await waitForContainer(ctx, cfg, containerId, opts.pollScheduleMs ?? DEFAULT_POLL_MS);
  let mediaId;
  if (state === 'PUBLISHED') {
    const m = await findPublishedMedia(ctx, cfg, igId, startedAt);
    if (!m) throw new PublishError('Container already PUBLISHED but no matching media found', { platform: PLATFORM, kind: 'ambiguous' });
    mediaId = String(m.id);
  } else {
    mediaId = await publishContainer(ctx, cfg, igId, containerId, startedAt);
  }

  let info = {};
  try {
    info = (await igRequest(ctx, build.mediaInfo(cfg, mediaId))).data ?? {};
  } catch (e) {
    warnings.push(`published, but permalink lookup failed: ${e.message}`);
  }
  return {
    platform: PLATFORM,
    mediaId,
    containerId,
    permalink: info.permalink ?? null,
    shortcode: info.shortcode ?? null,
    publishedAt: info.timestamp ?? ctx.now().toISOString(),
    uploadMode: media.mode,
    quotaBefore: quota,
    warnings,
  };
}

function redactPlan(steps, cfg) {
  if (!cfg.hasToken) return steps;
  const swap = (v) => (typeof v === 'string' ? v.split(cfg.token).join(TOKEN_PLACEHOLDER).split(encodeURIComponent(cfg.token)).join(TOKEN_PLACEHOLDER) : v);
  return steps.map((s) => ({ ...s, url: swap(s.url), headers: Object.fromEntries(Object.entries(s.headers ?? {}).map(([k, v]) => [k, swap(v)])) }));
}

// ---------------------------------------------------------------------------
// CLI

async function main(argv) {
  const args = parseArgs(argv, { booleans: ['dryRun', 'force', 'checkToken', 'refreshToken', 'printToken', 'help'] });
  if (args.help || (!args.id && !args.checkToken && !args.refreshToken)) {
    console.log(`Usage:
  node social/publish/instagram.mjs --id <calendar id> [--dry-run] [--force]
  node social/publish/instagram.mjs --check-token
  node social/publish/instagram.mjs --refresh-token [--print-token | --out <file>]`);
    return args.help ? 0 : 2;
  }
  if (args.checkToken) {
    const ctx = makeContext();
    const cfg = instagramConfig(ctx.env);
    const { data } = await igRequest(ctx, build.me(cfg));
    console.log(`Token works for @${data?.username ?? '?'} (user_id ${data?.user_id ?? data?.id}) via ${cfg.host}`);
    const s = tokenExpiryStatus(ctx.env);
    console.log(s.message);
    return s.level === 'expired' ? 1 : 0;
  }
  if (args.refreshToken) {
    const r = await refreshLongLivedToken();
    const day = r.expiresAt ? r.expiresAt.toISOString().slice(0, 10) : 'unknown';
    console.log(`Refreshed. New token expires ${day}${r.expiresIn ? ` (${Math.round(r.expiresIn / 86400)} days)` : ''}.`);
    if (!r.changed) {
      console.log('The token string is unchanged, so nothing needs updating except INSTAGRAM_TOKEN_EXPIRES_AT.');
    } else {
      console.log('The token string CHANGED. This session cannot edit environment settings, so:');
      if (args.out) {
        await writeFile(args.out, r.token + '\n', { mode: 0o600 });
        console.log(`  - The new token was written to ${args.out} (mode 600). It was not printed.`);
      } else if (args.printToken) {
        console.log(`  - New token: ${r.token}`);
      } else {
        console.log('  - Re-run with --out <file> (or --print-token on your own computer) to get the new value.');
      }
      console.log('  - Paste it into the cloud environment settings as INSTAGRAM_ACCESS_TOKEN (never into chat).');
    }
    console.log(`  - Set INSTAGRAM_TOKEN_EXPIRES_AT=${day} so posting runs warn 10 days before expiry.`);
    return 0;
  }
  const { runPost } = await import('./lib/run.mjs');
  const { results, exitCode, dryRunOutput } = await runPost({ id: String(args.id), platforms: ['instagram'], dryRun: Boolean(args.dryRun), force: Boolean(args.force) });
  if (dryRunOutput) for (const p of dryRunOutput) printPlan(p.title, p.plan);
  for (const r of results) console.log(r.summary);
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(describeError(e));
      process.exit(e?.kind === 'config' ? 2 : 1);
    },
  );
}
