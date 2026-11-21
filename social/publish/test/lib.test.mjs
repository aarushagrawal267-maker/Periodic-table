import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInstagramCaption, buildYouTubeMeta, normalizeHashtags, tagsLength } from '../lib/text.mjs';
import { probeMp4, checkReelSpec, checkShortsSpec } from '../lib/mp4.mjs';
import { parseArgs, request, PublishError } from '../lib/common.mjs';
import { makeMp4, mockFetch, deps } from './helpers.mjs';

test('hashtags are normalised and de-duplicated', () => {
  assert.deepEqual(normalizeHashtags(['#Chemistry', 'chemistry', '##cbse', 'class 10', '', null]), ['Chemistry', 'cbse', 'class10']);
});

test('instagram caption: appends tags, respects caption tags and the 30-tag cap', () => {
  assert.equal(buildInstagramCaption({ caption: 'Hi #chemistry', hashtags: ['#chemistry', '#cbse'] }), 'Hi #chemistry\n\n#cbse');
  const warnings = [];
  const many = Array.from({ length: 35 }, (_, i) => `t${i}`);
  const c = buildInstagramCaption({ caption: 'x', hashtags: many }, warnings);
  assert.equal((c.match(/#/g) ?? []).length, 30);
  assert.equal(warnings.length, 1);
  assert.throws(() => buildInstagramCaption({ caption: 'a'.repeat(2201) }), (e) => e.kind === 'invalid');
  assert.throws(() => buildInstagramCaption({ caption: '' }), (e) => e.kind === 'config');
});

test('youtube meta: title limit, #Shorts, angle brackets, curated description kept', () => {
  const m = buildYouTubeMeta({ youtubeTitle: 'Na <+> Cl', youtubeDescription: 'Salt.\n\n#chemistry', hashtags: ['#chemistry', '#cbse'] });
  assert.equal(m.title, 'Na + Cl #Shorts');
  assert.equal(m.description, 'Salt.\n\n#chemistry');
  assert.deepEqual(m.tags, ['chemistry', 'cbse']);

  const long = buildYouTubeMeta({ youtubeTitle: 'x'.repeat(120), hashtags: [] });
  assert.equal([...long.title].length, 100);
  assert.match(long.description, /#Shorts/, 'no room in the title, so #Shorts goes in the description');

  const fallback = buildYouTubeMeta({ caption: 'First line\nmore', hashtags: ['#a'] });
  assert.equal(fallback.title, 'First line #Shorts');
  assert.match(fallback.description, /#a$/);

  const already = buildYouTubeMeta({ youtubeTitle: 'Guess it #Shorts', hashtags: [] });
  assert.equal(already.title, 'Guess it #Shorts');
});

test('youtube tags stay under 500 characters', () => {
  const warnings = [];
  const m = buildYouTubeMeta({ youtubeTitle: 't', hashtags: Array.from({ length: 60 }, (_, i) => `tagnumber${i}`) }, warnings);
  assert.ok(tagsLength(m.tags) <= 500);
  assert.ok(warnings.some((w) => /500/.test(w)));
  assert.equal(tagsLength(['a b', 'c']), 5 + 1 + 1);
});

test('mp4 probe reads duration, size, codecs and faststart', () => {
  const info = probeMp4(makeMp4({ durationSec: 21.5 }));
  assert.equal(info.durationSec, 21.5);
  assert.equal(info.width, 1080);
  assert.equal(info.height, 1920);
  assert.equal(info.videoCodec, 'avc1');
  assert.equal(info.audioCodec, 'mp4a');
  assert.equal(info.faststart, true);
  assert.deepEqual(checkReelSpec(info, 5e6), { errors: [], warnings: [] });
  assert.deepEqual(checkShortsSpec(info).warnings, []);

  const slow = probeMp4(makeMp4({ moovFirst: false }));
  assert.equal(slow.faststart, false);
  assert.ok(checkReelSpec(slow, 1).warnings.some((w) => /faststart/.test(w)));

  const wide = probeMp4(makeMp4({ width: 1920, height: 1080, durationSec: 200 }));
  assert.equal(checkShortsSpec(wide).warnings.length, 2);
  assert.ok(probeMp4(Buffer.from('not a video at all')).error);
  assert.ok(checkReelSpec(probeMp4(makeMp4()), 301 * 1024 * 1024).errors.length);
});

test('parseArgs handles flags, values and kebab-case', () => {
  assert.deepEqual(parseArgs(['--id', 'x', '--dry-run', '--platforms=instagram', '--force'], { booleans: ['dryRun', 'force'] }), { _: [], id: 'x', dryRun: true, platforms: 'instagram', force: true });
});

test('request: retries 429 honouring Retry-After, gives up after max', async () => {
  const waits = [];
  const fetch = mockFetch([{ url: 'x.test', reply: { status: 429, headers: { 'Retry-After': '7' }, json: {} } }]);
  const d = deps({}, fetch, { sleep: async (ms) => waits.push(ms), retries: 2 });
  await assert.rejects(request({ ...d, retries: 2 }, { url: 'https://x.test/', platform: 't' }), PublishError);
  assert.equal(fetch.calls.length, 3);
  assert.deepEqual(waits, [7000, 7000]);
});
