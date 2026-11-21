import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishReel, tokenExpiryStatus, refreshLongLivedToken, classifyGraphError, instagramConfig, recoverContainer } from '../instagram.mjs';
import { mockFetch, netError, deps, tempRepo, igHappy, IG_ENV } from './helpers.mjs';

const CAPTION = 'Gallium melts in your hand.\n\n#chemistry';

test('instagram: resumable happy path sends the documented sequence', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch(igHappy());
  const progress = [];
  const r = await publishReel({ videoPath: repo.video(), coverPath: repo.cover(), caption: CAPTION, thumbOffsetMs: 1500 }, { ...deps(IG_ENV, fetch), onProgress: (p) => progress.push(p) });

  assert.equal(r.mediaId, 'M999');
  assert.equal(r.permalink, 'https://www.instagram.com/reel/ABC/');
  assert.equal(r.uploadMode, 'resumable');
  assert.deepEqual(progress, [{ containerId: 'C123' }]);

  const create = fetch.find('POST', /\/media$/)[0];
  assert.match(create.url, /^https:\/\/graph\.instagram\.com\/v27\.0\/17841400000000001\/media$/);
  assert.equal(create.headers.Authorization, 'Bearer IGAAsecret-token');
  assert.deepEqual(JSON.parse(create.body), { media_type: 'REELS', caption: CAPTION, share_to_feed: true, upload_type: 'resumable', thumb_offset: 1500 });

  const up = fetch.find('POST', 'rupload')[0];
  assert.equal(up.url, 'https://rupload.facebook.com/ig-api-upload/v27.0/C123');
  assert.equal(up.headers.Authorization, 'OAuth IGAAsecret-token');
  assert.equal(up.headers.offset, '0');
  assert.equal(Number(up.headers.file_size), up.body.length);

  const pub = fetch.find('POST', 'media_publish');
  assert.equal(pub.length, 1);
  assert.deepEqual(JSON.parse(pub[0].body), { creation_id: 'C123' });
  // The token never travels in a URL.
  assert.ok(fetch.calls.every((c) => !c.url.includes('IGAAsecret')));
  // Order: limit check before container creation, polling before publish.
  const order = fetch.calls.map((c) => (c.url.includes('content_publishing_limit') ? 'limit' : c.url.includes('rupload') ? 'upload' : c.url.includes('media_publish') ? 'publish' : c.url.includes('status_code') ? 'poll' : c.method === 'POST' ? 'create' : 'other'));
  assert.ok(order.indexOf('limit') < order.indexOf('create'));
  assert.ok(order.lastIndexOf('poll') < order.indexOf('publish'));
});

test('instagram: INSTAGRAM_MEDIA_BASE_URL switches to video_url + cover_url', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([{ method: 'HEAD', url: 'cdn.example.org', reply: { status: 200 } }, ...igHappy()]);
  const env = { ...IG_ENV, INSTAGRAM_MEDIA_BASE_URL: 'https://cdn.example.org/social/out/' };
  const r = await publishReel({ videoPath: repo.video(), coverPath: repo.cover(), caption: CAPTION }, deps(env, fetch));
  assert.equal(r.uploadMode, 'video_url');
  const body = JSON.parse(fetch.find('POST', /\/media$/)[0].body);
  assert.equal(body.video_url, 'https://cdn.example.org/social/out/2026-11-23-gallium.mp4');
  assert.equal(body.cover_url, 'https://cdn.example.org/social/out/2026-11-23-gallium.jpg');
  assert.equal(body.upload_type, undefined);
  assert.equal(fetch.find('POST', 'rupload').length, 0);
});

test('instagram: refuses to post when the publishing limit is used up', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([{ method: 'GET', url: /content_publishing_limit/, reply: { json: { data: [{ quota_usage: 100, config: { quota_total: 100, quota_duration: 86400 } }] } } }, ...igHappy()]);
  await assert.rejects(publishReel({ videoPath: repo.video(), coverPath: repo.cover(), caption: CAPTION }, deps(IG_ENV, fetch)), (e) => e.kind === 'rate_limit' && /100\/100/.test(e.message));
  assert.equal(fetch.find('POST', /\/media$/).length, 0);
});

test('instagram: expired token gives an auth error with a fix', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([
    { url: /\/me\?/, reply: { status: 400, json: { error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190, error_subcode: 463, fbtrace_id: 'TR1' } } } },
  ]);
  const env = { INSTAGRAM_ACCESS_TOKEN: 'IGAAold' };
  await assert.rejects(publishReel({ videoPath: repo.video(), caption: CAPTION }, deps(env, fetch)), (e) => e.kind === 'auth' && /expired/.test(e.message) && /SOCIAL_SETUP/.test(e.hint) && e.traceId === 'TR1');
  assert.equal(fetch.calls.length, 1, 'auth errors are not retried');
});

test('instagram: missing permission is classified', () => {
  const e = classifyGraphError(403, { error: { message: '(#10) Application does not have permission for this action', code: 10 } });
  assert.equal(e.kind, 'permission');
  assert.match(e.hint, /instagram_business_content_publish/);
  assert.equal(classifyGraphError(400, { error: { code: 9, error_subcode: 2207042, message: 'max posts' } }).kind, 'rate_limit');
  assert.equal(classifyGraphError(400, { error: { code: 4, message: 'Application request limit reached' } }).kind, 'rate_limit');
  assert.equal(classifyGraphError(500, { error: { code: 2, message: 'Service temporarily unavailable', is_transient: true } }).retriable, true);
});

test('instagram: retries 5xx and network errors on container creation', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([
    { method: 'POST', url: /\/media$/, reply: [{ status: 503, json: { error: { message: 'unavailable', code: 2 } } }, netError(), { json: { id: 'C123' } }] },
    ...igHappy(),
  ]);
  const d = deps(IG_ENV, fetch);
  const r = await publishReel({ videoPath: repo.video(), caption: CAPTION }, d);
  assert.equal(r.mediaId, 'M999');
  assert.equal(fetch.find('POST', /\/media$/).length, 3);
  assert.ok(d.logs.some((l) => /retrying/.test(l)));
});

test('instagram: media_publish network failure is reconciled, not blindly retried (no double post)', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([
    { method: 'POST', url: /media_publish$/, reply: netError('ETIMEDOUT') },
    { method: 'GET', url: /\/C123\?fields=status_code/, reply: [{ json: { status_code: 'FINISHED' } }, { json: { status_code: 'PUBLISHED' } }] },
    { method: 'GET', url: /\/media\?fields=id,caption,timestamp,permalink&limit=5/, reply: { json: { data: [{ id: 'M555', timestamp: '2026-11-23T13:31:00+0000', permalink: 'https://www.instagram.com/reel/XYZ/' }] } } },
    { method: 'GET', url: /\/M555\?fields=id,permalink/, reply: { json: { id: 'M555', permalink: 'https://www.instagram.com/reel/XYZ/' } } },
    ...igHappy(),
  ]);
  const r = await publishReel({ videoPath: repo.video(), caption: CAPTION }, deps(IG_ENV, fetch));
  assert.equal(r.mediaId, 'M555');
  assert.equal(fetch.find('POST', 'media_publish').length, 1, 'publish sent exactly once');
});

test('instagram: unconfirmable publish failure is ambiguous', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([
    { method: 'POST', url: /media_publish$/, reply: netError() },
    { method: 'GET', url: /\/C123\?fields=status_code/, reply: [{ json: { status_code: 'FINISHED' } }, netError()] },
    ...igHappy(),
  ]);
  await assert.rejects(publishReel({ videoPath: repo.video(), caption: CAPTION }, deps(IG_ENV, fetch)), (e) => e.kind === 'ambiguous' && /C123/.test(e.hint));
  assert.equal(fetch.find('POST', 'media_publish').length, 1);
});

test('instagram: container ERROR stops before publish', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([{ method: 'GET', url: /\/C123\?fields=status_code/, reply: { json: { status_code: 'ERROR', status: 'Error: Unsupported audio codec' } } }, ...igHappy()]);
  await assert.rejects(publishReel({ videoPath: repo.video(), caption: CAPTION }, deps(IG_ENV, fetch)), (e) => e.kind === 'media' && /audio codec/.test(e.message));
  assert.equal(fetch.find('POST', 'media_publish').length, 0);
});

test('instagram: upload interruption resumes from bytes_transferred', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([
    { method: 'POST', url: 'rupload', reply: [netError(), { json: { success: true } }] },
    { method: 'GET', url: /\/C123\?fields=video_status/, reply: { json: { video_status: { uploading_phase: { status: 'in_progress', bytes_transferred: 100 } } } } },
    ...igHappy(),
  ]);
  await publishReel({ videoPath: repo.video(), caption: CAPTION }, deps(IG_ENV, fetch));
  const ups = fetch.find('POST', 'rupload');
  assert.equal(ups.length, 2);
  assert.equal(ups[1].headers.offset, '100');
  assert.equal(ups[1].body.length, Number(ups[1].headers.file_size) - 100);
});

test('instagram: skips when the same caption is already live', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([{ method: 'GET', url: /\/media\?fields=id,caption/, reply: { json: { data: [{ id: 'M1', caption: 'Gallium melts in your hand.\n\n#chemistry', permalink: 'https://www.instagram.com/reel/OLD/' }] } } }, ...igHappy()]);
  const r = await publishReel({ videoPath: repo.video(), caption: CAPTION }, deps(IG_ENV, fetch));
  assert.equal(r.duplicate, true);
  assert.equal(r.mediaId, 'M1');
  assert.equal(fetch.find('POST', /\/media$/).length, 0);
});

test('instagram: rejects a video outside the Reels spec before any upload', async () => {
  const { makeMp4 } = await import('./helpers.mjs');
  const { writeFile } = await import('node:fs/promises');
  const repo = await tempRepo();
  await writeFile(repo.video(), makeMp4({ durationSec: 2 }));
  const fetch = mockFetch(igHappy());
  await assert.rejects(publishReel({ videoPath: repo.video(), caption: CAPTION }, deps(IG_ENV, fetch)), (e) => e.kind === 'media' && /minimum is 3s/.test(e.message));
  assert.equal(fetch.calls.length, 0);
});

test('instagram: dry run with no env makes no requests and keeps secrets out of the plan', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([]);
  const r = await publishReel({ videoPath: repo.video(), coverPath: repo.cover(), caption: CAPTION }, { ...deps({}, fetch), dryRun: true });
  assert.equal(fetch.calls.length, 0);
  assert.equal(r.dryRun, true);
  const create = r.plan.find((s) => s.label?.includes('create'));
  assert.equal(create.headers.Authorization, 'Bearer <INSTAGRAM_ACCESS_TOKEN>');
  assert.equal(JSON.parse(create.body).media_type, 'REELS');
  assert.ok(r.warnings.some((w) => /cover .* not used on Instagram/.test(w)));

  const withToken = await publishReel({ videoPath: repo.video(), caption: CAPTION }, { ...deps(IG_ENV, fetch), dryRun: true });
  assert.ok(!JSON.stringify(withToken.plan).includes('IGAAsecret'), 'real token is redacted in plans');
});

test('instagram: token expiry warnings', () => {
  const now = new Date('2026-11-23T00:00:00Z');
  assert.equal(tokenExpiryStatus({}, now).level, 'unknown');
  assert.equal(tokenExpiryStatus({ INSTAGRAM_TOKEN_EXPIRES_AT: '2026-12-01' }, now).level, 'warn');
  assert.equal(tokenExpiryStatus({ INSTAGRAM_TOKEN_EXPIRES_AT: '2027-01-20' }, now).level, 'ok');
  assert.equal(tokenExpiryStatus({ INSTAGRAM_TOKEN_EXPIRES_AT: '2026-11-01' }, now).level, 'expired');
});

test('instagram: refresh_access_token returns the new expiry', async () => {
  const fetch = mockFetch([{ url: /graph\.instagram\.com\/refresh_access_token\?grant_type=ig_refresh_token&access_token=IGAAsecret-token/, reply: { json: { access_token: 'IGAAnew', token_type: 'bearer', expires_in: 5184000 } } }]);
  const r = await refreshLongLivedToken(deps(IG_ENV, fetch));
  assert.equal(r.changed, true);
  assert.equal(r.expiresAt.toISOString().slice(0, 10), '2027-01-22');
});

test('instagram: Facebook Login tokens route to graph.facebook.com', () => {
  assert.equal(instagramConfig({ INSTAGRAM_ACCESS_TOKEN: 'EAAxyz' }).host, 'graph.facebook.com');
  assert.equal(instagramConfig({ INSTAGRAM_ACCESS_TOKEN: 'IGAAxyz' }).host, 'graph.instagram.com');
  assert.throws(() => instagramConfig({}), (e) => e.kind === 'config');
});

test('instagram: recoverContainer adopts a container that went live', async () => {
  const fetch = mockFetch([
    { url: /\/C9\?fields=status_code/, reply: { json: { status_code: 'PUBLISHED' } } },
    { url: /\/media\?fields=id,caption,timestamp,permalink&limit=5/, reply: { json: { data: [{ id: 'M9', timestamp: '2026-11-23T13:00:00+0000', permalink: 'https://www.instagram.com/reel/R9/' }] } } },
  ]);
  const r = await recoverContainer(deps(IG_ENV, fetch), 'C9', '2026-11-23T12:59:00Z');
  assert.deepEqual(r, { mediaId: 'M9', permalink: 'https://www.instagram.com/reel/R9/', publishedAt: '2026-11-23T13:00:00+0000' });
});

test('instagram: network-secret mode sends no Authorization header', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch(igHappy());
  const r = await publishReel({ videoPath: repo.video(), caption: CAPTION }, deps({ INSTAGRAM_ACCESS_TOKEN: 'network-secret' }, fetch));
  assert.equal(r.mediaId, 'M999');
  assert.ok(fetch.calls.every((c) => !('Authorization' in c.headers)));
  await assert.rejects(refreshLongLivedToken(deps({ INSTAGRAM_ACCESS_TOKEN: 'network-secret' }, fetch)), (e) => e.kind === 'config');
});
