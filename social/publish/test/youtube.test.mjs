import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadShort, classifyGoogleError, videoResource } from '../youtube.mjs';
import { mockFetch, netError, deps, tempRepo, ytHappy, YT_ENV } from './helpers.mjs';

const META = { title: 'Gallium: the metal that melts in your hand #Shorts', description: 'Gallium melts at 29.8 °C.', tags: ['chemistry', 'periodictable'] };

test('youtube: refresh token -> resumable upload -> thumbnail after processing', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch(ytHappy());
  const progress = [];
  const r = await uploadShort({ videoPath: repo.video(), coverPath: repo.cover(), ...META }, { ...deps(YT_ENV, fetch), onProgress: (p) => progress.push(p) });

  assert.equal(r.videoId, 'VID123');
  assert.equal(r.url, 'https://youtube.com/shorts/VID123');
  assert.equal(r.thumbnail, 'set');
  assert.equal(r.privacyStatus, 'public');
  assert.deepEqual(progress, [{ uploadStarted: true }, { videoId: 'VID123' }]);

  const tok = fetch.find('POST', 'oauth2')[0];
  const form = new URLSearchParams(tok.body);
  assert.equal(form.get('grant_type'), 'refresh_token');
  assert.equal(form.get('refresh_token'), '1//refresh-secret');

  const init = fetch.find('POST', 'uploadType=resumable')[0];
  assert.match(init.url, /part=snippet,status,paidProductPlacementDetails/);
  assert.match(init.url, /notifySubscribers=true/);
  assert.equal(init.headers.Authorization, 'Bearer ya29.access');
  assert.equal(init.headers['X-Upload-Content-Type'], 'video/mp4');
  const body = JSON.parse(init.body);
  assert.equal(body.snippet.categoryId, '27');
  assert.equal(body.snippet.title, META.title);
  assert.deepEqual(body.status, { privacyStatus: 'public', selfDeclaredMadeForKids: false, containsSyntheticMedia: false, embeddable: true, license: 'youtube' });
  assert.deepEqual(body.paidProductPlacementDetails, { hasPaidProductPlacement: false });

  const put = fetch.find('PUT', 'SESSION1')[0];
  assert.equal(Number(init.headers['X-Upload-Content-Length']), put.body.length);
  assert.equal(fetch.find('POST', 'thumbnails/set')[0].headers['Content-Type'], 'image/jpeg');
});

test('youtube: privacy flag and made-for-kids env are honoured', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch(ytHappy());
  await uploadShort({ videoPath: repo.video(), ...META, privacyStatus: 'unlisted' }, deps({ ...YT_ENV, YOUTUBE_MADE_FOR_KIDS: 'true' }, fetch));
  const body = JSON.parse(fetch.find('POST', 'uploadType=resumable')[0].body);
  assert.equal(body.status.privacyStatus, 'unlisted');
  assert.equal(body.status.selfDeclaredMadeForKids, true);
});

test('youtube: invalid_grant explains the 7-day Testing expiry', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([{ method: 'POST', url: 'oauth2', reply: { status: 400, json: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } } }]);
  await assert.rejects(uploadShort({ videoPath: repo.video(), ...META }, deps(YT_ENV, fetch)), (e) => e.kind === 'auth' && /7 days/.test(e.hint));
  assert.equal(fetch.calls.length, 1);
});

test('youtube: interrupted PUT resumes from the 308 Range header', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([
    {
      method: 'PUT',
      url: /upload_id=SESSION1/,
      reply: [
        { status: 503, json: { error: { code: 503, message: 'Backend Error', errors: [{ reason: 'backendError' }] } } },
        { status: 308, headers: { Range: 'bytes=0-999' } },
        { status: 201, json: { id: 'VID123', status: { privacyStatus: 'public', uploadStatus: 'uploaded' } } },
      ],
    },
    ...ytHappy(),
  ]);
  const r = await uploadShort({ videoPath: repo.video(), ...META }, deps(YT_ENV, fetch));
  assert.equal(r.videoId, 'VID123');
  const puts = fetch.find('PUT', 'SESSION1');
  assert.equal(puts.length, 3);
  assert.equal(puts[1].headers['Content-Range'], `bytes */${puts[0].body.length}`);
  assert.equal(puts[2].headers['Content-Range'], `bytes 1000-${puts[0].body.length - 1}/${puts[0].body.length}`);
  assert.equal(puts[2].body.length, puts[0].body.length - 1000);
  assert.equal(fetch.find('POST', 'uploadType=resumable').length, 1, 'no second video created');
});

test('youtube: network drop after the last byte recovers the finished video', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([{ method: 'PUT', url: /upload_id=SESSION1/, reply: [netError(), { status: 200, json: { id: 'VID123', status: { privacyStatus: 'public' } } }] }, ...ytHappy()]);
  const r = await uploadShort({ videoPath: repo.video(), ...META }, deps(YT_ENV, fetch));
  assert.equal(r.videoId, 'VID123');
  assert.equal(fetch.find('POST', 'uploadType=resumable').length, 1);
});

test('youtube: quota exhaustion is terminal and clear', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([
    { method: 'POST', url: 'uploadType=resumable', reply: { status: 403, json: { error: { code: 403, message: 'The request cannot be completed because you have exceeded your quota.', errors: [{ reason: 'quotaExceeded' }] } } } },
    ...ytHappy(),
  ]);
  await assert.rejects(uploadShort({ videoPath: repo.video(), ...META }, deps(YT_ENV, fetch)), (e) => e.kind === 'quota' && /Pacific/.test(e.hint));
  assert.equal(fetch.find('POST', 'uploadType=resumable').length, 1, 'quota errors are not retried');
});

test('youtube: skips upload when the title is already on the channel', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch(ytHappy({ existingTitles: [META.title] }));
  const r = await uploadShort({ videoPath: repo.video(), ...META }, deps(YT_ENV, fetch));
  assert.equal(r.duplicate, true);
  assert.equal(fetch.find('POST', 'uploadType=resumable').length, 0);
});

test('youtube: thumbnail left pending while processing; failure is a warning not an error', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch(ytHappy({ processing: 'processing' }));
  const r = await uploadShort({ videoPath: repo.video(), coverPath: repo.cover(), ...META }, { ...deps(YT_ENV, fetch), processingScheduleMs: [1, 1] });
  assert.equal(r.thumbnail, 'pending');
  assert.ok(r.warnings.some((w) => /--set-thumbnail/.test(w)));

  const fetch2 = mockFetch([{ method: 'POST', url: 'thumbnails/set', reply: { status: 403, json: { error: { code: 403, message: 'The authenticated user doesnt have permissions to upload and set custom video thumbnails.', errors: [{ reason: 'forbidden' }] } } } }, ...ytHappy()]);
  const r2 = await uploadShort({ videoPath: repo.video(), coverPath: repo.cover(), ...META }, deps(YT_ENV, fetch2));
  assert.equal(r2.thumbnail, 'failed');
  assert.ok(r2.warnings.some((w) => /youtube\.com\/verify/.test(w)));
});

test('youtube: warns if public was requested but YouTube kept it private', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([{ method: 'PUT', url: /SESSION1/, reply: { status: 201, json: { id: 'VID123', status: { privacyStatus: 'private' } } } }, ...ytHappy()]);
  const r = await uploadShort({ videoPath: repo.video(), ...META }, deps(YT_ENV, fetch));
  assert.equal(r.privacyStatus, 'private');
  assert.ok(r.warnings.some((w) => /requested public/.test(w)));
});

test('youtube: dry run needs no env and hides real secrets', async () => {
  const repo = await tempRepo();
  const fetch = mockFetch([]);
  const r = await uploadShort({ videoPath: repo.video(), coverPath: repo.cover(), ...META }, { ...deps({}, fetch), dryRun: true });
  assert.equal(fetch.calls.length, 0);
  assert.match(r.plan[0].body, /refresh_token=%3CYOUTUBE_REFRESH_TOKEN%3E/);
  assert.ok(r.plan.some((s) => s.label === 'POST thumbnails.set'));
  const withEnv = await uploadShort({ videoPath: repo.video(), ...META }, { ...deps(YT_ENV, fetch), dryRun: true });
  const text = JSON.stringify(withEnv.plan);
  assert.ok(!text.includes('csecret') && !text.includes('refresh-secret'));
});

test('youtube: error classification', () => {
  assert.equal(classifyGoogleError(403, { error: { errors: [{ reason: 'insufficientPermissions' }], message: 'Insufficient Permission' } }).kind, 'permission');
  assert.equal(classifyGoogleError(403, { error: { errors: [{ reason: 'uploadLimitExceeded' }], message: 'x' } }).kind, 'quota');
  assert.equal(classifyGoogleError(401, { error: { message: 'Invalid Credentials' } }).kind, 'auth');
  assert.equal(classifyGoogleError(401, { error: 'invalid_client', error_description: 'bad' }).kind, 'config');
  assert.equal(classifyGoogleError(400, { error: { errors: [{ reason: 'invalidTitle' }], message: 'bad title' } }).kind, 'invalid');
  assert.equal(videoResource({ title: 't', categoryId: 27, privacyStatus: 'public' }).snippet.categoryId, '27');
});
