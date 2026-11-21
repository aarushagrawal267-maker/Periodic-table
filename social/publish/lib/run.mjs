// Orchestrates posting one calendar entry to one or more platforms, with social/posted.json
// as the idempotency log. Used by post.mjs and by the per-platform CLIs.
//
// posted.json: { "version": 1, "posts": [ record, ... ] }, one record per attempt:
//   { id, platform, status, startedAt, postedAt?, url?, mediaId? | videoId?, containerId?,
//     privacyStatus?, thumbnail?, duplicateOf?, warnings?, error? }
//   status: "in_progress" -> written before anything irreversible; replaced when the attempt ends
//           "published"   -> live; this (id, platform) is never posted again unless --force
//           "failed"      -> definitely not live; the next run may retry
//           "unknown"     -> may or may not be live; blocks automatic retries until a human checks

import { PublishError, defaultPaths, loadEntry, mediaPaths, loadPosted, writeJsonAtomic, findRecords, publishedRecord, makeContext, describeError, fileSize } from './common.mjs';
import { buildInstagramCaption, buildYouTubeMeta } from './text.mjs';
import * as instagram from '../instagram.mjs';
import * as youtube from '../youtube.mjs';

export const PLATFORMS = ['instagram', 'youtube'];

function summaryLine(r) {
  const tag = `[${r.platform}] ${r.id}`;
  if (r.status === 'published') return `${tag}: published ${r.url ?? r.mediaId ?? r.videoId ?? ''}${r.duplicate ? ' (already live; not re-posted)' : ''}`;
  if (r.status === 'skipped') return `${tag}: skipped, ${r.reason}`;
  if (r.status === 'dry-run') return `${tag}: dry run OK${r.warnings?.length ? `, ${r.warnings.length} warning(s)` : ''}`;
  return `${tag}: ${r.status.toUpperCase()} ${r.error ? describeError(r.error) : ''}`;
}

/**
 * Post one entry. Returns { results, exitCode, dryRunOutput? }.
 * exitCode: 0 all good (published / already posted), 1 at least one platform failed.
 */
export async function runPost({ id, entry, platforms, dryRun = false, force = false, privacy, paths = defaultPaths(), deps = {} }) {
  const ctx = makeContext(deps);
  entry ??= await loadEntry(id, paths);
  id = entry.id;
  const wanted = (platforms?.length ? platforms : Array.isArray(entry.platforms) && entry.platforms.length ? entry.platforms : PLATFORMS).map((p) => String(p).trim().toLowerCase());
  const unknown = wanted.filter((p) => !PLATFORMS.includes(p));
  if (unknown.length) throw new PublishError(`Unknown platform(s): ${unknown.join(', ')}`, { kind: 'config' });

  const { videoPath, coverPath } = mediaPaths(entry, paths);
  const log = await loadPosted(paths.posted);
  const save = () => (dryRun ? Promise.resolve() : writeJsonAtomic(paths.posted, log));
  const results = [];
  const dryRunOutput = [];

  for (const platform of wanted) {
    const res = { id, platform };
    results.push(res);
    const done = publishedRecord(log, id, platform);
    if (done && !force) {
      Object.assign(res, { status: 'skipped', reason: `already posted ${done.postedAt ?? ''} ${done.url ?? ''}`.trim(), url: done.url });
      continue;
    }
    const prior = findRecords(log, id, platform);
    const last = prior[prior.length - 1];
    if (last?.status === 'unknown' && !force) {
      Object.assign(res, {
        status: 'failed',
        error: new PublishError(`A previous attempt (${last.startedAt}) may have gone live. Check the ${platform} account, then fix social/posted.json or re-run with --force.`, { platform, kind: 'ambiguous' }),
      });
      continue;
    }

    // Validate content first: a bad caption should fail before anything is sent.
    const warnings = [];
    let publish;
    try {
      if (platform === 'instagram') {
        const caption = buildInstagramCaption(entry, warnings);
        const params = { videoPath, coverPath, caption, videoUrl: entry.videoUrl, coverUrl: entry.coverUrl, thumbOffsetMs: entry.thumbOffsetMs ?? entry.coverOffsetMs, shareToFeed: entry.shareToFeed ?? true };
        publish = (o) => instagram.publishReel(params, o);
      } else {
        const meta = buildYouTubeMeta(entry, warnings);
        const params = { videoPath, coverPath, ...meta, privacyStatus: privacy ?? entry.youtubePrivacy, madeForKids: entry.madeForKids, containsSyntheticMedia: entry.containsSyntheticMedia, defaultLanguage: entry.language ?? 'en' };
        publish = (o) => youtube.uploadShort(params, o);
      }
    } catch (e) {
      Object.assign(res, { status: 'failed', error: e });
      continue;
    }

    if (dryRun) {
      try {
        const out = await publish({ ...deps, dryRun: true });
        dryRunOutput.push({ title: `${platform} ${id}`, plan: out.plan });
        Object.assign(res, { status: 'dry-run', warnings: [...warnings, ...out.warnings], plan: out.plan });
        if (done) res.warnings.push('already posted; a real run would skip this unless --force');
      } catch (e) {
        Object.assign(res, { status: 'failed', error: e });
      }
      continue;
    }

    // Missing credentials: fail fast without writing an attempt to the log.
    try {
      if (platform === 'instagram') instagram.instagramConfig(ctx.env);
      else youtube.youtubeConfig(ctx.env);
    } catch (e) {
      Object.assign(res, { status: 'failed', error: e });
      continue;
    }

    if (!(await fileSize(videoPath))) {
      Object.assign(res, { status: 'failed', error: new PublishError(`Video not rendered yet: ${videoPath}`, { platform, kind: 'config' }) });
      continue;
    }

    // Crash recovery: an interrupted Instagram run may have left a container that went live.
    // (YouTube needs no special case: uploadShort skips titles already on the channel.)
    if (last?.status === 'in_progress' && !force) {
      if (platform === 'instagram' && last.containerId) {
        try {
          const live = await instagram.recoverContainer(deps, last.containerId, last.startedAt);
          if (live) {
            Object.assign(last, { status: 'published', postedAt: live.publishedAt ?? last.startedAt, url: live.permalink, mediaId: live.mediaId, recovered: true });
            await save();
            Object.assign(res, { status: 'published', url: live.permalink, mediaId: live.mediaId, duplicate: true, warnings: ['recovered from an interrupted run'] });
            continue;
          }
        } catch (e) {
          // Could not tell what happened to that container: do not post again on top of it.
          if (e?.kind === 'ambiguous') {
            Object.assign(last, { status: 'unknown', error: e.toJSON() });
            await save();
            Object.assign(res, { status: 'unknown', error: e });
          } else {
            // Transient (network, token): leave the attempt in_progress so the next run checks again.
            Object.assign(res, { status: 'failed', error: e });
          }
          continue;
        }
      }
      Object.assign(last, { status: 'failed', error: { kind: 'interrupted', message: 'run ended before completion; superseded by a later attempt' } });
    }

    const record = { id, platform, status: 'in_progress', startedAt: ctx.now().toISOString() };
    log.posts.push(record);
    await save();
    try {
      const out = await publish({
        ...deps,
        onProgress: async (p) => {
          Object.assign(record, p);
          await save();
        },
      });
      Object.assign(record, {
        status: 'published',
        postedAt: out.publishedAt ?? ctx.now().toISOString(),
        url: out.permalink ?? out.url ?? null,
        ...(platform === 'instagram' ? { mediaId: out.mediaId, containerId: out.containerId ?? record.containerId, uploadMode: out.uploadMode } : { videoId: out.videoId, privacyStatus: out.privacyStatus, thumbnail: out.thumbnail }),
        ...(out.duplicate ? { duplicateOf: 'found already live on the platform; not re-posted' } : {}),
      });
      const allWarnings = [...warnings, ...(out.warnings ?? [])];
      if (allWarnings.length) record.warnings = allWarnings;
      delete record.uploadStarted;
      Object.assign(res, { status: 'published', url: record.url, mediaId: record.mediaId, videoId: record.videoId, duplicate: Boolean(out.duplicate), warnings: allWarnings });
    } catch (e) {
      const ambiguous = e?.kind === 'ambiguous';
      Object.assign(record, { status: ambiguous ? 'unknown' : 'failed', endedAt: ctx.now().toISOString(), error: e?.toJSON ? e.toJSON() : { kind: 'internal', message: String(e?.message ?? e) } });
      delete record.uploadStarted;
      Object.assign(res, { status: ambiguous ? 'unknown' : 'failed', error: e });
    }
    await save();
  }

  for (const r of results) r.summary = summaryLine(r);
  const exitCode = results.some((r) => r.status === 'failed' || r.status === 'unknown') ? 1 : 0;
  return { results, exitCode, dryRunOutput: dryRun ? dryRunOutput : undefined };
}
