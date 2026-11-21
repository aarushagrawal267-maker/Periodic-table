#!/usr/bin/env node
// YouTube Shorts uploader (YouTube Data API v3, resumable upload protocol).
//
// Flow:
//   1. POST https://oauth2.googleapis.com/token  grant_type=refresh_token        -> access token
//   2. GET  channels?part=contentDetails&mine=true + playlistItems (uploads)      -> skip if same title already uploaded (2 units)
//   3. POST /upload/youtube/v3/videos?uploadType=resumable&part=snippet,status,paidProductPlacementDetails
//        -> Location: session URI
//   4. PUT  <session URI>  (video bytes). On network error / 5xx: PUT Content-Range: bytes */N,
//        then resume from the 308 Range header (or take the 200/201 video if it finished).
//   5. GET  videos?part=status,processingDetails  -> poll until processingStatus=succeeded
//   6. POST /upload/youtube/v3/thumbnails/set?videoId=... (cover JPG; Shorts supported after processing)
//
// CLI:
//   node social/publish/youtube.mjs --id <calendar id> [--dry-run] [--privacy public|unlisted|private] [--force]
//   node social/publish/youtube.mjs --set-thumbnail --id <calendar id>     (retry a thumbnail that was left pending)
//   node social/publish/youtube.mjs --check-auth
//   node social/publish/youtube.mjs --list-categories [--region IN]
//
// Env: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN (required);
//      YOUTUBE_PRIVACY (default public), YOUTUBE_CATEGORY_ID (default 27 = Education),
//      YOUTUBE_MADE_FOR_KIDS (default false), YOUTUBE_NOTIFY_SUBSCRIBERS (default true).

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PublishError, makeContext, request, fileSize, parseArgs, describeError, printPlan, rel, loadEntry, mediaPaths, loadPosted, publishedRecord, defaultPaths } from './lib/common.mjs';
import { probeMp4, checkShortsSpec } from './lib/mp4.mjs';

export const PLATFORM = 'youtube';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const API = 'https://www.googleapis.com/youtube/v3';
export const UPLOAD_API = 'https://www.googleapis.com/upload/youtube/v3';
export const EDUCATION_CATEGORY_ID = '27';
export const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];
const PRIVACY = ['public', 'unlisted', 'private'];
export const DEFAULT_PROCESSING_POLL_MS = [15_000, 15_000, 20_000, 30_000, 30_000, 60_000, 60_000, 60_000];
const MAX_THUMBNAIL_BYTES = 50 * 1024 * 1024;

const bool = (v, dflt) => (v == null || v === '' ? dflt : /^(1|true|yes|on)$/i.test(String(v)));

export function youtubeConfig(env = process.env, { dryRun = false } = {}) {
  const need = ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'];
  const missing = need.filter((k) => !(env[k] ?? '').trim());
  if (missing.length && !dryRun) {
    throw new PublishError(`Missing ${missing.join(', ')}`, { platform: PLATFORM, kind: 'config', hint: 'Add them in the cloud environment settings (see docs/SOCIAL_SETUP.md, Parts B and C).' });
  }
  const privacy = (env.YOUTUBE_PRIVACY ?? 'public').trim().toLowerCase();
  return {
    clientId: (env.YOUTUBE_CLIENT_ID ?? '').trim() || '<YOUTUBE_CLIENT_ID>',
    clientSecret: (env.YOUTUBE_CLIENT_SECRET ?? '').trim() || '<YOUTUBE_CLIENT_SECRET>',
    refreshToken: (env.YOUTUBE_REFRESH_TOKEN ?? '').trim() || '<YOUTUBE_REFRESH_TOKEN>',
    hasCredentials: missing.length === 0,
    privacy: PRIVACY.includes(privacy) ? privacy : 'public',
    categoryId: (env.YOUTUBE_CATEGORY_ID ?? '').trim() || EDUCATION_CATEGORY_ID,
    madeForKids: bool(env.YOUTUBE_MADE_FOR_KIDS, false),
    notifySubscribers: bool(env.YOUTUBE_NOTIFY_SUBSCRIBERS, true),
  };
}

// ---------------------------------------------------------------------------
// Errors

export function classifyGoogleError(status, body) {
  if (body && typeof body === 'object' && typeof body.error === 'string') {
    // OAuth token endpoint shape: { error, error_description }
    const desc = body.error_description ?? body.error;
    if (body.error === 'invalid_grant') {
      return new PublishError(`YouTube refresh token rejected: ${desc}`, {
        platform: PLATFORM,
        kind: 'auth',
        status,
        hint: 'The refresh token expired or was revoked. Tokens from an OAuth app left in "Testing" expire after 7 days. Use a Personal-mode or In-production app and make a new refresh token (docs/SOCIAL_SETUP.md, step B3).',
      });
    }
    if (body.error === 'invalid_client' || body.error === 'unauthorized_client') {
      return new PublishError(`YouTube OAuth client rejected: ${desc}`, { platform: PLATFORM, kind: 'config', status, hint: 'Check YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET, and that the refresh token was made with this same client.' });
    }
    return new PublishError(`YouTube OAuth error: ${desc}`, { platform: PLATFORM, kind: status >= 500 ? 'server' : 'auth', status, retriable: status >= 500 });
  }
  const e = (body && typeof body === 'object' && body.error) || {};
  const reason = e.errors?.[0]?.reason ?? e.details?.find?.((d) => d.reason)?.reason ?? e.status;
  const message = e.message || (typeof body === 'string' && body.trim()) || `HTTP ${status}`;
  const base = { platform: PLATFORM, status, code: reason };
  if (status === 401) return new PublishError(`YouTube authorization failed: ${message}`, { ...base, kind: 'auth', hint: 'Make a new refresh token (docs/SOCIAL_SETUP.md, step B3).' });
  if (['quotaExceeded', 'dailyLimitExceeded', 'RESOURCE_EXHAUSTED'].includes(reason)) {
    return new PublishError(`YouTube API daily quota used up: ${message}`, { ...base, kind: 'quota', hint: 'Quota resets at midnight Pacific time. Re-run after that.' });
  }
  if (reason === 'uploadLimitExceeded') return new PublishError(`YouTube channel upload limit reached: ${message}`, { ...base, kind: 'quota', hint: 'The channel hit its daily upload cap. Try tomorrow.' });
  if (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded' || status === 429) {
    return new PublishError(`YouTube rate limit: ${message}`, { ...base, kind: 'rate_limit', retriable: true });
  }
  if (['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'PERMISSION_DENIED'].includes(reason) || /scope/i.test(message)) {
    return new PublishError(`YouTube token lacks a scope: ${message}`, { ...base, kind: 'permission', hint: `Make a new refresh token with these scopes: ${SCOPES.join(' ')}` });
  }
  if (reason === 'youtubeSignupRequired' || reason === 'channelNotFound') {
    return new PublishError(`No YouTube channel for this Google account: ${message}`, { ...base, kind: 'permission', hint: 'Sign in with the account (or brand account) that owns the channel when making the refresh token.' });
  }
  if (status === 403) return new PublishError(`YouTube refused the request: ${message}`, { ...base, kind: 'permission' });
  if (status === 404) return new PublishError(`YouTube resource not found: ${message}`, { ...base, kind: 'not_found' });
  if (status >= 500) return new PublishError(`YouTube server error: ${message}`, { ...base, kind: 'server', retriable: true });
  return new PublishError(`YouTube rejected the request: ${message}`, { ...base, kind: 'invalid' });
}

const ytRequest = (ctx, req) => request(ctx, { platform: PLATFORM, classify: classifyGoogleError, ...req });

// ---------------------------------------------------------------------------
// Request builders (live path and dry-run share these)

const bearer = (token, extra = {}) => ({ Authorization: `Bearer ${token}`, ...extra });

export const build = {
  token: (cfg) => ({
    method: 'POST',
    url: TOKEN_URL,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: cfg.refreshToken, grant_type: 'refresh_token' }).toString(),
    label: 'POST oauth2 token',
  }),
  myChannel: (t) => ({ method: 'GET', url: `${API}/channels?part=id,snippet,contentDetails,statistics&mine=true`, headers: bearer(t), label: 'GET channels (mine)' }),
  uploads: (t, playlistId, max = 25) => ({ method: 'GET', url: `${API}/playlistItems?part=snippet&maxResults=${max}&playlistId=${encodeURIComponent(playlistId)}`, headers: bearer(t), label: 'GET uploads playlist' }),
  startUpload: (t, { parts, resource, size, notifySubscribers }) => ({
    method: 'POST',
    url: `${UPLOAD_API}/videos?uploadType=resumable&part=${parts.join(',')}&notifySubscribers=${notifySubscribers}`,
    headers: bearer(t, { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': 'video/mp4' }),
    body: JSON.stringify(resource),
    label: 'POST videos.insert (start resumable session)',
  }),
  putBytes: (t, sessionUrl, { body, start = 0, size }) => ({
    method: 'PUT',
    url: sessionUrl,
    headers: bearer(t, { 'Content-Type': 'video/mp4', ...(start > 0 ? { 'Content-Range': `bytes ${start}-${size - 1}/${size}` } : {}) }),
    body,
    label: 'PUT video bytes',
  }),
  uploadStatus: (t, sessionUrl, size) => ({ method: 'PUT', url: sessionUrl, headers: bearer(t, { 'Content-Range': `bytes */${size}` }), body: '', label: 'PUT upload status' }),
  videoStatus: (t, id) => ({ method: 'GET', url: `${API}/videos?part=status,processingDetails&id=${encodeURIComponent(id)}`, headers: bearer(t), label: 'GET videos (status)' }),
  thumbnail: (t, id, body) => ({
    method: 'POST',
    url: `${UPLOAD_API}/thumbnails/set?videoId=${encodeURIComponent(id)}&uploadType=media`,
    headers: bearer(t, { 'Content-Type': 'image/jpeg' }),
    body,
    label: 'POST thumbnails.set',
  }),
  categories: (t, region) => ({ method: 'GET', url: `${API}/videoCategories?part=snippet&regionCode=${encodeURIComponent(region)}`, headers: bearer(t), label: 'GET videoCategories' }),
};

// ---------------------------------------------------------------------------
// Auth

/** Exchanges the refresh token for an access token; cached on ctx for the rest of the run. */
export async function getAccessToken(ctx, cfg) {
  if (ctx._ytToken && ctx._ytToken.exp > Date.now() + 60_000) return ctx._ytToken.value;
  const { data } = await ytRequest(ctx, build.token(cfg));
  if (!data?.access_token) throw new PublishError('Token endpoint returned no access_token', { platform: PLATFORM, kind: 'auth' });
  ctx._ytToken = { value: data.access_token, exp: Date.now() + (Number(data.expires_in) || 3600) * 1000, scope: data.scope ?? '' };
  return data.access_token;
}

export async function getMyChannel(ctx, token) {
  const { data } = await ytRequest(ctx, build.myChannel(token));
  const ch = data?.items?.[0];
  if (!ch) throw new PublishError('This Google account has no YouTube channel', { platform: PLATFORM, kind: 'permission', hint: 'Make the refresh token while signed in to the channel owner account (pick the channel when asked).' });
  return ch;
}

/** Same title among the latest uploads => treat as already posted. Costs 2 quota units. */
export async function findUploadedByTitle(ctx, token, title) {
  try {
    const ch = await getMyChannel(ctx, token);
    const playlistId = ch.contentDetails?.relatedPlaylists?.uploads;
    if (!playlistId) return null;
    const { data } = await ytRequest(ctx, build.uploads(token, playlistId));
    const hit = (data?.items ?? []).find((it) => it.snippet?.title === title);
    const videoId = hit?.snippet?.resourceId?.videoId;
    return videoId ? { videoId, publishedAt: hit.snippet.publishedAt ?? null } : null;
  } catch (e) {
    if (['auth', 'permission', 'quota'].includes(e.kind)) throw e;
    ctx.log(`  youtube: duplicate check skipped (${e.message})`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Upload

export function videoResource({ title, description, tags, categoryId, privacyStatus, madeForKids, containsSyntheticMedia = false, defaultLanguage = 'en' }) {
  return {
    snippet: { title, description, tags, categoryId: String(categoryId), defaultLanguage, defaultAudioLanguage: defaultLanguage },
    status: { privacyStatus, selfDeclaredMadeForKids: Boolean(madeForKids), containsSyntheticMedia: Boolean(containsSyntheticMedia), embeddable: true, license: 'youtube' },
    // Since 2026-11-16 this no longer defaults to false; declare it explicitly.
    paidProductPlacementDetails: { hasPaidProductPlacement: false },
  };
}

const PARTS = ['snippet', 'status', 'paidProductPlacementDetails'];

async function startSession(ctx, token, { resource, size, notifySubscribers }) {
  let parts = PARTS;
  let res = resource;
  try {
    const r = await ytRequest(ctx, build.startUpload(token, { parts, resource: res, size, notifySubscribers }));
    return { sessionUrl: r.headers.get('location'), parts };
  } catch (e) {
    if (!(e.kind === 'invalid' && /paidProductPlacement/i.test(e.message))) throw e;
    // Older behaviour: part not accepted on insert. Fall back rather than fail the post.
    ctx.log('  youtube: paidProductPlacementDetails not accepted on insert; retrying without it');
    parts = PARTS.filter((p) => p !== 'paidProductPlacementDetails');
    const { paidProductPlacementDetails: _drop, ...rest } = res;
    res = rest;
    const r = await ytRequest(ctx, build.startUpload(token, { parts, resource: res, size, notifySubscribers }));
    return { sessionUrl: r.headers.get('location'), parts };
  }
}

/** Sends the bytes; resumes after interruptions per the resumable-upload guide. Returns the video resource. */
async function sendBytes(ctx, token, sessionUrl, buf) {
  const size = buf.length;
  let start = 0;
  for (let attempt = 0; attempt <= 5; attempt++) {
    try {
      const r = await ytRequest(ctx, { ...build.putBytes(token, sessionUrl, { body: buf.subarray(start), start, size }), retry: false, okStatuses: [308] });
      if (r.status === 200 || r.status === 201) return r.data;
      // 308 after a full send should not happen; fall through to a status query.
    } catch (e) {
      if (e.kind === 'not_found') throw Object.assign(e, { sessionExpired: true });
      if (!(e.kind === 'network' || e.kind === 'server' || e.retriable) || attempt === 5) throw e;
      const wait = ctx.baseDelayMs * 2 ** attempt;
      ctx.log(`  youtube: upload interrupted (${e.message}); checking progress in ${Math.round(wait / 1000)}s`);
      await ctx.sleep(wait);
    }
    const q = await ytRequest(ctx, { ...build.uploadStatus(token, sessionUrl, size), okStatuses: [308] });
    if (q.status === 200 || q.status === 201) return q.data;
    const range = q.headers.get('range');
    const m = range && /bytes=0-(\d+)/.exec(range);
    start = m ? Number(m[1]) + 1 : 0;
    ctx.log(`  youtube: server has ${start}/${size} bytes; resuming`);
  }
  throw new PublishError('Upload did not complete after several resumes', { platform: PLATFORM, kind: 'network', retriable: true });
}

export async function waitForProcessing(ctx, token, videoId, schedule = DEFAULT_PROCESSING_POLL_MS) {
  let last;
  for (const wait of schedule) {
    await ctx.sleep(wait);
    const { data } = await ytRequest(ctx, build.videoStatus(token, videoId));
    const v = data?.items?.[0];
    last = v?.processingDetails?.processingStatus ?? (v?.status?.uploadStatus === 'processed' ? 'succeeded' : undefined);
    if (last === 'succeeded' || last === 'failed' || last === 'terminated') return { processing: last, status: v?.status ?? {} };
    if (v?.status?.uploadStatus === 'rejected' || v?.status?.uploadStatus === 'failed') return { processing: 'failed', status: v.status };
  }
  return { processing: last ?? 'processing', status: {} };
}

export async function setThumbnail(ctx, token, videoId, coverPath) {
  const size = await fileSize(coverPath);
  if (size == null) return { thumbnail: 'skipped', note: `no cover at ${rel(coverPath)}` };
  if (size > MAX_THUMBNAIL_BYTES) return { thumbnail: 'failed', note: `cover is ${size} bytes; max is 50 MB` };
  try {
    await ytRequest(ctx, build.thumbnail(token, videoId, await readFile(coverPath)));
    return { thumbnail: 'set' };
  } catch (e) {
    const hint = e.kind === 'permission' ? ' (custom thumbnails need a verified channel: youtube.com/verify)' : '';
    return { thumbnail: 'failed', note: `${e.message}${hint}` };
  }
}

/**
 * Upload one Short. Returns { platform, videoId, url, privacyStatus, requestedPrivacy, thumbnail, warnings }.
 * With opts.dryRun: no network calls; returns { dryRun: true, plan, warnings }.
 */
export async function uploadShort({ videoPath, coverPath, title, description = '', tags = [], privacyStatus, categoryId, madeForKids, containsSyntheticMedia, defaultLanguage }, opts = {}) {
  const ctx = makeContext(opts);
  const dryRun = Boolean(opts.dryRun);
  const cfg = youtubeConfig(ctx.env, { dryRun });
  const warnings = [];
  const onProgress = opts.onProgress ?? (() => {});
  const privacy = privacyStatus ?? cfg.privacy;
  if (!PRIVACY.includes(privacy)) throw new PublishError(`privacyStatus must be one of ${PRIVACY.join(', ')}`, { platform: PLATFORM, kind: 'config' });
  if (!title) throw new PublishError('title is required', { platform: PLATFORM, kind: 'config' });

  const size = await fileSize(videoPath);
  if (size == null && !dryRun) throw new PublishError(`Video not found: ${rel(videoPath)}`, { platform: PLATFORM, kind: 'config' });
  const buf = size != null ? await readFile(videoPath) : null;
  if (buf) warnings.push(...checkShortsSpec(probeMp4(buf)).warnings);
  else warnings.push(`video ${rel(videoPath)} does not exist yet`);
  const coverExists = coverPath ? (await fileSize(coverPath)) != null : false;

  const resource = videoResource({ title, description, tags, categoryId: categoryId ?? cfg.categoryId, privacyStatus: privacy, madeForKids: madeForKids ?? cfg.madeForKids, containsSyntheticMedia, defaultLanguage });

  if (dryRun) {
    const t = '<ACCESS_TOKEN from step 1>';
    const tokenReq = build.token(cfg);
    const steps = [
      { ...tokenReq, why: 'exchange the refresh token for a 1-hour access token' },
      { ...build.myChannel(t), why: 'find the uploads playlist (duplicate check, 1 unit)' },
      { ...build.uploads(t, '<UPLOADS_PLAYLIST_ID>'), why: `skip if a video titled "${title}" is already uploaded (1 unit)` },
      { ...build.startUpload(t, { parts: PARTS, resource, size: size ?? '<size>', notifySubscribers: cfg.notifySubscribers }), why: 'videos.insert, resumable; response Location header = session URI' },
      { ...build.putBytes(t, '<SESSION_URI>', { body: { __binary: true, size, path: rel(videoPath) }, size }), why: 'send the MP4; on interruption query with Content-Range: bytes */N and resume' },
      { ...build.videoStatus(t, '<VIDEO_ID>'), why: 'poll until processingDetails.processingStatus=succeeded' },
    ];
    if (coverExists) steps.push({ ...build.thumbnail(t, '<VIDEO_ID>', { __binary: true, size: await fileSize(coverPath), path: rel(coverPath) }), why: 'custom thumbnail from the cover JPG' });
    else steps.push({ note: `no cover${coverPath ? ` at ${rel(coverPath)}` : ""}; YouTube will pick a frame` });
    if (cfg.hasCredentials) {
      // Never print real secrets in a plan.
      steps[0] = { ...steps[0], body: tokenReq.body.replace(encodeURIComponent(cfg.clientSecret), '<YOUTUBE_CLIENT_SECRET>').replace(encodeURIComponent(cfg.refreshToken), '<YOUTUBE_REFRESH_TOKEN>').replace(encodeURIComponent(cfg.clientId), '<YOUTUBE_CLIENT_ID>') };
    }
    return { platform: PLATFORM, dryRun: true, plan: steps, warnings };
  }

  const token = await getAccessToken(ctx, cfg);
  if (opts.checkDuplicate !== false) {
    const dup = await findUploadedByTitle(ctx, token, title);
    if (dup) {
      ctx.log(`  youtube: "${title}" is already on the channel (${dup.videoId}); not uploading again`);
      return { platform: PLATFORM, videoId: dup.videoId, url: `https://youtube.com/shorts/${dup.videoId}`, publishedAt: dup.publishedAt, duplicate: true, warnings };
    }
  }

  let video;
  for (let session = 0; session < 2 && !video; session++) {
    const { sessionUrl } = await startSession(ctx, token, { resource, size: buf.length, notifySubscribers: cfg.notifySubscribers });
    if (!sessionUrl) throw new PublishError('videos.insert returned no session URI', { platform: PLATFORM, kind: 'invalid' });
    await onProgress({ uploadStarted: true });
    try {
      video = await sendBytes(ctx, token, sessionUrl, buf);
    } catch (e) {
      // A 404 means the session expired before any video was created, so a fresh session is safe.
      if (!e.sessionExpired || session === 1) throw e;
      ctx.log('  youtube: upload session expired; starting a new one');
    }
  }
  const videoId = video?.id;
  if (!videoId) throw new PublishError('Upload finished but no video id was returned', { platform: PLATFORM, kind: 'ambiguous', hint: 'Check YouTube Studio before re-running.' });
  await onProgress({ videoId });
  ctx.log(`  youtube: uploaded ${videoId}`);

  const result = {
    platform: PLATFORM,
    videoId,
    url: `https://youtube.com/shorts/${videoId}`,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    requestedPrivacy: privacy,
    privacyStatus: video.status?.privacyStatus ?? privacy,
    uploadStatus: video.status?.uploadStatus ?? null,
    publishedAt: ctx.now().toISOString(),
    thumbnail: coverExists ? 'pending' : 'skipped',
    warnings,
  };

  if (coverExists && opts.setThumbnail !== false) {
    const p = await waitForProcessing(ctx, token, videoId, opts.processingScheduleMs ?? DEFAULT_PROCESSING_POLL_MS);
    if (p.status?.privacyStatus) result.privacyStatus = p.status.privacyStatus;
    if (p.processing === 'succeeded') {
      const t = await setThumbnail(ctx, token, videoId, coverPath);
      result.thumbnail = t.thumbnail;
      if (t.note) warnings.push(`thumbnail: ${t.note}`);
    } else if (p.processing === 'failed' || p.processing === 'terminated') {
      result.thumbnail = 'failed';
      warnings.push(`YouTube processing ${p.processing}${p.status?.failureReason ? `: ${p.status.failureReason}` : ''}${p.status?.rejectionReason ? `: ${p.status.rejectionReason}` : ''}`);
    } else {
      warnings.push(`thumbnail pending: video still processing. Later run: node social/publish/youtube.mjs --set-thumbnail --id <id>`);
    }
  }
  if (privacy === 'public' && result.privacyStatus && result.privacyStatus !== 'public') {
    warnings.push(`requested public but YouTube reports "${result.privacyStatus}". Check YouTube Studio (the account default or a policy hold may have applied).`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// CLI

async function main(argv) {
  const args = parseArgs(argv, { booleans: ['dryRun', 'force', 'setThumbnail', 'checkAuth', 'listCategories', 'help'] });
  if (args.help || (!args.id && !args.checkAuth && !args.listCategories)) {
    console.log(`Usage:
  node social/publish/youtube.mjs --id <calendar id> [--dry-run] [--privacy public|unlisted|private] [--force]
  node social/publish/youtube.mjs --set-thumbnail --id <calendar id>
  node social/publish/youtube.mjs --check-auth
  node social/publish/youtube.mjs --list-categories [--region IN]`);
    return args.help ? 0 : 2;
  }
  if (args.privacy && !PRIVACY.includes(args.privacy)) {
    console.error(`--privacy must be one of ${PRIVACY.join(', ')}`);
    return 2;
  }
  const ctx = makeContext();
  if (args.checkAuth) {
    const cfg = youtubeConfig(ctx.env);
    const token = await getAccessToken(ctx, cfg);
    const ch = await getMyChannel(ctx, token);
    console.log(`Refresh token works for channel "${ch.snippet?.title}" (${ch.id}), ${ch.statistics?.subscriberCount ?? '?'} subscribers.`);
    const granted = ctx._ytToken.scope.split(' ').filter(Boolean);
    const missing = SCOPES.filter((s) => !granted.includes(s) && !(s.endsWith('youtube.upload') && granted.includes('https://www.googleapis.com/auth/youtube')));
    console.log(`Granted scopes: ${granted.join(' ') || '(not reported)'}`);
    if (missing.length && granted.length) console.log(`Missing (optional features may not work): ${missing.join(' ')}`);
    return 0;
  }
  if (args.listCategories) {
    const cfg = youtubeConfig(ctx.env);
    const token = await getAccessToken(ctx, cfg);
    const { data } = await ytRequest(ctx, build.categories(token, args.region || 'IN'));
    for (const c of data?.items ?? []) console.log(`${c.id.padStart(3)}  ${c.snippet?.title}${c.snippet?.assignable ? '' : '  (not assignable)'}`);
    return 0;
  }
  if (args.setThumbnail) {
    const paths = defaultPaths();
    const entry = await loadEntry(String(args.id), paths);
    const rec = publishedRecord(await loadPosted(paths.posted), entry.id, PLATFORM);
    if (!rec?.videoId) {
      console.error(`No published YouTube video for ${entry.id} in social/posted.json`);
      return 1;
    }
    const cfg = youtubeConfig(ctx.env);
    const token = await getAccessToken(ctx, cfg);
    const t = await setThumbnail(ctx, token, rec.videoId, mediaPaths(entry, paths).coverPath);
    console.log(`thumbnail ${t.thumbnail}${t.note ? `: ${t.note}` : ''}`);
    return t.thumbnail === 'set' ? 0 : 1;
  }
  const { runPost } = await import('./lib/run.mjs');
  const { results, exitCode, dryRunOutput } = await runPost({ id: String(args.id), platforms: ['youtube'], dryRun: Boolean(args.dryRun), force: Boolean(args.force), privacy: args.privacy });
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
