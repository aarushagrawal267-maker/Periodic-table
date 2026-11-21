#!/usr/bin/env node
// Post a calendar entry to Instagram and/or YouTube and log the results in social/posted.json.
//
//   node social/publish/post.mjs --id <id> [--platforms instagram,youtube] [--dry-run] [--force] [--privacy public|unlisted|private]
//       [--calendar <path>]  (default social/calendar.json)
//   node social/publish/post.mjs --due [--limit 1] [--platforms ...] [--dry-run]
//       --due posts the oldest calendar entries dated today or earlier (IST) that are rendered
//       and not yet posted everywhere. Handy for the scheduled sessions.
//
// One platform failing never stops the other. Exit code: 0 all good (or already posted),
// 1 any platform failed, 2 usage/config error.

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, describeError, printPlan, defaultPaths, readJson, calendarEntries, loadPosted, publishedRecord, mediaPaths, fileSize, istDate, makeContext } from './lib/common.mjs';
import { runPost, PLATFORMS } from './lib/run.mjs';
import { tokenExpiryStatus } from './instagram.mjs';

const USAGE = `Usage:
  node social/publish/post.mjs --id <calendar id> [--platforms instagram,youtube] [--dry-run] [--force] [--privacy public|unlisted|private]
  node social/publish/post.mjs --due [--limit 1] [--platforms instagram,youtube] [--dry-run]`;

/** Calendar day (IST) of an entry date: "2026-11-23" or "2026-11-23T19:00:00+05:30" -> "2026-11-23". */
export function entryDay(date) {
  const s = String(date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  return Number.isNaN(t) ? s.slice(0, 10) : istDate(new Date(t));
}

// An entry is due once its IST calendar day has arrived; the time of day is left to the
// session schedule, so a run a little before the slot still posts that day's entry.
export async function dueEntries({ paths = defaultPaths(), platforms = PLATFORMS, today = istDate(), limit = 1 } = {}) {
  const cal = calendarEntries(await readJson(paths.calendar));
  const log = await loadPosted(paths.posted);
  const due = [];
  for (const e of [...cal].filter((x) => x?.id && x.date && entryDay(x.date) <= today).sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const want = Array.isArray(e.platforms) && e.platforms.length ? platforms.filter((p) => e.platforms.includes(p)) : platforms;
    const pending = want.filter((p) => !publishedRecord(log, e.id, p));
    if (!pending.length) continue;
    if (!(await fileSize(mediaPaths(e, paths).videoPath))) continue;
    due.push({ entry: e, platforms: pending });
    if (due.length >= limit) break;
  }
  return due;
}

export async function main(argv, { paths = defaultPaths(), deps = {}, out = console.log } = {}) {
  const args = parseArgs(argv, { booleans: ['dryRun', 'force', 'due', 'help'] });
  if (args.help) {
    out(USAGE);
    return 0;
  }
  if (!args.id && !args.due) {
    out(USAGE);
    return 2;
  }
  const platforms = args.platforms ? String(args.platforms).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : undefined;
  if (platforms?.some((p) => !PLATFORMS.includes(p))) {
    out(`--platforms must be a comma list of: ${PLATFORMS.join(', ')}`);
    return 2;
  }
  if (args.privacy && !['public', 'unlisted', 'private'].includes(args.privacy)) {
    out('--privacy must be public, unlisted or private');
    return 2;
  }

  if (args.calendar) paths = { ...paths, calendar: resolve(String(args.calendar)) };
  const ctx = makeContext(deps);
  if (!args.dryRun && (!platforms || platforms.includes('instagram')) && ctx.env.INSTAGRAM_ACCESS_TOKEN) {
    const s = tokenExpiryStatus(ctx.env, ctx.now());
    if (s.level === 'warn' || s.level === 'expired') out(s.message);
  }

  let jobs;
  if (args.due) {
    const limit = Math.max(1, Number(args.limit) || 1);
    jobs = (await dueEntries({ paths, platforms: platforms ?? PLATFORMS, today: istDate(ctx.now()), limit })).map((d) => ({ entry: d.entry, platforms: d.platforms }));
    if (!jobs.length) {
      out(`Nothing due (today in IST is ${istDate(ctx.now())}).`);
      return 0;
    }
  } else {
    jobs = [{ id: String(args.id), platforms }];
  }

  let exitCode = 0;
  for (const job of jobs) {
    const { results, exitCode: code, dryRunOutput } = await runPost({ ...job, dryRun: Boolean(args.dryRun), force: Boolean(args.force), privacy: args.privacy, paths, deps });
    if (dryRunOutput) for (const p of dryRunOutput) printPlan(p.title, p.plan, out);
    for (const r of results) {
      out(r.summary);
      for (const w of r.warnings ?? []) out(`  warning: ${w}`);
    }
    exitCode = Math.max(exitCode, code);
  }
  if (!args.dryRun) out(`Log: social/posted.json`);
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(describeError(e));
      process.exit(e?.kind === 'config' ? 2 : 1);
    },
  );
}
