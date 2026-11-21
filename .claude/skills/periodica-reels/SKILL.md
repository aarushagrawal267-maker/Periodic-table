---
name: periodica-reels
description: Makes Periodica's short vertical videos (Instagram Reels, YouTube Shorts) with the renderer in social/reels. Use when asked to make, render, re-render, preview or check a reel or short for a calendar entry in social/calendar.json, or to turn a new idea (an element spotlight, a guess-the-element, a quiz question) into a video. Covers writing the spec, rendering, checking the frames, and where the MP4, cover and contact sheet go.
---

# Periodica reels

The renderer lives in `social/reels/` (read its README for every option). It turns a small JSON spec into a
1080x1920 H.264/AAC MP4 that meets both the Instagram Reels and YouTube Shorts upload specs, a cover JPG and a
contact sheet, in about half a minute. Element facts and colours come from the app itself
(`src/data/elements.json`, `src/styles/index.css`), so never type facts into a spec that the renderer already
shows; only hooks, clues, questions and explanations are written by hand.

## 1. Get the spec

**A calendar entry.** Find its `id` in `social/calendar.json`. The spec fields sit at the top level of the
entry (`format`, `atomicNumber`, `hook`, `clues`, `question`, `options`, `answerIndex`, `explanation`); the
captions and titles are for the posting scripts and the renderer ignores them.

**A new idea.** Write one of these:

```json
{"format": "element-spotlight", "atomicNumber": 31, "hook": "This metal melts in your hand"}
{"format": "guess-element", "atomicNumber": 80, "clues": ["hardest clue", "middle clue", "easiest clue"]}
{"format": "quiz", "question": "Which element has the symbol Au?", "options": ["Silver", "Gold", "Argon", "Aluminium"], "answerIndex": 1, "explanation": "Au comes from aurum, the Latin word for gold."}
```

Rules for the hand-written text, for students aged 12 to 18 watching with the sound off:

- Check every claim against the app's data before using it: `node -e "const e=require('./src/data/elements.json')[N-1]; console.log(e)"`
  shows the name, mass, category, group, period, state, melting and boiling points (kelvin), discovery year,
  uses and the fact the app prints. Use the app's spelling (Aluminium, Caesium, Sulfur). Do not add claims the
  data does not support.
- Hook: at most 70 characters, a surprising true thing, not a question about the app. Sentence case, no
  exclamation marks, no emoji.
- Clues: two to four, at most 90 characters each, from hardest to easiest, never naming the element.
- Quiz: options at most 40 characters, one clearly right answer, an explanation of one short sentence.
- Keep it to what one reel can say: the renderer refuses text that would run past 30 seconds.

Validate without rendering: `node social/reels/render.mjs --spec '<json>' --out /tmp/x.mp4 --check`
(or `--id <id> --check`, or `--all --check` for the whole calendar).

## 2. Render

```sh
node social/reels/render.mjs --id <calendar entry id>           # -> social/out/<id>.mp4, .jpg, .sheet.png
node social/reels/render.mjs --spec '<json>' --out social/out/<name>.mp4
node social/reels/render.mjs --all                              # every calendar entry not yet rendered
```

Add `--offline` when the live site cannot be reached (the end card then uses the committed screenshots in
`social/reels/assets/`), and `--keep` to keep every frame JPG in `social/out/.tmp/` for a closer look.
The run ends with an ffprobe check of the file; a non-zero exit means the file does not meet the upload spec
or the spec is invalid, and the message says why.

## 3. Check it before anyone posts it

Rendering is not done until you have looked at it. Read the contact sheet `social/out/<id>.sheet.png` with
the Read tool (six frames: the first frame, the hook settled, the middle, the reveal, the payoff, the end
card), and the cover `social/out/<id>.jpg`. Check:

- Frame 0 already shows the hook text (no slow intro).
- Every word is inside x 80 to 930, y 250 to 1500 (clear of the platform buttons and captions), nothing is
  cut off or overlapping, long text has shrunk to fit rather than run off.
- The facts on screen are right and the quiz answer that turns green is the correct one.
- The end card shows Periodica, "Free, no sign-up", two app screenshots, "Link in bio" and the URL.
- The look is the app's: warm dark background, one cobalt accent, category colours only on tiles, chips and
  the mini table; no gradients, glows, emoji or uppercase labels.

For a frame the sheet does not show, render with `--keep` and read `social/out/.tmp/<name>-<pid>/frames/fNNNNN.jpg`
(frame = seconds x 30), or pull one from the MP4: `ffmpeg -ss 12.5 -i social/out/<id>.mp4 -frames:v 1 /tmp/f.png`.
Fix problems in the spec text first; change `social/reels/stage/` only when the layout itself is wrong, and
then re-render the three examples in `social/reels/examples/` to make sure the other formats still look right.

## 4. Hand it over

Outputs go to `social/out/` (git-ignored): `<id>.mp4` for upload, `<id>.jpg` as the cover or thumbnail,
`<id>.sheet.png` for review. The posting scripts in `social/publish/` read the MP4 and cover from there by
calendar id. Do not commit rendered files. Tell the user the paths, the duration, and anything you changed.

## How it works, in case you need to change it

- `social/reels/lib/plan.mjs` validates a spec and sets the timing of every scene and sound cue from the
  amount of text. `keyTimes` picks the contact-sheet frames, `coverTime` the cover.
- `social/reels/stage/stage.js` builds the frame as HTML and exposes `seek(t)`; every moving property is a pure
  function of `t`, with the app's one easing curve `cubic-bezier(0.22, 1, 0.36, 1)`. Several Chromium pages
  capture frames in parallel, so never use CSS transitions, animations or `Date`.
- `social/reels/lib/audio.mjs` synthesises the music (C, G, Am, F at 100 bpm with a soft beat that drops out
  under countdowns) and the ticks, pops and reveal chime; ffmpeg's loudnorm sets it to about -18 LUFS.
- Design rules come from `docs/DESIGN.md` and the unslop skill: colours from tokens, Figtree for words,
  Geist Mono for numbers, weights 400 to 600, sentence case, quick purposeful motion without bounce or loops.
