# social/publish

Posting, insights and comments for Periodica's Instagram and YouTube accounts. It uses Node 22's built-in `fetch` and has no npm dependencies. The account owner's setup guide is [docs/SOCIAL_SETUP.md](../../docs/SOCIAL_SETUP.md).

## Runbook for a scheduled posting session

1. Make sure the video exists. `social/out/` is git-ignored, so a fresh checkout has no renders: render the entry first (see `social/reels`).
2. Preview: `node social/publish/post.mjs --due --dry-run` (or `--id <id> --dry-run`). This needs no credentials and sends nothing.
3. Post: `node social/publish/post.mjs --due`. It posts the oldest entry whose IST date has arrived and isn't posted yet. `--limit N` posts more than one.
4. Persist `social/posted.json` (commit it). It is the only memory between sessions, and it is what makes posting idempotent across runs.
5. Report each printed line. Pass along any `warning:` lines, especially token-expiry ones, to the owner.

Exit codes: `0` everything posted or already posted, `1` a platform failed (the other still ran), `2` usage or config error.

## Commands

```
node social/publish/post.mjs --id <id> [--platforms instagram,youtube] [--dry-run] [--force] [--privacy public|unlisted|private] [--calendar <file>]
node social/publish/post.mjs --due [--limit 1] [--dry-run]
node social/publish/instagram.mjs --id <id> [--dry-run] | --check-token | --refresh-token [--out <file>]
node social/publish/youtube.mjs   --id <id> [--dry-run] [--privacy ...] | --check-auth | --set-thumbnail --id <id> | --list-categories
node social/publish/insights.mjs  [--days 30] [--no-analytics]      -> social/insights/<date>.json + table
node social/publish/comments.mjs  [--days 14]                       -> social/insights/comments-<date>.json
node social/publish/comments.mjs --reply --platform instagram|youtube --comment <id> --text "..." [--dry-run]
node --test social/publish/                                         -> unit tests (mocked fetch)
```

Replies are only ever sent by the explicit `--reply` command. Draft them for the owner first.

## Environment

| Variable | |
| --- | --- |
| `INSTAGRAM_ACCESS_TOKEN` | required; or `network-secret` when the proxy injects it |
| `INSTAGRAM_USER_ID` | optional (resolved via `/me`) |
| `INSTAGRAM_TOKEN_EXPIRES_AT` | optional `YYYY-MM-DD`; runs warn when 10 days or fewer remain |
| `INSTAGRAM_MEDIA_BASE_URL` | optional public URL of a folder holding `<id>.mp4` / `<id>.jpg`; switches to `video_url` + `cover_url` |
| `INSTAGRAM_GRAPH_HOST`, `INSTAGRAM_API_VERSION` | optional; defaults `graph.instagram.com`, `v27.0` |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` | required for YouTube |
| `YOUTUBE_PRIVACY` | default `public` |
| `YOUTUBE_CATEGORY_ID` | default `27` (Education) |
| `YOUTUBE_MADE_FOR_KIDS` | default `false` |
| `YOUTUBE_NOTIFY_SUBSCRIBERS` | default `true` |

Optional per-entry calendar fields the publisher understands: `platforms`, `thumbOffsetMs`, `videoUrl`, `coverUrl`, `instagramCaption`, `youtubeTags`, `youtubePrivacy`, `madeForKids`, `containsSyntheticMedia`, `language`.

## posted.json

`{ "version": 1, "posts": [ ... ] }`, with one record per attempt:

```json
{ "id": "2026-11-23-gallium-melts-in-your-hand", "platform": "instagram", "status": "published",
  "startedAt": "...", "postedAt": "...", "url": "https://www.instagram.com/reel/.../",
  "mediaId": "...", "containerId": "...", "uploadMode": "resumable", "warnings": ["..."] }
```

YouTube records carry `videoId`, `privacyStatus` and `thumbnail` (`set`, `pending`, `failed` or `skipped`) instead.

The `status` field controls what later runs do:

- **`in_progress`** is written before anything irreversible. A later run uses it to recover after a crash.
- **`published`** means the post is live. That (id, platform) pair is never posted again unless you pass `--force`.
- **`failed`** means the post is definitely not live, and the next run retries it.
- **`unknown`** means the post may be live. Automatic posting for that pair stops until a human checks.

Double-post guards, on top of the log:

- **Instagram:** before posting, the script looks for a recent post with the same caption. `media_publish` is never retried blindly. After an unclear failure, the script asks the container for its status instead.
- **YouTube:** before uploading, the script looks for a recent upload with the same title. Upload interruptions resume within the same upload session.
