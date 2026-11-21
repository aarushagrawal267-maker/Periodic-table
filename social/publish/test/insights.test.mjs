import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectInsights, formatTable } from '../insights.mjs';
import { collectComments, replyInstagram, replyYouTube } from '../comments.mjs';
import { mockFetch, deps, tempRepo, IG_ENV, YT_ENV } from './helpers.mjs';

const POSTED = {
  version: 1,
  posts: [
    { id: 'p1', platform: 'instagram', status: 'published', postedAt: '2026-11-20T13:30:00Z', mediaId: 'M1', url: 'https://www.instagram.com/reel/A/' },
    { id: 'p1', platform: 'youtube', status: 'published', postedAt: '2026-11-20T13:31:00Z', videoId: 'V1', url: 'https://youtube.com/shorts/V1' },
    { id: 'p0', platform: 'instagram', status: 'failed', startedAt: '2026-11-19T13:30:00Z' },
  ],
};

const token = { method: 'POST', url: 'oauth2', reply: { json: { access_token: 'ya29', expires_in: 3600 } } };
const channel = { url: /\/channels\?/, reply: { json: { items: [{ id: 'UC1', snippet: { title: 'Periodica' }, statistics: { subscriberCount: '120', viewCount: '5000', videoCount: '4' } }] } } };

test('insights: per-post metrics, follower counts, analytics fallback note', async () => {
  const repo = await tempRepo({ posted: POSTED });
  const fetch = mockFetch([
    { url: /\/me\?fields=username,followers_count/, reply: { json: { username: 'periodica.app', followers_count: 310, follows_count: 5, media_count: 12 } } },
    { url: /\/M1\?fields=permalink/, reply: { json: { like_count: 40, comments_count: 3, permalink: 'https://www.instagram.com/reel/A/' } } },
    { url: /\/M1\/insights\?metric=views,reach/, reply: { json: { data: [{ name: 'views', values: [{ value: 1500 }] }, { name: 'reach', values: [{ value: 1200 }] }, { name: 'likes', values: [{ value: 41 }] }, { name: 'saved', values: [{ value: 9 }] }, { name: 'shares', values: [{ value: 4 }] }] } } },
    { url: /\/M1\/insights\?metric=follows/, reply: { status: 400, json: { error: { code: 100, message: 'metric not supported for REELS' } } } },
    token,
    channel,
    { url: /\/videos\?part=statistics/, reply: { json: { items: [{ id: 'V1', statistics: { viewCount: '800', likeCount: '30', commentCount: '2' }, status: { privacyStatus: 'public' } }] } } },
    { url: 'youtubeanalytics', reply: { status: 403, json: { error: { code: 403, message: 'Request had insufficient authentication scopes.', errors: [{ reason: 'insufficientPermissions' }] } } } },
  ]);
  const report = await collectInsights({ paths: repo.paths, deps: deps({ ...IG_ENV, ...YT_ENV }, fetch) });
  assert.equal(report.accounts.instagram.followers, 310);
  assert.equal(report.accounts.youtube.subscribers, 120);
  assert.equal(report.posts.length, 2);
  const igRow = report.posts.find((p) => p.platform === 'instagram');
  assert.deepEqual([igRow.metrics.views, igRow.metrics.reach, igRow.metrics.likes, igRow.metrics.saves, igRow.metrics.shares, igRow.metrics.follows], [1500, 1200, 41, 9, 4, null]);
  const ytRow = report.posts.find((p) => p.platform === 'youtube');
  assert.deepEqual([ytRow.metrics.views, ytRow.metrics.likes, ytRow.metrics.comments], [800, 30, 2]);
  assert.ok(report.notes.some((n) => /yt-analytics\.readonly/.test(n)));
  const table = formatTable(report);
  assert.match(table, /p1\s+IG\s+1500\s+1200/);
  assert.match(table, /120 subscribers/);
});

test('insights: one platform erroring still reports the other', async () => {
  const repo = await tempRepo({ posted: POSTED });
  const fetch = mockFetch([{ url: 'graph.instagram.com', reply: { status: 400, json: { error: { code: 190, message: 'expired' } } } }, token, channel, { url: /\/videos\?part=statistics/, reply: { json: { items: [] } } }]);
  const report = await collectInsights({ paths: repo.paths, analytics: false, deps: deps({ ...IG_ENV, ...YT_ENV }, fetch) });
  assert.equal(report.accounts.instagram.error.kind, 'auth');
  assert.equal(report.accounts.youtube.subscribers, 120);
});

test('comments: lists both platforms and flags ones without our reply', async () => {
  const repo = await tempRepo({ posted: POSTED });
  const fetch = mockFetch([
    { url: /\/me\?fields=user_id/, reply: { json: { user_id: '1', username: 'periodica.app' } } },
    {
      url: /\/M1\/comments/,
      reply: {
        json: {
          data: [
            { id: 'c1', username: 'riya', text: 'Is it chlorine?', timestamp: '2026-11-21T00:00:00+0000', replies: { data: [] } },
            { id: 'c2', username: 'arjun', text: 'Cool', timestamp: '2026-11-21T00:00:00+0000', replies: { data: [{ id: 'r1', username: 'periodica.app', text: 'Thanks!' }] } },
          ],
        },
      },
    },
    token,
    channel,
    { url: /\/commentThreads\?/, reply: { json: { items: [{ id: 't1', snippet: { totalReplyCount: 0, topLevelComment: { id: 'yc1', snippet: { authorDisplayName: 'Meera', authorChannelId: { value: 'UCm' }, textDisplay: 'Nice!' } } } }] } } },
  ]);
  const report = await collectComments({ paths: repo.paths, deps: deps({ ...IG_ENV, ...YT_ENV }, fetch) });
  const ig = report.posts.find((p) => p.platform === 'instagram');
  assert.deepEqual(ig.comments.map((c) => [c.commentId, c.needsReply]), [['c1', true], ['c2', false]]);
  const yt = report.posts.find((p) => p.platform === 'youtube');
  assert.equal(yt.comments[0].needsReply, true);
  assert.equal(fetch.find('POST', 'replies').length + fetch.find('POST', '/comments?').length, 0, 'listing never replies');
});

test('comments: replies are explicit, single-shot calls', async () => {
  const fetch = mockFetch([
    { method: 'POST', url: /\/c1\/replies$/, reply: { json: { id: 'r9' } } },
    token,
    { method: 'POST', url: /\/comments\?part=snippet/, reply: { json: { id: 'yr9' } } },
  ]);
  assert.deepEqual(await replyInstagram('c1', 'Yes, chlorine!', deps(IG_ENV, fetch)), { platform: 'instagram', replyId: 'r9' });
  assert.deepEqual(JSON.parse(fetch.find('POST', 'replies')[0].body), { message: 'Yes, chlorine!' });
  assert.deepEqual(await replyYouTube('yc1', 'Thank you!', deps(YT_ENV, fetch)), { platform: 'youtube', replyId: 'yr9' });
  assert.deepEqual(JSON.parse(fetch.find('POST', '/comments?part=snippet')[0].body), { snippet: { parentId: 'yc1', textOriginal: 'Thank you!' } });

  const dry = await replyInstagram('c1', 'x', { ...deps({}, mockFetch([])), dryRun: true });
  assert.equal(dry.dryRun, true);
});
