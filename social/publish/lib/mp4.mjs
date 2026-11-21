// Tiny ISO-BMFF (MP4) probe: duration, frame size, codecs, and whether the moov atom
// comes before mdat ("faststart", which Instagram's Reels spec asks for).
// Enough to catch a wrong render before it hits an API; not a general demuxer.

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts']);

function* boxes(buf, start, end) {
  let off = start;
  while (off + 8 <= end) {
    let size = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    let header = 8;
    if (size === 1) {
      if (off + 16 > end) return;
      size = Number(buf.readBigUInt64BE(off + 8));
      header = 16;
    } else if (size === 0) {
      size = end - off;
    }
    if (size < header || off + size > end) {
      // Truncated or corrupt box: report what we have and stop.
      yield { type, start: off, header, end: Math.min(off + size, end), truncated: true };
      return;
    }
    yield { type, start: off, header, end: off + size };
    off += size;
  }
}

export function probeMp4(buf) {
  const info = { brand: null, topLevel: [], durationSec: null, width: null, height: null, videoCodec: null, audioCodec: null, hasEditList: false, faststart: null };
  if (!buf || buf.length < 16) return { ...info, error: 'file too small to be an MP4' };
  for (const b of boxes(buf, 0, buf.length)) {
    info.topLevel.push(b.type);
    if (b.type === 'ftyp') info.brand = buf.toString('latin1', b.start + 8, b.start + 12);
    if (b.type === 'moov' && !b.truncated) walkMoov(buf, b, info);
  }
  if (!info.topLevel.includes('ftyp')) return { ...info, error: 'no ftyp box: not an MP4/MOV file' };
  if (!info.topLevel.includes('moov')) return { ...info, error: 'no moov box: file is incomplete or not an MP4' };
  const iMoov = info.topLevel.indexOf('moov');
  const iMdat = info.topLevel.indexOf('mdat');
  info.faststart = iMdat === -1 ? true : iMoov < iMdat;
  return info;
}

function walkMoov(buf, moov, info) {
  const walk = (box, trak) => {
    for (const c of boxes(buf, box.start + box.header, box.end)) {
      const p = c.start + c.header;
      if (c.type === 'mvhd') {
        const v = buf[p];
        const timescale = v === 1 ? buf.readUInt32BE(p + 20) : buf.readUInt32BE(p + 12);
        const duration = v === 1 ? Number(buf.readBigUInt64BE(p + 24)) : buf.readUInt32BE(p + 16);
        if (timescale) info.durationSec = Math.round((duration / timescale) * 1000) / 1000;
      } else if (c.type === 'tkhd') {
        const v = buf[p];
        const wOff = p + (v === 1 ? 88 : 76);
        if (wOff + 8 <= c.end) {
          trak.width = buf.readUInt32BE(wOff) / 65536;
          trak.height = buf.readUInt32BE(wOff + 4) / 65536;
        }
      } else if (c.type === 'elst') {
        info.hasEditList = true;
      } else if (c.type === 'hdlr') {
        trak.handler = buf.toString('latin1', p + 8, p + 12);
      } else if (c.type === 'stsd') {
        // full box (4) + entry_count (4), then first sample entry: size (4) + format (4)
        if (p + 16 <= c.end) trak.codec = buf.toString('latin1', p + 12, p + 16);
      } else if (CONTAINERS.has(c.type) && !c.truncated) {
        walk(c, c.type === 'trak' ? (c.trak = {}) : trak);
        if (c.type === 'trak') {
          const t = c.trak;
          if (t.handler === 'vide') {
            info.videoCodec ??= t.codec ?? null;
            if (t.width) {
              info.width ??= Math.round(t.width);
              info.height ??= Math.round(t.height);
            }
          } else if (t.handler === 'soun') {
            info.audioCodec ??= t.codec ?? null;
          }
        }
      }
    }
  };
  walk(moov, {});
}

/** Instagram Reels spec (IG User Media reference): returns { errors, warnings }. */
export function checkReelSpec(info, sizeBytes) {
  const errors = [];
  const warnings = [];
  if (sizeBytes != null && sizeBytes > 300 * 1024 * 1024) errors.push(`video is ${(sizeBytes / 1048576).toFixed(1)} MB; Reels max is 300 MB`);
  if (info.error) {
    warnings.push(`could not inspect MP4: ${info.error}`);
    return { errors, warnings };
  }
  if (info.durationSec != null && info.durationSec < 3) errors.push(`video is ${info.durationSec}s; Reels minimum is 3s`);
  if (info.durationSec != null && info.durationSec > 900) errors.push(`video is ${info.durationSec}s; Reels maximum is 15 min`);
  if (info.width != null && info.width > 1920) warnings.push(`width ${info.width}px exceeds the 1920px Reels maximum`);
  if (info.videoCodec && !['avc1', 'avc3', 'hvc1', 'hev1'].includes(info.videoCodec)) warnings.push(`video codec ${info.videoCodec}; Reels expects H.264 or HEVC`);
  if (info.audioCodec && info.audioCodec !== 'mp4a') warnings.push(`audio codec ${info.audioCodec}; Reels expects AAC`);
  if (info.faststart === false) warnings.push('moov atom is after mdat; Reels spec asks for it at the front (re-mux with -movflags +faststart)');
  if (info.hasEditList) warnings.push('MP4 has an edit list; Meta\'s Reels spec asks for none (usually accepted; if processing fails, re-mux with ffmpeg -use_editlist 0)');
  return { errors, warnings };
}

/** YouTube Shorts classification: up to 3 minutes and a square or vertical frame. */
export function checkShortsSpec(info) {
  const warnings = [];
  if (info.error) return { warnings: [`could not inspect MP4: ${info.error}`] };
  if (info.durationSec != null && info.durationSec > 180) warnings.push(`video is ${info.durationSec}s; Shorts must be 3 minutes or less, so YouTube will treat it as a regular video`);
  if (info.width != null && info.height != null && info.width > info.height) warnings.push(`frame is ${info.width}x${info.height} (landscape); Shorts must be square or vertical`);
  return { warnings };
}
