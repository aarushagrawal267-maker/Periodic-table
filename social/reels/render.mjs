#!/usr/bin/env node
// Periodica reel maker: renders a 1080x1920 H.264/AAC short video, a cover JPG and a contact sheet
// for Instagram Reels and YouTube Shorts from a content spec. See social/reels/README.md.
//
//   node social/reels/render.mjs --id <calendar entry id>          -> social/out/<id>.mp4, .jpg, .sheet.png
//   node social/reels/render.mjs --spec '<json>' --out <file.mp4>  -> <file>.mp4, .jpg, .sheet.png
//   node social/reels/render.mjs --all                             -> every calendar entry not yet rendered
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { REELS_DIR, REPO_ROOT, readTokens, tableCells } from './lib/data.mjs';
import { FPS, MAX_SECONDS, MIN_SECONDS, SpecError, buildPlan, checkDuration } from './lib/plan.mjs';
import { synthesize, writeWav } from './lib/audio.mjs';
import { launchChromium } from './lib/browser.mjs';
import { appShots } from './lib/app-shots.mjs';

const W = 1080;
const H = 1920;
const OUT_DIR = join(REPO_ROOT, 'social', 'out');
const MAX_BYTES = 50 * 1024 * 1024;

const { values: args } = parseArgs({
  options: {
    id: { type: 'string' },
    spec: { type: 'string' },
    out: { type: 'string' },
    all: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    calendar: { type: 'string', default: join(REPO_ROOT, 'social', 'calendar.json') },
    offline: { type: 'boolean', default: false },
    'refresh-shots': { type: 'boolean', default: false },
    workers: { type: 'string' },
    keep: { type: 'boolean', default: false },
    check: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const usage = `Usage:
  node social/reels/render.mjs --id <calendar entry id>
  node social/reels/render.mjs --spec '<json>' --out <file.mp4>
  node social/reels/render.mjs --all [--force]
Options:
  --calendar <path>   calendar file (default social/calendar.json)
  --offline           do not capture the live app; use cached or committed screenshots
  --refresh-shots     capture the live app again and update social/reels/assets/
  --workers <n>       parallel browser pages (default: CPU count, up to 4)
  --keep              keep the frame JPGs in social/out/.tmp/ for inspection
  --check             only validate the spec(s) and print each reel's timing; render nothing`;

const log = (...m) => console.log('[reels]', ...m);

// ------------------------------------------------------------------ calendar

function readCalendar(path) {
  if (!existsSync(path)) throw new SpecError(`No calendar at ${path}`);
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const entries = Array.isArray(raw) ? raw : raw.entries ?? raw.posts ?? raw.items ?? raw.calendar;
  if (!Array.isArray(entries)) throw new SpecError(`${path} has no list of entries (expected an array, or an object with "entries")`);
  return entries;
}

/** The content spec of a calendar entry: the entry itself, or a nested reel/spec/content object. */
function specOf(entry) {
  if (entry.format) return entry;
  for (const k of ['reel', 'spec', 'content', 'video']) if (entry[k]?.format) return entry[k];
  throw new SpecError(`Calendar entry ${entry.id} has no "format"`);
}

// ------------------------------------------------------------------ stage page

function fontFaces() {
  const css = [];
  for (const pkg of ['figtree', 'geist-mono']) {
    const dir = join(REPO_ROOT, 'node_modules', '@fontsource-variable', pkg);
    const index = readFileSync(join(dir, 'index.css'), 'utf8');
    css.push(index.replace(/url\(\.\/files\/([^)]+)\)/g, (_, f) => `url(${pathToFileURL(join(dir, 'files', f)).href})`));
  }
  return css.join('\n');
}

function stageHtml(plan, tokens, tmp) {
  const vars = Object.entries(tokens)
    .map(([k, v]) => `--${k}: ${v};`)
    .join('\n    ');
  const data = { ...plan, cells: tableCells() };
  const path = join(tmp, 'stage.html');
  writeFileSync(
    path,
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<style>
${fontFaces()}
:root {
    ${vars}
}
</style>
<link rel="stylesheet" href="${pathToFileURL(join(REELS_DIR, 'stage', 'stage.css')).href}">
</head><body><div id="stage"></div>
<script>window.__PLAN__ = ${JSON.stringify(data).replace(/</g, '\\u003c')};</script>
<script src="${pathToFileURL(join(REELS_DIR, 'stage', 'stage.js')).href}"></script>
</body></html>`,
  );
  return path;
}

async function openStage(browser, html) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  try {
    await page.evaluate(() => window.__stage.init());
  } catch (e) {
    throw new Error(`Stage failed to build: ${e.message}\n${errors.join('\n')}`);
  }
  if (errors.length) throw new Error(`Stage errors:\n${errors.join('\n')}`);
  return { page, context };
}

async function shoot(page, t, path, quality = 95) {
  await page.evaluate((t) => window.__stage.seek(t), t);
  await page.screenshot({ path, type: 'jpeg', quality, animations: 'disabled', caret: 'hide' });
}

// ------------------------------------------------------------------ ffmpeg

function ff(argv) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', ...argv], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ffmpeg ${argv.join(' ')}\n${r.stderr.slice(-3000)}`);
  return r.stderr;
}

const LOUDNESS = { I: -18, TP: -1.5, LRA: 11 };

function measureLoudness(wav) {
  const err = ff(['-i', wav, '-af', `loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}:print_format=json`, '-f', 'null', '-']);
  const json = err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

function encode({ frames, wav, out, duration, loud }) {
  const af =
    `loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}` +
    `:measured_I=${loud.input_i}:measured_TP=${loud.input_tp}:measured_LRA=${loud.input_lra}:measured_thresh=${loud.input_thresh}` +
    `:offset=${loud.target_offset}:linear=true,aresample=48000`;
  ff([
    '-y', '-loglevel', 'error',
    '-framerate', String(FPS), '-i', join(frames, 'f%05d.jpg'),
    '-i', wav,
    '-map', '0:v', '-map', '1:a',
    '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-profile:v', 'high', '-level:v', '4.1',
    '-crf', '17', '-maxrate', '16M', '-bufsize', '32M',
    '-g', String(FPS), '-keyint_min', String(FPS), '-sc_threshold', '0', '-bf', '2',
    '-r', String(FPS), '-fps_mode', 'cfr',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    '-af', af,
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-t', duration.toFixed(3),
    '-movflags', '+faststart',
    out,
  ]);
}

function probe(file) {
  const r = execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  return JSON.parse(r);
}

/** Checks the file against the Reels and Shorts upload specs; returns a summary or throws. */
function verify(file) {
  const p = probe(file);
  const v = p.streams.find((s) => s.codec_type === 'video');
  const a = p.streams.find((s) => s.codec_type === 'audio');
  const size = statSync(file).size;
  const duration = Number(p.format.duration);
  const [num, den] = v.avg_frame_rate.split('/').map(Number);
  const fps = num / den;
  const problems = [];
  if (v.codec_name !== 'h264') problems.push(`video codec ${v.codec_name}`);
  if (v.width !== W || v.height !== H) problems.push(`size ${v.width}x${v.height}`);
  if (v.pix_fmt !== 'yuv420p') problems.push(`pixel format ${v.pix_fmt}`);
  if (Math.abs(fps - FPS) > 0.01) problems.push(`frame rate ${v.avg_frame_rate}`);
  if (!a || a.codec_name !== 'aac') problems.push(`audio codec ${a?.codec_name}`);
  if (a && (Number(a.sample_rate) !== 48000 || a.channels !== 2)) problems.push(`audio ${a.sample_rate} Hz, ${a.channels} channels`);
  if (duration < MIN_SECONDS - 0.05 || duration > MAX_SECONDS + 0.05) problems.push(`duration ${duration}s`);
  if (size >= MAX_BYTES) problems.push(`size ${(size / 1048576).toFixed(1)} MB`);
  const head = readFileSync(file).subarray(0, 64 * 1024);
  const moov = head.indexOf('moov');
  const mdat = head.indexOf('mdat');
  if (moov < 0 || (mdat >= 0 && moov > mdat)) problems.push('moov atom is not at the start (no faststart)');
  const summary = {
    file,
    duration: Number(duration.toFixed(2)),
    video: `${v.codec_name} ${v.profile} ${v.width}x${v.height} ${v.pix_fmt} ${fps} fps ${Math.round(Number(v.bit_rate) / 1000)} kb/s`,
    audio: a ? `${a.codec_name} ${a.sample_rate} Hz ${a.channels} ch ${Math.round(Number(a.bit_rate) / 1000)} kb/s` : 'none',
    sizeMB: Number((size / 1048576).toFixed(2)),
    faststart: moov >= 0 && (mdat < 0 || moov < mdat),
  };
  if (problems.length) throw new Error(`${file} does not meet the upload spec: ${problems.join('; ')}`);
  return summary;
}

function integratedLoudness(file) {
  const err = ff(['-i', file, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const i = err.match(/I:\s+(-?[\d.]+) LUFS(?![\s\S]*I:\s+-?[\d.]+ LUFS)/);
  const tp = err.match(/Peak:\s+(-?[\d.]+) dBFS(?![\s\S]*Peak:)/);
  return { lufs: i ? Number(i[1]) : null, truePeak: tp ? Number(tp[1]) : null };
}

function contactSheet(frames, times, out) {
  const inputs = [];
  const parts = [];
  times.forEach((t, k) => {
    const f = Math.min(Math.round(t * FPS), Number.MAX_SAFE_INTEGER);
    inputs.push('-i', join(frames, `f${String(f).padStart(5, '0')}.jpg`));
    parts.push(`[${k}:v]scale=432:768,pad=448:784:8:8:color=0x12110f[s${k}]`);
  });
  const n = times.length;
  const cols = Math.min(3, n);
  const layout = times.map((_, k) => `${(k % cols) * 448}_${Math.floor(k / cols) * 784}`).join('|');
  ff(['-y', '-loglevel', 'error', ...inputs, '-filter_complex', `${parts.join(';')};${times.map((_, k) => `[s${k}]`).join('')}xstack=inputs=${n}:layout=${layout}:fill=0x12110f`, '-frames:v', '1', out]);
}

// ------------------------------------------------------------------ render one

async function render(browser, spec, outMp4, opts) {
  const started = Date.now();
  const plan = buildPlan(spec);
  checkDuration(plan);
  const frameCount = Math.round(plan.duration * FPS);
  const base = outMp4.replace(/\.mp4$/i, '');
  const name = basename(base);
  mkdirSync(dirname(outMp4), { recursive: true });
  const tmp = join(OUT_DIR, '.tmp', `${name}-${process.pid}`);
  const frames = join(tmp, 'frames');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });

  log(`${name}: ${plan.format}, ${plan.duration}s, ${frameCount} frames`);
  const shotPaths = await appShots(browser, plan.endShots, { live: !opts.offline, refresh: opts.refreshShots, log: (m) => log(m) });
  // Where each screenshot is cropped: the element card from its top, the Explore table from its lower half.
  plan.endShotImages = shotPaths.map((p, i) => ({ src: pathToFileURL(p).href, focus: plan.endShots[i].kind === 'explore' ? 'center 88%' : 'center top' }));
  const html = stageHtml(plan, readTokens(), tmp);

  // Frames: each worker page takes every n-th frame.
  const workers = Math.max(1, Math.min(opts.workers, frameCount));
  const pages = await Promise.all(Array.from({ length: workers }, () => openStage(browser, html)));
  await Promise.all(
    pages.map(async ({ page }, w) => {
      for (let f = w; f < frameCount; f += workers) await shoot(page, f / FPS, join(frames, `f${String(f).padStart(5, '0')}.jpg`));
    }),
  );
  // Cover: the settled hook frame, without the platform's UI in mind (it is shown before playback).
  const cover = `${base}.jpg`;
  await shoot(pages[0].page, plan.coverTime, cover, 92);
  await Promise.all(pages.map(({ context }) => context.close()));
  log(`${name}: frames done in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  // Sound.
  const wav = join(tmp, 'audio.wav');
  writeWav(wav, synthesize(plan));
  const loud = measureLoudness(wav);

  encode({ frames, wav, out: outMp4, duration: frameCount / FPS, loud });
  const sheet = `${base}.sheet.png`;
  contactSheet(frames, plan.keyTimes.map((t) => Math.min(t, (frameCount - 1) / FPS)), sheet);
  if (!opts.keep) rmSync(tmp, { recursive: true, force: true });

  const summary = verify(outMp4);
  Object.assign(summary, integratedLoudness(outMp4), { cover, sheet, seconds: Number(((Date.now() - started) / 1000).toFixed(1)) });
  log(`${name}: ${summary.duration}s, ${summary.video}, ${summary.audio}, ${summary.lufs} LUFS, ${summary.sizeMB} MB, rendered in ${summary.seconds}s`);
  log(`  video ${outMp4}`);
  log(`  cover ${cover}`);
  log(`  sheet ${sheet}`);
  return summary;
}

// ------------------------------------------------------------------ main

async function main() {
  if (args.help || (!args.id && !args.spec && !args.all)) {
    console.log(usage);
    process.exit(args.help ? 0 : 1);
  }
  const jobs = [];
  if (args.spec) {
    if (!args.out) throw new SpecError('--spec needs --out <file.mp4>');
    jobs.push({ spec: JSON.parse(args.spec), out: resolve(args.out) });
  }
  if (args.id || args.all) {
    const entries = readCalendar(resolve(args.calendar));
    const pick = args.all ? entries : entries.filter((e) => String(e.id) === args.id);
    if (!pick.length) throw new SpecError(`No calendar entry with id "${args.id}" in ${args.calendar}`);
    for (const e of pick) {
      const out = join(OUT_DIR, `${e.id}.mp4`);
      if (args.all && !args.force && !args.check && existsSync(out)) {
        log(`${e.id}: already rendered, skipping (use --force)`);
        continue;
      }
      jobs.push({ spec: specOf(e), out });
    }
  }
  // Validate everything before starting a browser.
  for (const j of jobs) {
    const plan = buildPlan(j.spec);
    checkDuration(plan);
    if (args.check) log(`ok ${basename(j.out)}: ${plan.format}, ${plan.duration}s, times ${JSON.stringify(plan.times)}`);
  }
  if (args.check || !jobs.length) return [];

  const browser = await launchChromium();
  const results = [];
  try {
    const opts = { offline: args.offline, refreshShots: args['refresh-shots'], keep: args.keep, workers: Number(args.workers) || Math.min(4, cpus().length) };
    for (const j of jobs) results.push(await render(browser, j.spec, j.out, opts));
  } finally {
    await browser.close();
  }
  return results;
}

main().catch((e) => {
  console.error(`[reels] ${e instanceof SpecError ? 'Spec problem: ' : ''}${e.message}`);
  process.exit(e instanceof SpecError ? 2 : 1);
});
