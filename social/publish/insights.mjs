#!/usr/bin/env node
// Pull per-post metrics and follower counts for everything in social/posted.json, write
// social/insights/<YYYY-MM-DD>.json (IST date) and print a short table.
//
//   node social/publish/insights.mjs [--days 30] [--platforms instagram,youtube] [--no-analytics] [--out <file>] [--dry-run]
//
// Instagram (graph.instagram.com, needs instagram_business_manage_insights):
//   GET /<media>?fields=permalink,timestamp,like_count,comments_count
//   GET /<media>/insights?metric=views,reach,likes,comments,saved,shares,total_interactions,ig_reels_avg_watch_time
//   GET /<media>/insights?metric=follows,profile_visits   (documented for FEED/STORY only; tried, ignored if refused)
//   GET /me?fields=username,followers_count,follows_count,media_count
// YouTube:
//   Data API videos.list part=statistics (views, likes, comments; 1 unit per 50 videos) and channels.list (subscribers).
//   Optional YouTube Analytics API (needs the yt-analytics.readonly scope): shares, subscribersGained,
//   averageViewDuration, averageViewPercentage, estimatedMinutesWatched. Skipped with a note if not granted.

import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { makeContext, request, parseArgs, describeError, defaultPaths, loadPosted, writeJsonAtomic, istDate, rel } from './lib/common.mjs';
import * as ig from './instagram.mjs';
import * as yt from './youtube.mjs';

export const IG_REEL_METRICS = ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'ig_reels_avg_watch_time'];
export const IG_REEL_METRICS_MIN = ['views', 'reach', 'saved', 'shares'];
export const IG_OPTIONAL_METRICS = ['follows', 'profile_visits'];
export const YT_ANALYTICS_METRICS = ['views', 'likes', 'comments', 'shares', 'subscribersGained', 'averageViewDuration', 'averageViewPercentage', 'estimatedMinutesWatched'];
export const YT_ANALYTICS_METRICS_MIN = ['views', 'likes', 'comments', 'subscribersGained', 'averageViewDuration'];

const igReq = (ctx, r) => request(ctx, { platform: 'instagram', classify: ig.classifyGraphError, ...r });
const ytReq = (ctx, r) => request(ctx, { platform: 'youtube', classify: yt.classifyGoogleError, ...r });
const igUrl = (cfg, path) => `https://${cfg.host}/${cfg.version}/${path}`;
const igAuth = (cfg) => (cfg.proxyAuth ? {} : { Authorization: `Bearer ${cfg.token}` });

function insightValues(data) {
  const out = {};
  for (const m of data?.data ?? []) out[m.name] = m.total_value?.value ?? m.values?.[0]?.value ?? null;
  return out;
}

export async function instagramAccount(ctx, cfg) {
  const id = cfg.host === 'graph.instagram.com' ? 'me' : cfg.userId;
  const { data } = await igReq(ctx, { url: igUrl(cfg, `${id}?fields=username,followers_count,follows_count,media_count`), headers: igAuth(cfg), label: 'GET account' });
  return { username: data?.username ?? null, followers: data?.followers_count ?? null, following: data?.follows_count ?? null, mediaCount: data?.media_count ?? null };
}

export async function instagramPostMetrics(ctx, cfg, mediaId) {
  const metrics = {};
  const notes = [];
  const { data: f } = await igReq(ctx, { url: igUrl(cfg, `${mediaId}?fields=permalink,timestamp,like_count,comments_count`), headers: igAuth(cfg), label: 'GET media' });
  metrics.likes = f?.like_count ?? null;
  metrics.comments = f?.comments_count ?? null;
  const get = (list) => igReq(ctx, { url: igUrl(cfg, `${mediaId}/insights?metric=${list.join(',')}`), headers: igAuth(cfg), label: 'GET media insights' });
  let ins;
  try {
    ins = insightValues((await get(IG_REEL_METRICS)).data);
  } catch (e) {
    if (e.kind !== 'invalid') throw e;
    notes.push(`full metric set refused (${e.message}); used ${IG_REEL_METRICS_MIN.join(',')}`);
    ins = insightValues((await get(IG_REEL_METRICS_MIN)).data);
  }
  try {
    Object.assign(ins, insightValues((await get(IG_OPTIONAL_METRICS)).data));
  } catch {
    // follows/profile_visits are documented for FEED and STORY only; fine if Reels refuse them.
  }
  Object.assign(metrics, {
    views: ins.views ?? null,
    reach: ins.reach ?? null,
    likes: ins.likes ?? metrics.likes,
    comments: ins.comments ?? metrics.comments,
    saves: ins.saved ?? null,
    shares: ins.shares ?? null,
    totalInteractions: ins.total_interactions ?? null,
    avgWatchTimeMs: ins.ig_reels_avg_watch_time ?? null,
    follows: ins.follows ?? null,
    profileVisits: ins.profile_visits ?? null,
  });
  return { metrics, permalink: f?.permalink ?? null, notes };
}

export async function youtubeChannelStats(ctx, token) {
  const ch = await yt.getMyChannel(ctx, token);
  const s = ch.statistics ?? {};
  const num = (v) => (v == null ? null : Number(v));
  return { channelId: ch.id, title: ch.snippet?.title ?? null, subscribers: s.hiddenSubscriberCount ? null : num(s.subscriberCount), views: num(s.viewCount), videos: num(s.videoCount) };
}

export async function youtubeVideoStats(ctx, token, ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { data } = await ytReq(ctx, { url: `${yt.API}/videos?part=statistics,status&id=${chunk.join(',')}`, headers: { Authorization: `Bearer ${token}` }, label: 'GET videos statistics' });
    for (const v of data?.items ?? []) {
      const s = v.statistics ?? {};
      out[v.id] = { views: Number(s.viewCount ?? 0), likes: s.likeCount != null ? Number(s.likeCount) : null, comments: s.commentCount != null ? Number(s.commentCount) : null, privacyStatus: v.status?.privacyStatus ?? null };
    }
  }
  return out;
}

export async function youtubeAnalytics(ctx, token, ids, startDate, endDate) {
  const q = (metrics) =>
    ytReq(ctx, {
      url: `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&metrics=${metrics.join(',')}&dimensions=video&filters=video==${ids.join(',')}&maxResults=200`,
      headers: { Authorization: `Bearer ${token}` },
      label: 'GET youtubeAnalytics reports',
    });
  let res;
  try {
    res = await q(YT_ANALYTICS_METRICS);
  } catch (e) {
    if (e.kind !== 'invalid') throw e;
    res = await q(YT_ANALYTICS_METRICS_MIN);
  }
  const cols = (res.data?.columnHeaders ?? []).map((c) => c.name);
  const out = {};
  for (const row of res.data?.rows ?? []) {
    const o = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
    out[o.video] = o;
  }
  return out;
}

export async function collectInsights({ days = 30, platforms = ['instagram', 'youtube'], analytics = true, paths = defaultPaths(), deps = {} } = {}) {
  const ctx = makeContext(deps);
  const now = ctx.now();
  const since = new Date(now.getTime() - days * 86_400_000);
  const log = await loadPosted(paths.posted);
  const posts = log.posts.filter((r) => r.status === 'published' && platforms.includes(r.platform) && new Date(r.postedAt ?? r.startedAt) >= since);
  const report = { generatedAt: now.toISOString(), date: istDate(now), windowDays: days, accounts: {}, posts: [], notes: [] };

  if (platforms.includes('instagram')) {
    try {
      const cfg = ig.instagramConfig(ctx.env);
      if (cfg.host !== 'graph.instagram.com' && !cfg.userId) cfg.userId = await ig.resolveUserId(ctx, cfg);
      report.accounts.instagram = await instagramAccount(ctx, cfg);
      for (const p of posts.filter((x) => x.platform === 'instagram' && x.mediaId)) {
        const row = { id: p.id, platform: 'instagram', url: p.url ?? null, postedAt: p.postedAt ?? null };
        try {
          const m = await instagramPostMetrics(ctx, cfg, p.mediaId);
          Object.assign(row, { metrics: m.metrics, url: row.url ?? m.permalink });
          if (m.notes.length) row.notes = m.notes;
        } catch (e) {
          row.error = e.toJSON?.() ?? String(e);
        }
        report.posts.push(row);
      }
    } catch (e) {
      report.accounts.instagram = { error: e.toJSON?.() ?? String(e) };
    }
  }

  if (platforms.includes('youtube')) {
    try {
      const cfg = yt.youtubeConfig(ctx.env);
      const token = await yt.getAccessToken(ctx, cfg);
      report.accounts.youtube = await youtubeChannelStats(ctx, token);
      const ytPosts = posts.filter((x) => x.platform === 'youtube' && x.videoId);
      const ids = ytPosts.map((p) => p.videoId);
      const stats = ids.length ? await youtubeVideoStats(ctx, token, ids) : {};
      let ana = {};
      if (analytics && ids.length) {
        const start = istDate(new Date(Math.min(...ytPosts.map((p) => new Date(p.postedAt ?? p.startedAt).getTime()))));
        try {
          ana = await youtubeAnalytics(ctx, token, ids.slice(0, 500), start, istDate(now));
        } catch (e) {
          report.notes.push(`YouTube Analytics skipped: ${e.message}${e.kind === 'permission' || e.kind === 'auth' ? ' (add the yt-analytics.readonly scope to the refresh token to enable it)' : ''}`);
        }
      }
      for (const p of ytPosts) {
        const s = stats[p.videoId];
        const a = ana[p.videoId];
        const row = { id: p.id, platform: 'youtube', url: p.url ?? `https://youtube.com/shorts/${p.videoId}`, postedAt: p.postedAt ?? null };
        if (!s) row.error = { kind: 'not_found', message: 'video not returned by videos.list (deleted or private to this token?)' };
        else {
          row.metrics = { views: s.views, likes: s.likes, comments: s.comments, shares: a?.shares ?? null, subscribersGained: a?.subscribersGained ?? null, avgViewDurationSec: a?.averageViewDuration ?? null, avgViewPercentage: a?.averageViewPercentage ?? null, minutesWatched: a?.estimatedMinutesWatched ?? null };
          row.privacyStatus = s.privacyStatus;
        }
        report.posts.push(row);
      }
    } catch (e) {
      report.accounts.youtube = { error: e.toJSON?.() ?? String(e) };
    }
  }
  return report;
}

export function formatTable(report) {
  const cols = [
    ['post', (r) => r.id],
    ['plat', (r) => (r.platform === 'instagram' ? 'IG' : 'YT')],
    ['views', (r) => r.metrics?.views],
    ['reach', (r) => r.metrics?.reach],
    ['likes', (r) => r.metrics?.likes],
    ['comm', (r) => r.metrics?.comments],
    ['saves', (r) => r.metrics?.saves],
    ['shares', (r) => r.metrics?.shares],
    ['follows', (r) => r.metrics?.follows ?? r.metrics?.subscribersGained],
  ];
  const rows = report.posts.map((r) => cols.map(([, f]) => (r.error ? (f === cols[0][1] || f === cols[1][1] ? f(r) : '!') : (f(r) ?? '-'))).map(String));
  const head = cols.map(([h]) => h);
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => (i < 2 ? c.padEnd(w[i]) : c.padStart(w[i]))).join('  ');
  const out = [];
  const a = report.accounts;
  if (a.instagram) out.push(a.instagram.error ? `Instagram: error: ${a.instagram.error.message ?? a.instagram.error}` : `Instagram @${a.instagram.username}: ${a.instagram.followers ?? '?'} followers, ${a.instagram.mediaCount ?? '?'} posts`);
  if (a.youtube) out.push(a.youtube.error ? `YouTube: error: ${a.youtube.error.message ?? a.youtube.error}` : `YouTube "${a.youtube.title}": ${a.youtube.subscribers ?? 'hidden'} subscribers, ${a.youtube.videos ?? '?'} videos`);
  out.push('', line(head), line(w.map((n) => '-'.repeat(n))), ...rows.map(line));
  if (!rows.length) out.push('(no published posts in the window)');
  for (const n of report.notes) out.push(`note: ${n}`);
  if (report.posts.some((r) => r.error)) out.push('! = metrics unavailable for that post; see the JSON file for the error');
  return out.join('\n');
}

async function main(argv) {
  const args = parseArgs(argv, { booleans: ['dryRun', 'noAnalytics', 'help'] });
  if (args.help) {
    console.log('Usage: node social/publish/insights.mjs [--days 30] [--platforms instagram,youtube] [--no-analytics] [--out <file>] [--dry-run]');
    return 0;
  }
  const paths = defaultPaths();
  const platforms = args.platforms ? String(args.platforms).split(',').map((s) => s.trim()) : ['instagram', 'youtube'];
  const days = Number(args.days) || 30;
  if (args.dryRun) {
    const log = await loadPosted(paths.posted);
    const n = log.posts.filter((r) => r.status === 'published' && platforms.includes(r.platform)).length;
    console.log(`DRY RUN: would query metrics for up to ${n} published post(s) from the last ${days} days on ${platforms.join(', ')}`);
    console.log(`  Instagram: GET /<media>?fields=permalink,timestamp,like_count,comments_count; GET /<media>/insights?metric=${IG_REEL_METRICS.join(',')}; GET /me?fields=username,followers_count,...`);
    console.log(`  YouTube:   GET videos?part=statistics,status&id=...; GET channels?mine=true; ${args.noAnalytics ? '' : `GET youtubeAnalytics reports metrics=${YT_ANALYTICS_METRICS.join(',')}`}`);
    console.log(`  Output:    ${rel(join(paths.insightsDir, `${istDate()}.json`))}`);
    return 0;
  }
  const report = await collectInsights({ days, platforms, analytics: !args.noAnalytics, paths });
  const outPath = args.out ? resolve(String(args.out)) : join(paths.insightsDir, `${report.date}.json`);
  await writeJsonAtomic(outPath, report);
  console.log(formatTable(report));
  console.log(`\nSaved ${rel(outPath)}`);
  const failed = Object.values(report.accounts).some((a) => a?.error);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(describeError(e));
      process.exit(1);
    },
  );
}
