# Periodica reels

Renders the short vertical videos for Instagram Reels and YouTube Shorts from a small content spec.
Each reel is built as an HTML page on the app's own design (warm dark ramp, cobalt accent, category
colours, Figtree and Geist Mono, the corner number on every tile), stepped frame by frame in headless
Chromium and encoded with ffmpeg. The soundtrack is synthesised in code, so it is royalty-free.

## Run

```sh
# A calendar entry (social/calendar.json) -> social/out/<id>.mp4, <id>.jpg, <id>.sheet.png
node social/reels/render.mjs --id 2026-11-23-gallium-melts-in-your-hand

# Every calendar entry that has no video yet (add --force to render them all again)
node social/reels/render.mjs --all

# An ad hoc spec
node social/reels/render.mjs --spec '{"format":"quiz","question":"Which element has the symbol Au?","options":["Silver","Gold","Argon","Aluminium"],"answerIndex":1,"explanation":"Au comes from aurum, the Latin word for gold."}' --out social/out/gold-quiz.mp4

# Only validate specs and print their timing
node social/reels/render.mjs --all --check
```

Options: `--offline` (no live screenshots), `--refresh-shots` (capture the live app again and update
`assets/`), `--workers <n>` (parallel pages, default up to 4), `--keep` (keep the frame JPGs in
`social/out/.tmp/`), `--calendar <path>`.

Needs Node 22, ffmpeg and ffprobe on the PATH, and Playwright with Chromium. The renderer tries the
repo's `playwright` first and falls back to any other installed copy whose browser is present, so a
version mismatch between `@playwright/test` and the installed browsers does not stop it
(`REELS_PLAYWRIGHT=/path/to/playwright/index.js` forces one). A reel takes about 20 to 40 seconds.

## Outputs

For each reel, next to the `.mp4`:

| File | What |
| --- | --- |
| `<name>.mp4` | 1080x1920, H.264 High yuv420p, 30 fps CFR, AAC 48 kHz stereo 192 kb/s, BT.709, faststart, 16 to 30 s, a few MB, about -18 LUFS |
| `<name>.jpg` | 1080x1920 cover (the settled hook frame) |
| `<name>.sheet.png` | six key frames in a 3x2 grid, for checking the reel without playing it |

The renderer checks every file with ffprobe after encoding (codec, size, pixel format, frame rate,
audio format, duration, size under 50 MB, moov atom first) and exits non-zero if anything is off.
`social/out/` is git-ignored.

## Specs

Calendar entries carry the spec fields at the top level (the other fields, like `caption`, are ignored):

```json
{"format": "element-spotlight", "atomicNumber": 31, "hook": "This metal melts in your hand"}
{"format": "guess-element", "atomicNumber": 80, "clues": ["clue 1", "clue 2", "clue 3"]}
{"format": "quiz", "question": "...", "options": ["a", "b", "c", "d"], "answerIndex": 1, "explanation": "one short sentence"}
```

- `element-spotlight`: hook line over the element's tile, then atomic number and mass counting up,
  group, period, state and its square on a mini table, then "Where you'll find it" (the app's uses),
  then "Did you know" (the app's fact), then the end card. The fourth figure follows the hook: melting or boiling point for a hook about melting or boiling, density for floating, sinking, heavy or dense, the discovery year for discovered or named, otherwise the state at 20 °C. `hook` is optional (default
  "<Name> in 20 seconds"), at most 70 characters.
- `guess-element`: 2 to 4 clues (at most 90 characters each, must not name the element) revealed one
  by one, a 3-2-1 countdown with ticks, then the tile with a chime. `hook` replaces the title
  "Guess the element".
- `quiz`: 2 to 4 options (at most 40 characters), a timer of 5 to 8 seconds (set by length, or
  `seconds`), the answer turns green with a chime, then the explanation. If the answer is an element
  name or symbol, its chip appears next to it. `hook` replaces the label "Quick quiz".

Every element fact on screen comes from `src/data/elements.json`, the same data the app shows, and the
colours come from the `:root` tokens in `src/styles/index.css`, so the reels follow the app when it
changes. Durations follow the amount of text (about 18 characters a second of reading time).

## Layout and safe zones

All text sits in x 80 to 930 and y 250 to 1500 of the 1080x1920 frame, clear of the platform overlays
(top 250 px, bottom 420 px, right 150 px). Long text shrinks to fit that box instead of overflowing.
Every reel starts with its hook already on screen in frame 0 and ends with the end card: the Periodica
wordmark, "Free, no sign-up", two real screenshots of the live app (the element's own card where there
is one), "Link in bio" and the URL.

## Files

| Path | Role |
| --- | --- |
| `render.mjs` | CLI: specs, frame capture, audio, encode, verify, contact sheet |
| `lib/plan.mjs` | spec validation and timing (scenes, sound cues, cover and key frames) |
| `lib/data.mjs` | element data and design tokens read from the app |
| `lib/audio.mjs` | the synthesised soundtrack (pad, pluck, soft beat, ticks, chime) |
| `lib/app-shots.mjs` | live app screenshots for the end card, cached in `social/out/.cache/app/` |
| `lib/browser.mjs` | finds a Playwright whose Chromium launches |
| `stage/stage.js`, `stage/stage.css` | the frame itself; `seek(t)` sets every moving property from `t` |
| `assets/` | committed app screenshots used when the live site cannot be reached |
| `examples/` | the three sample specs |
