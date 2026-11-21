import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { main, dueEntries, entryDay } from '../post.mjs';
import { runPost } from '../lib/run.mjs';
import { mockFetch, deps, tempRepo, igHappy, ytHappy, IG_ENV, YT_ENV, ENTRY } from './helpers.mjs';

const readLog = async (repo) => JSON.parse(await readFile(repo.paths.posted, 'utf8'));

test('post: publishes to both platforms and logs results', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([...igHappy(), ...ytHappy()]);
  const out = [];
  const code = await main(['--id', ENTRY.id], { paths: repo.paths, deps: deps({ ...IG_ENV, ...YT_ENV }, fetch), out: (s) => out.push(s) });
  assert.equal(code, 0);
  const log = await readLog(repo);
  assert.equal(log.version, 1);
  assert.deepEqual(log.posts.map((p) => [p.platform, p.status]), [['instagram', 'published'], ['youtube', 'published']]);
  const [igRec, ytRec] = log.posts;
  assert.equal(igRec.url, 'https://www.instagram.com/reel/ABC/');
  assert.equal(igRec.mediaId, 'M999');
  assert.equal(igRec.containerId, 'C123');
  assert.equal(ytRec.url, 'https://youtube.com/shorts/VID123');
  assert.equal(ytRec.videoId, 'VID123');
  assert.ok(igRec.postedAt && ytRec.postedAt);
  // Caption = calendar caption + normalised hashtags.
  const caption = JSON.parse(fetch.find('POST', /\/media$/)[0].body).caption;
  assert.ok(caption.endsWith('#chemistry #periodictable #gallium'));
  // Title already fits; #Shorts appended.
  assert.equal(JSON.parse(fetch.find('POST', 'uploadType=resumable')[0].body).snippet.title, 'Gallium: the metal that melts in your hand #Shorts');
});

test('post: second run is a no-op (idempotent by id)', async () => {
  const repo = await tempRepo();
  const env = { ...IG_ENV, ...YT_ENV };
  await main(['--id', ENTRY.id], { paths: repo.paths, deps: deps(env, mockFetch([...igHappy(), ...ytHappy()])), out: () => {} });
  const fetch = mockFetch([]);
  const out = [];
  const code = await main(['--id', ENTRY.id], { paths: repo.paths, deps: deps(env, fetch), out: (s) => out.push(s) });
  assert.equal(code, 0);
  assert.equal(fetch.calls.length, 0, 'nothing sent');
  assert.equal(out.filter((l) => /skipped, already posted/.test(l)).length, 2);
  assert.equal((await readLog(repo)).posts.length, 2);
});

test('post: one platform failing does not block the other; exit code 1', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([{ url: 'graph.instagram.com', reply: { status: 400, json: { error: { code: 190, message: 'expired', error_subcode: 463 } } } }, ...ytHappy()]);
  const out = [];
  const code = await main(['--id', ENTRY.id], { paths: repo.paths, deps: deps({ INSTAGRAM_ACCESS_TOKEN: 'IGAAx', ...YT_ENV }, fetch), out: (s) => out.push(s) });
  assert.equal(code, 1);
  const log = await readLog(repo);
  assert.deepEqual(log.posts.map((p) => [p.platform, p.status]), [['instagram', 'failed'], ['youtube', 'published']]);
  assert.equal(log.posts[0].error.kind, 'auth');
  assert.ok(out.some((l) => /\[instagram\].*FAILED/.test(l)));
});

test('post: missing env fails that platform only', async () => {
  const repo = await tempRepo();
  const code = await main(['--id', ENTRY.id, '--platforms', 'youtube'], { paths: repo.paths, deps: deps({}, mockFetch([])), out: () => {} });
  assert.equal(code, 1);
  await assert.rejects(readFile(repo.paths.posted), { code: 'ENOENT' }, 'config errors do not touch the log');
});

test('post: ambiguous result blocks automatic retries until --force', async () => {
  const repo = await tempRepo({
    posted: { version: 1, posts: [{ id: ENTRY.id, platform: 'instagram', status: 'unknown', startedAt: '2026-11-22T13:30:00Z' }] },
  });
  const fetch = mockFetch(igHappy());
  const code = await main(['--id', ENTRY.id, '--platforms', 'instagram'], { paths: repo.paths, deps: deps(IG_ENV, fetch), out: () => {} });
  assert.equal(code, 1);
  assert.equal(fetch.calls.length, 0);
  const forced = await main(['--id', ENTRY.id, '--platforms', 'instagram', '--force'], { paths: repo.paths, deps: deps(IG_ENV, fetch), out: () => {} });
  assert.equal(forced, 0);
});

test('post: interrupted Instagram run whose container went live is adopted, not re-posted', async () => {
  const repo = await tempRepo({
    posted: { version: 1, posts: [{ id: ENTRY.id, platform: 'instagram', status: 'in_progress', startedAt: '2026-11-23T13:00:00Z', containerId: 'C77' }] },
  });
  const fetch = mockFetch([
    { url: /\/C77\?fields=status_code/, reply: { json: { status_code: 'PUBLISHED' } } },
    { url: /\/media\?fields=id,caption,timestamp,permalink&limit=5/, reply: { json: { data: [{ id: 'M77', timestamp: '2026-11-23T13:01:00+0000', permalink: 'https://www.instagram.com/reel/R77/' }] } } },
  ]);
  const code = await main(['--id', ENTRY.id, '--platforms', 'instagram'], { paths: repo.paths, deps: deps(IG_ENV, fetch), out: () => {} });
  assert.equal(code, 0);
  const log = await readLog(repo);
  assert.equal(log.posts.length, 1);
  assert.equal(log.posts[0].status, 'published');
  assert.equal(log.posts[0].mediaId, 'M77');
  assert.equal(fetch.find('POST', '').length, 0, 'no POSTs at all');
});

test('post: dry run with no env prints both plans and writes nothing', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([]);
  const out = [];
  const code = await main(['--id', ENTRY.id, '--dry-run'], { paths: repo.paths, deps: deps({}, fetch), out: (s) => out.push(s) });
  assert.equal(code, 0);
  assert.equal(fetch.calls.length, 0);
  const text = out.join('\n');
  assert.match(text, /DRY RUN: instagram/);
  assert.match(text, /DRY RUN: youtube/);
  assert.match(text, /POST https:\/\/graph\.instagram\.com\/v27\.0\/<INSTAGRAM_USER_ID from step 1>\/media/);
  assert.match(text, /POST https:\/\/www\.googleapis\.com\/upload\/youtube\/v3\/videos\?uploadType=resumable/);
  await assert.rejects(readFile(repo.paths.posted), { code: 'ENOENT' });
});

test('post: unknown id and bad flags are usage errors', async () => {
  const repo = await tempRepo();
  await assert.rejects(runPost({ id: 'nope', paths: repo.paths, deps: deps({}, mockFetch([])) }), (e) => e.kind === 'config');
  assert.equal(await main(['--id', ENTRY.id, '--platforms', 'tiktok'], { paths: repo.paths, deps: deps({}, mockFetch([])), out: () => {} }), 2);
  assert.equal(await main([], { paths: repo.paths, deps: deps({}, mockFetch([])), out: () => {} }), 2);
});

test('post: --due picks rendered, unposted entries whose IST day has come', async () => {
  const entries = [
    { ...ENTRY, id: 'a-old', date: '2026-11-20T19:00:00+05:30' },
    { ...ENTRY, id: 'b-today', date: '2026-11-23' },
    { ...ENTRY, id: 'c-future', date: '2026-11-30T19:00:00+05:30' },
  ];
  const repo = await tempRepo({ entries, posted: { version: 1, posts: [{ id: 'a-old', platform: 'instagram', status: 'published' }, { id: 'a-old', platform: 'youtube', status: 'published' }] } });
  const due = await dueEntries({ paths: repo.paths, today: '2026-11-23', limit: 5 });
  assert.deepEqual(due.map((d) => d.entry.id), ['b-today']);
  assert.equal(entryDay('2026-11-23T19:00:00+05:30'), '2026-11-23');
  assert.equal(entryDay('2026-11-23T20:00:00Z'), '2026-11-24'); // 01:30 IST next day
});
