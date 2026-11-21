// Caption / title / tag builders with each platform's documented limits.
//   Instagram caption: max 2,200 chars, 30 hashtags, 20 @tags (IG User Media reference).
//   YouTube title: max 100 chars, no < or >; description max 5,000 bytes, no < or >;
//   tags max 500 chars total (Videos resource reference).

import { PublishError } from './common.mjs';

export const IG_CAPTION_MAX = 2200;
export const IG_HASHTAG_MAX = 30;
export const YT_TITLE_MAX = 100;
export const YT_DESCRIPTION_MAX_BYTES = 5000;
export const YT_TAGS_MAX_CHARS = 500;

export function normalizeHashtags(list = []) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const t = String(raw ?? '')
      .trim()
      .replace(/^#+/, '')
      .replace(/[^\p{L}\p{N}_]/gu, '');
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

const HASHTAG_RE = /(^|\s)#[\p{L}\p{N}_]+/gu;
export function countHashtags(text) {
  return (String(text).match(HASHTAG_RE) ?? []).length;
}

export function buildInstagramCaption(entry, warnings = []) {
  const base = String(entry.instagramCaption ?? entry.caption ?? '').trim();
  const inCaption = new Set((base.match(HASHTAG_RE) ?? []).map((h) => h.trim().slice(1).toLowerCase()));
  let tags = normalizeHashtags(entry.hashtags).filter((t) => !inCaption.has(t.toLowerCase()));
  const room = IG_HASHTAG_MAX - inCaption.size;
  if (tags.length > room) {
    warnings.push(`Instagram allows ${IG_HASHTAG_MAX} hashtags; dropped ${tags.length - Math.max(room, 0)}: ${tags.slice(Math.max(room, 0)).join(' ')}`);
    tags = tags.slice(0, Math.max(room, 0));
  }
  const caption = [base, tags.map((t) => `#${t}`).join(' ')].filter(Boolean).join('\n\n');
  if (!caption) throw new PublishError('Calendar entry has no caption', { platform: 'instagram', kind: 'config' });
  if ([...caption].length > IG_CAPTION_MAX) {
    throw new PublishError(`Instagram caption is ${[...caption].length} chars; the limit is ${IG_CAPTION_MAX}. Shorten the caption in the calendar.`, {
      platform: 'instagram',
      kind: 'invalid',
    });
  }
  return caption;
}

function stripAngles(s) {
  return String(s ?? '').replace(/[<>]/g, '');
}

function truncateChars(s, max) {
  const chars = [...s];
  if (chars.length <= max) return s;
  return chars.slice(0, max - 1).join('').trimEnd() + '…';
}

function truncateBytes(s, maxBytes) {
  if (Buffer.byteLength(s) <= maxBytes) return s;
  let out = '';
  for (const ch of s) {
    if (Buffer.byteLength(out + ch + '…') > maxBytes) break;
    out += ch;
  }
  return out.trimEnd() + '…';
}

export function tagsLength(tags) {
  // YouTube counts a tag containing a space as if wrapped in quotes, plus a comma between tags.
  return tags.reduce((n, t) => n + [...t].length + (/\s/.test(t) ? 2 : 0), 0) + Math.max(tags.length - 1, 0);
}

/**
 * Title: youtubeTitle (fallback: first line of caption). Appends " #Shorts" when it fits.
 * #Shorts is not required for Shorts classification (that is duration <= 3 min and a square or
 * vertical frame) but it is a harmless discovery hint when there is room.
 */
export function buildYouTubeMeta(entry, warnings = []) {
  const firstLine = String(entry.caption ?? '').split('\n')[0];
  let title = stripAngles(entry.youtubeTitle ?? firstLine)
    .replace(/\s+/g, ' ')
    .trim();
  if (!title) throw new PublishError('Calendar entry has no youtubeTitle or caption', { platform: 'youtube', kind: 'config' });
  const hasShortsTag = /#shorts\b/i.test(title);
  if ([...title].length > YT_TITLE_MAX) {
    warnings.push(`YouTube title truncated to ${YT_TITLE_MAX} chars`);
    title = truncateChars(title, YT_TITLE_MAX);
  }
  let shortsInTitle = hasShortsTag;
  if (!hasShortsTag && [...title].length + ' #Shorts'.length <= YT_TITLE_MAX) {
    title = `${title} #Shorts`;
    shortsInTitle = true;
  }

  const hashtags = normalizeHashtags(entry.hashtags);
  // A curated youtubeDescription is used as written (its first hashtags show above the title);
  // hashtags are only appended when we fall back to the Instagram caption.
  const curated = entry.youtubeDescription != null;
  let description = stripAngles(entry.youtubeDescription ?? entry.caption ?? '').trim();
  const descTags = curated ? [] : hashtags.slice(0, 15).map((t) => `#${t}`);
  if (!shortsInTitle && !/#shorts\b/i.test(description)) descTags.unshift('#Shorts');
  const missing = descTags.filter((t) => !new RegExp(`${t}(?![\\p{L}\\p{N}_])`, 'iu').test(description));
  if (missing.length) description = [description, missing.join(' ')].filter(Boolean).join('\n\n');
  if (Buffer.byteLength(description) > YT_DESCRIPTION_MAX_BYTES) {
    warnings.push(`YouTube description truncated to ${YT_DESCRIPTION_MAX_BYTES} bytes`);
    description = truncateBytes(description, YT_DESCRIPTION_MAX_BYTES);
  }

  const tags = [];
  for (const t of [...hashtags, ...(entry.youtubeTags ?? []).map((x) => stripAngles(x).trim()).filter(Boolean)]) {
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    if (tagsLength([...tags, t]) > YT_TAGS_MAX_CHARS) {
      warnings.push(`YouTube tags capped at ${YT_TAGS_MAX_CHARS} chars; dropped "${t}" and any after it`);
      break;
    }
    tags.push(t);
  }
  return { title, description, tags };
}
