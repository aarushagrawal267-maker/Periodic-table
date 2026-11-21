// Test helpers: a scripted fetch mock, a synthetic MP4 builder and a temp social/ tree.

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * handlers: [{ method?, url: string|RegExp, reply }]. reply is a response spec
 * { status?, json?, body?, headers? }, an Error (thrown like a network failure), a function
 * (call) => spec, or an array of those consumed in order (the last one repeats).
 */
export function mockFetch(handlers) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body };
    calls.push(call);
    for (const h of handlers) {
      if (h.method && h.method !== call.method) continue;
      if (!(h.url instanceof RegExp ? h.url.test(call.url) : call.url.includes(h.url))) continue;
      const r = Array.isArray(h.reply) ? (h.reply.length > 1 ? h.reply.shift() : h.reply[0]) : h.reply;
      const spec = typeof r === 'function' ? await r(call) : r;
      if (spec instanceof Error) throw spec;
      const body = spec.json !== undefined ? JSON.stringify(spec.json) : (spec.body ?? null);
      return new Response(body, { status: spec.status ?? 200, headers: spec.headers ?? {} });
    }
    throw new Error(`unmocked request: ${call.method} ${call.url}`);
  };
  fn.calls = calls;
  fn.find = (method, part) => calls.filter((c) => c.method === method && (part instanceof RegExp ? part.test(c.url) : c.url.includes(part)));
  return fn;
}

export function netError(code = 'ECONNRESET') {
  return Object.assign(new TypeError('fetch failed'), { cause: { code } });
}

export function deps(env, fetch, extra = {}) {
  const logs = [];
  return {
    env,
    fetch,
    sleep: async () => {},
    baseDelayMs: 1,
    random: () => 0,
    now: () => new Date('2026-11-23T13:30:00Z'),
    log: (...a) => logs.push(a.join(' ')),
    logs,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Synthetic MP4

function box(type, ...parts) {
  const payload = Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p))));
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + payload.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, payload]);
}
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
};
const zeros = (n) => Buffer.alloc(n);

function trak({ handler, codec, width = 0, height = 0 }) {
  const tkhd = box('tkhd', zeros(4), zeros(20), zeros(8), zeros(8), zeros(36), u32(width * 65536), u32(height * 65536));
  const hdlr = box('hdlr', zeros(4), zeros(4), handler, zeros(12), zeros(1));
  const stsd = box('stsd', zeros(4), u32(1), u32(16), codec, zeros(8));
  return box('trak', tkhd, box('mdia', hdlr, box('minf', box('stbl', stsd))));
}

export function makeMp4({ durationSec = 20, width = 1080, height = 1920, videoCodec = 'avc1', audioCodec = 'mp4a', moovFirst = true, mdatBytes = 2048 } = {}) {
  const ftyp = box('ftyp', 'isom', u32(512), 'isomiso2avc1mp41');
  const mvhd = box('mvhd', zeros(4), zeros(8), u32(1000), u32(Math.round(durationSec * 1000)), zeros(80));
  const tracks = [trak({ handler: 'vide', codec: videoCodec, width, height })];
  if (audioCodec) tracks.push(trak({ handler: 'soun', codec: audioCodec }));
  const moov = box('moov', mvhd, ...tracks);
  const mdat = box('mdat', Buffer.alloc(mdatBytes, 7));
  return Buffer.concat(moovFirst ? [ftyp, moov, mdat] : [ftyp, mdat, moov]);
}

// ---------------------------------------------------------------------------
// Temp repo layout

export const ENTRY = {
  id: '2026-11-23-gallium',
  date: '2026-11-23T19:00:00+05:30',
  format: 'element-spotlight',
  caption: 'This metal melts in your hand.\n\nGallium melts at 29.8 °C.',
  hashtags: ['#chemistry', '#periodictable', 'gallium'],
  youtubeTitle: 'Gallium: the metal that melts in your hand',
  youtubeDescription: 'Gallium melts at 29.8 °C.\n\n#chemistry #periodictable',
};

export async function tempRepo({ entries = [ENTRY], video = true, cover = true, posted } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'periodica-publish-'));
  const social = join(root, 'social');
  await mkdir(join(social, 'out'), { recursive: true });
  await writeFile(join(social, 'calendar.json'), JSON.stringify(entries, null, 2));
  if (posted) await writeFile(join(social, 'posted.json'), JSON.stringify(posted, null, 2));
  for (const e of entries) {
    if (video) await writeFile(join(social, 'out', `${e.id}.mp4`), makeMp4());
    if (cover) await writeFile(join(social, 'out', `${e.id}.jpg`), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]));
  }
  return {
    root,
    paths: { root, calendar: join(social, 'calendar.json'), posted: join(social, 'posted.json'), outDir: join(social, 'out'), insightsDir: join(social, 'insights') },
    video: (id = entries[0].id) => join(social, 'out', `${id}.mp4`),
    cover: (id = entries[0].id) => join(social, 'out', `${id}.jpg`),
  };
}

export const IG_ENV = { INSTAGRAM_ACCESS_TOKEN: 'IGAAsecret-token', INSTAGRAM_USER_ID: '17841400000000001' };
export const YT_ENV = { YOUTUBE_CLIENT_ID: 'cid.apps.googleusercontent.com', YOUTUBE_CLIENT_SECRET: 'csecret', YOUTUBE_REFRESH_TOKEN: '1//refresh-secret' };

/** Happy-path Instagram handlers; override pieces by putting handlers in front. */
export function igHappy({ statuses = ['IN_PROGRESS', 'FINISHED'] } = {}) {
  return [
    { method: 'GET', url: /\/me\?fields=user_id/, reply: { json: { user_id: '17841400000000001', username: 'periodica.app' } } },
    { method: 'GET', url: /content_publishing_limit/, reply: { json: { data: [{ quota_usage: 2, config: { quota_total: 100, quota_duration: 86400 } }] } } },
    { method: 'GET', url: /\/media\?fields=id,caption/, reply: { json: { data: [] } } },
    { method: 'POST', url: /\/17841400000000001\/media$/, reply: { json: { id: 'C123', uri: 'https://rupload.facebook.com/ig-api-upload/v27.0/C123' } } },
    { method: 'POST', url: 'rupload.facebook.com', reply: { json: { success: true, message: 'Upload successful.' } } },
    { method: 'GET', url: /\/C123\?fields=status_code/, reply: statuses.map((s) => ({ json: { status_code: s, id: 'C123' } })) },
    { method: 'POST', url: /media_publish$/, reply: { json: { id: 'M999' } } },
    { method: 'GET', url: /\/M999\?fields=id,permalink/, reply: { json: { id: 'M999', permalink: 'https://www.instagram.com/reel/ABC/', shortcode: 'ABC', timestamp: '2026-11-23T13:31:00+0000' } } },
  ];
}

export function ytHappy({ processing = 'succeeded', existingTitles = [] } = {}) {
  return [
    { method: 'POST', url: 'oauth2.googleapis.com/token', reply: { json: { access_token: 'ya29.access', expires_in: 3599, scope: 'https://www.googleapis.com/auth/youtube.upload', token_type: 'Bearer' } } },
    { method: 'GET', url: /\/channels\?/, reply: { json: { items: [{ id: 'UC1', snippet: { title: 'Periodica' }, contentDetails: { relatedPlaylists: { uploads: 'UU1' } }, statistics: { subscriberCount: '42', viewCount: '1000', videoCount: '3' } }] } } },
    { method: 'GET', url: /\/playlistItems\?/, reply: { json: { items: existingTitles.map((t, i) => ({ snippet: { title: t, resourceId: { videoId: `old${i}` }, publishedAt: '2026-11-20T00:00:00Z' } })) } } },
    { method: 'POST', url: /upload\/youtube\/v3\/videos\?uploadType=resumable/, reply: { status: 200, headers: { Location: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=SESSION1' } } },
    { method: 'PUT', url: /upload_id=SESSION1/, reply: { status: 201, json: { id: 'VID123', status: { uploadStatus: 'uploaded', privacyStatus: 'public' } } } },
    { method: 'GET', url: /\/videos\?part=status,processingDetails/, reply: { json: { items: [{ id: 'VID123', status: { privacyStatus: 'public', uploadStatus: 'processed' }, processingDetails: { processingStatus: processing } }] } } },
    { method: 'POST', url: /thumbnails\/set\?videoId=VID123/, reply: { json: { items: [{ default: { url: 'x' } }] } } },
  ];
}
