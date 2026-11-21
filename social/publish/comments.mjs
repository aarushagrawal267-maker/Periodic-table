#!/usr/bin/env node
// Fetch recent comments on our posts (both platforms) so a session can draft replies, and send
// a reply ONLY when explicitly asked.
//
//   node social/publish/comments.mjs [--days 14] [--platforms instagram,youtube] [--out <file>]
//       -> writes social/insights/comments-<YYYY-MM-DD>.json and lists comments still needing a reply
//   node social/publish/comments.mjs --reply --platform instagram|youtube --comment <comment id> --text "..." [--dry-run]
//
// Instagram needs instagram_business_manage_comments. YouTube reading needs youtube.force-ssl or
// youtube.readonly; replying needs youtube.force-ssl and costs 50 quota units.

import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { makeContext, request, parseArgs, describeError, defaultPaths, loadPosted, writeJsonAtomic, istDate, rel, printPlan } from './lib/common.mjs';
import * as ig from './instagram.mjs';
import * as yt from './youtube.mjs';

const igReq = (ctx, r) => request(ctx, { platform: 'instagram', classify: ig.classifyGraphError, ...r });
const ytReq = (ctx, r) => request(ctx, { platform: 'youtube', classify: yt.classifyGoogleError, ...r });
const igUrl = (cfg, path) => `https://${cfg.host}/${cfg.version}/${path}`;
const igAuth = (cfg) => (cfg.proxyAuth ? {} : { Authorization: `Bearer ${cfg.token}` });

const IG_COMMENT_FIELDS = 'id,text,username,timestamp,like_count,replies{id,text,username,timestamp}';

export async function listInstagramComments(ctx, cfg, mediaId, { maxPages = 4 } = {}) {
  const out = [];
  let url = igUrl(cfg, `${mediaId}/comments?fields=${encodeURIComponent(IG_COMMENT_FIELDS)}&limit=50`);
  for (let page = 0; url && page < maxPages; page++) {
    const { data } = await igReq(ctx, { url, headers: igAuth(cfg), label: 'GET comments' });
    for (const c of data?.data ?? []) {
      out.push({ commentId: c.id, author: c.username ?? null, text: c.text ?? '', at: c.timestamp ?? null, likes: c.like_count ?? null, replies: (c.replies?.data ?? []).map((r) => ({ commentId: r.id, author: r.username ?? null, text: r.text ?? '', at: r.timestamp ?? null })) });
    }
    url = data?.paging?.next ?? null;
  }
  return out;
}

export async function listYouTubeComments(ctx, token, videoId, { maxPages = 3 } = {}) {
  const out = [];
  let pageToken = '';
  for (let page = 0; page < maxPages; page++) {
    const { data } = await ytReq(ctx, {
      url: `${yt.API}/commentThreads?part=snippet,replies&videoId=${encodeURIComponent(videoId)}&maxResults=100&order=time&textFormat=plainText${pageToken ? `&pageToken=${pageToken}` : ''}`,
      headers: { Authorization: `Bearer ${token}` },
      label: 'GET commentThreads',
    });
    for (const t of data?.items ?? []) {
      const top = t.snippet?.topLevelComment;
      const s = top?.snippet ?? {};
      out.push({
        commentId: top?.id ?? t.id,
        author: s.authorDisplayName ?? null,
        authorChannelId: s.authorChannelId?.value ?? null,
        text: s.textDisplay ?? s.textOriginal ?? '',
        at: s.publishedAt ?? null,
        likes: s.likeCount ?? null,
        replyCount: t.snippet?.totalReplyCount ?? 0,
        replies: (t.replies?.comments ?? []).map((r) => ({ commentId: r.id, author: r.snippet?.authorDisplayName ?? null, authorChannelId: r.snippet?.authorChannelId?.value ?? null, text: r.snippet?.textDisplay ?? '', at: r.snippet?.publishedAt ?? null })),
      });
    }
    pageToken = data?.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

/** Reply to an Instagram comment. Not idempotent, so never retried automatically. */
export async function replyInstagram(commentId, message, opts = {}) {
  const ctx = makeContext(opts);
  const cfg = ig.instagramConfig(ctx.env, { dryRun: opts.dryRun });
  const req = { method: 'POST', url: igUrl(cfg, `${commentId}/replies`), headers: { ...igAuth(cfg), 'Content-Type': 'application/json' }, body: JSON.stringify({ message }), label: 'POST comment reply' };
  if (opts.dryRun) return { dryRun: true, plan: [{ ...req, headers: { ...req.headers, ...(cfg.proxyAuth ? {} : { Authorization: 'Bearer <INSTAGRAM_ACCESS_TOKEN>' }) } }] };
  const { data } = await igReq(ctx, { ...req, retry: false });
  return { platform: 'instagram', replyId: data?.id ?? null };
}

/** Reply to a YouTube top-level comment (parentId). Not idempotent, so never retried automatically. */
export async function replyYouTube(parentId, text, opts = {}) {
  const ctx = makeContext(opts);
  const cfg = yt.youtubeConfig(ctx.env, { dryRun: opts.dryRun });
  const body = JSON.stringify({ snippet: { parentId, textOriginal: text } });
  const mk = (t) => ({ method: 'POST', url: `${yt.API}/comments?part=snippet`, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body, label: 'POST comments.insert' });
  if (opts.dryRun) return { dryRun: true, plan: [{ ...yt.build.token(cfg), body: '(refresh-token exchange)' }, mk('<ACCESS_TOKEN>')] };
  const token = await yt.getAccessToken(ctx, cfg);
  const { data } = await ytReq(ctx, { ...mk(token), retry: false });
  return { platform: 'youtube', replyId: data?.id ?? null };
}

export async function collectComments({ days = 14, platforms = ['instagram', 'youtube'], paths = defaultPaths(), deps = {} } = {}) {
  const ctx = makeContext(deps);
  const now = ctx.now();
  const since = new Date(now.getTime() - days * 86_400_000);
  const posts = (await loadPosted(paths.posted)).posts.filter((r) => r.status === 'published' && platforms.includes(r.platform) && new Date(r.postedAt ?? r.startedAt) >= since);
  const report = { generatedAt: now.toISOString(), windowDays: days, posts: [], errors: [] };

  if (platforms.includes('instagram') && posts.some((p) => p.platform === 'instagram')) {
    try {
      const cfg = ig.instagramConfig(ctx.env);
      const me = (await igReq(ctx, ig.build.me(cfg))).data ?? {};
      for (const p of posts.filter((x) => x.platform === 'instagram' && x.mediaId)) {
        const comments = await listInstagramComments(ctx, cfg, p.mediaId);
        for (const c of comments) c.needsReply = c.author !== me.username && !c.replies.some((r) => r.author === me.username);
        report.posts.push({ id: p.id, platform: 'instagram', url: p.url, mediaId: p.mediaId, comments });
      }
    } catch (e) {
      report.errors.push({ platform: 'instagram', ...(e.toJSON?.() ?? { message: String(e) }) });
    }
  }
  if (platforms.includes('youtube') && posts.some((p) => p.platform === 'youtube')) {
    try {
      const cfg = yt.youtubeConfig(ctx.env);
      const token = await yt.getAccessToken(ctx, cfg);
      const channelId = (await yt.getMyChannel(ctx, token)).id;
      for (const p of posts.filter((x) => x.platform === 'youtube' && x.videoId)) {
        const comments = await listYouTubeComments(ctx, token, p.videoId);
        for (const c of comments) c.needsReply = c.authorChannelId !== channelId && !c.replies.some((r) => r.authorChannelId === channelId);
        report.posts.push({ id: p.id, platform: 'youtube', url: p.url, videoId: p.videoId, comments });
      }
    } catch (e) {
      report.errors.push({ platform: 'youtube', ...(e.toJSON?.() ?? { message: String(e) }) });
    }
  }
  return report;
}

async function main(argv) {
  const args = parseArgs(argv, { booleans: ['reply', 'dryRun', 'help'] });
  if (args.help) {
    console.log(`Usage:
  node social/publish/comments.mjs [--days 14] [--platforms instagram,youtube] [--out <file>]
  node social/publish/comments.mjs --reply --platform instagram|youtube --comment <id> --text "..." [--dry-run]`);
    return 0;
  }
  if (args.reply) {
    if (!['instagram', 'youtube'].includes(args.platform) || !args.comment || !args.text || args.text === true) {
      console.error('--reply needs --platform instagram|youtube, --comment <id> and --text "..."');
      return 2;
    }
    const fn = args.platform === 'instagram' ? replyInstagram : replyYouTube;
    const r = await fn(String(args.comment), String(args.text), { dryRun: Boolean(args.dryRun) });
    if (r.dryRun) printPlan(`reply on ${args.platform}`, r.plan);
    else console.log(`Replied on ${r.platform}: ${r.replyId}`);
    return 0;
  }
  const paths = defaultPaths();
  const report = await collectComments({ days: Number(args.days) || 14, platforms: args.platforms ? String(args.platforms).split(',') : undefined, paths });
  const outPath = args.out ? resolve(String(args.out)) : join(paths.insightsDir, `comments-${istDate()}.json`);
  await writeJsonAtomic(outPath, report);
  let pending = 0;
  for (const p of report.posts) {
    for (const c of p.comments.filter((x) => x.needsReply)) {
      pending++;
      console.log(`[${p.platform}] ${p.id}  comment ${c.commentId}  @${c.author}: ${c.text.replace(/\s+/g, ' ').slice(0, 140)}`);
    }
  }
  console.log(`${pending} comment(s) without a reply from us. Saved ${rel(outPath)}`);
  for (const e of report.errors) console.error(`[${e.platform}] ${e.message}${e.hint ? `\n  -> ${e.hint}` : ''}`);
  return report.errors.length ? 1 : 0;
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
