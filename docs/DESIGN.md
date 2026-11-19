# Periodica design contract

This document is the contract every screen follows. It was produced with **unslop**, created by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), licensed CC BY 4.0. The process, the passes, the tokens, the Do-not list and the checklist come from unslop and nothing else; the values below are this product's answers to it.

The foundation lives in `src/styles/index.css` (tokens and component classes), `src/components/motion.tsx` (motion tokens for motion/react) and the shared components in `src/components/`.

---

## 1. Unslop audit

The audit was run on the original UI (the `screenshots/` folder and the code at `git HEAD`) against `references/signs.md`. Verdict: **heavy slop**, signs in every group (colour, type, icons, copy, components, motion). The full process applies.

### Surfaces and colour

- Violet to cyan to mint gradient (`--grad`) on the primary button, the active tab bar marker, the difficulty pill, the logo tile, progress bars, the Home "Today" badge, the review icon tile, Learn path nodes, the chapter "Next" badge and the lesson start icon. `index.css` `.btn-primary`, `Shell.tsx`, `DifficultyPicker.tsx`, `Home.tsx` (64, 133, 202, 444, 523), `Learn.tsx` (30, 59, 60, 97, 118, 128, 355, 465), `Game.tsx` 369.
- Gradient text (`.text-grad`): Home headline ("Ready for round 15?", "Three minutes at a time."), the logo "Pa", Results score and "Level up!", Daily "#2", Game countdown and combo "×2", Learn mnemonic letters, Quiz combo, Match card backs, Progress "Mastered" figure, Home step numbers "01".
- Coloured glows: `btn-primary` cyan shadow, star `drop-shadow` glow in Results, element detail tile drop-shadow in its category colour, the selected tray tile glow in Game (654), the Home element-of-the-day tile drop-shadow (554), Learn flashcard shadows (501, 505), Learn "done" node `drop-shadow`.
- Radial colour washes and blurred blobs: `.aurora` (three drifting radial gradients behind every screen, App.tsx), `blur-3xl` blobs in Home cards (139, 263, 278, 291, 378, 479, 552), Play cards (56, 87, 116, 160), the element detail header blob, Learn flashcard and lesson washes (502, 503, 517, 550), the Life object tile (121), Play mode-card gradient corners (screenshot 17).
- Glass: `.glass` with `backdrop-filter: blur(18px) saturate(1.4)` (Home, Game, Explore), translucent `--surface` cards, blurred sticky header and tab bar, `backdrop-blur` behind sheets and results.
- Decorative texture: `.grain` noise overlay over the whole app, `.grid-lines` masked grid behind the Home hero and Progress.
- Many near identical accents: three accents (`--accent` violet, `--accent-2` cyan, `--accent-3` mint) used for labels, links, rings, borders and figures, so nothing stands out. Eyebrows "Place mode", "Learning path", "Explore" in cyan; XP in mint; selection in cyan; progress in gradient.
- Tiles with a 160° gradient, an inset white highlight and a radial sheen (`.tile`, `.tile::before`); slots with an inner shadow and radial highlight (`.slot`).
- Coloured icon fills: the orange filled flame in the header, achievement icons in tier colours, toast icons in tier colours.

### Type

- Space Grotesk 600 to 700 display headings everywhere (`.font-display` with -0.02em), Inter body: two families plus weights 400 to 700 (`font-bold` in Home, Progress, Game, Life, Learn, Play, Match, Results, Shell; `font-weight: 650` on the primary button).
- Uppercase tracked labels: "ELEMENT OF THE DAY" (Home 417), "LEVEL" and stat labels (Progress 36, 58, 190), "TIME", "SCORE" (Game 385, 391), "IN REAL LIFE" (Life 120), stat labels (Daily 124), "CHAPTER 1" (Learn 120), "FUN FACT" (Learn 531), "QUESTION 1 OF 10" (Quiz 231), "THE FINAL BOSS" (Play 163), "PAIRS", "MOVES", "TIME" (Match 116 to 126), "ACHIEVEMENT UNLOCKED" (Toasts), "DID YOU KNOW?", "WHERE YOU'LL FIND IT" and property labels (ElementDetail), "SCORE", stat labels, "WORTH ANOTHER LOOK" (Results), "APPEARANCE", "DEFAULT DIFFICULTY", "YOUR DATA" (SettingsSheet).
- Too many sizes: 10, 11, 12, 13, 14, 15, 17px plus text-xs to text-6xl and 140px on one flow.
- Numbers in mixed formats: "1,811 K" next to "1538 °C" in the element card; step numbers as "01".

### Icons

- Emoji as icons: chapter emoji on Learn path nodes (✨ 🧂 💥 🦴 🏊 🎈 🪙 ⚙️ 💻 💍 🧲 ☢️ 🔬, `lib/chapters.ts`), In Real Life objects (🧂 💧 📱 🎆 … `lib/everyday.ts`, shown at 72px in Life 121), the Home and Play "In Real Life" cards (📱 🎆 🍌 🦴), "💡 Fun fact" (Learn 532), "🔥 3 in a row!" (Match 183), ⚗️ in the share text.
- Sparkle icons for non-AI things: "Try a quick game" button (Sparkles), the "Rising Chemist" achievement (Sparkles), BrainCircuit for "Quiz Ace".
- Icons in many sizes, strokes and colours: 12 to 22px, strokes 1.8 to 3, filled flame, tier-coloured achievement icons.

### Spacing

- Half steps off the 4px grid: `py-3.5`, `gap-1.5`, `gap-2.5`, `px-2.5`, `mt-2.5`, `p-[1.5px]`, `-mt-[7px]`, `h-[66px] w-[57px]`, `h-[78px]`, `left-[38px]`.
- Equal things at different sizes: header controls 40px pills next to 36px close buttons and 44px buttons; cards with 24px and 28px radii and paddings of 20, 24 and 28.

### Copy

- Greeting headline: "Good morning. / Ready for round 15?" (Home 31, 75), plus "Up late".
- Exclamation marks: "Good try!", "Level up! Level 5" (Results), "Goal reached. See you tomorrow!", "You're on your way!" (Home 495, 501), "Spot on!", "Close!" (Life 39), "Match!" (Match 62), "🔥 3 in a row!" (Match 183).
- Trailing periods on headlines: "Learn the first 20 elements. Three minutes at a time." (Home), "Good morning."
- Wordy placeholder: "Search name, symbol, number…" (Explore 114).
- Hype adjectives: "fast, satisfying puzzle rounds" (index.html description), "Made for curious minds" (footer), "The living table", "The final boss".

### Components

- Pills everywhere: nav items, header indicators, chips, lens filters, difficulty picker, buttons, badges ("Today", "New best"), neighbour buttons, use tags (`rounded-full` in every screen).
- Badge above the hero: "Today · Daily #2 is live →" pill (Home 64).
- Logo as a gradient-outlined tile with gradient "Pa" text and a gradient favicon with a mint dot (`Shell.tsx`, `public/icon*.svg`).
- Glowing count pills: the header streak, goal and XP pills; the Results achievement pills.
- Equal cards with the same layout side by side on Home and Play, each with a blob in a different hue.
- A row of four checkmark claims under the Home hero ("3-minute lessons · Works offline · No sign-up · Free").

### Motion

- Looping motion: `.aurora` drifting for 28s forever, `.shine` sweeping across buttons and icons every 3.6s, `.pulse-ring` on hint cells (Game, Learn), the floating "element of the day" card (`repeat: Infinity`, Home 411), spinning electron shells in the element card.
- Bouncy springs with overshoot: `--ease-spring` (overshoot curve), motion `type: 'spring'` with low damping on stars (rotate from -90°), results blocks, sheets, toasts, nav pills, flashcards, quiz questions, countdown, tray tiles (Game, Home, Learn, Life, Quiz, Match, Explore).
- Hover lifts and scales: `.card-hover` translateY(-3px), `hover:scale-[1.35]` on the Home table, `hover:scale-[1.18]` on Explore cells, `hover:scale-105` on Learn nodes, `group-hover:-rotate-6` icons.
- Things flying in from different sides: quiz questions slide 40px from the right, Life objects rise 24px with springs, Home tiles pop in by position with springs, Results blocks spring 30px.
- Animated width on progress bars (Home 444, Learn 30, 355, Game 369, Quiz 220, Results level bar).
- Confetti in six neon hues on three stars.

### Template look

- Near-black #07070d with a violet-blue-mint accent trio and Space Grotesk: the generic "AI app" look. Swapping the name for any other learning app would change nothing outside the element tiles.

---

## 2. Direction

- **Product.** Periodica teaches students aged 12 to 18 the periodic table in three-minute lessons and quick games, placing elements on the table, flashcards, a quiz, match pairs, real-life objects and one daily challenge, free and offline.
- **Character.** Curious, exact, a little playful.
- **World.** The school chemistry room: the printed periodic table on the wall, each element a square of category colour with its atomic number in the corner, black ink on white paper, cobalt glass on the shelf.
- **Moments.** (1) The table itself: element tiles printed in their category colours, wherever the table or a tile appears (game board, Explore, mini tables, flashcards, chips). It is the only place many hues live. (2) The round result: three gold stars, the score set large, and the trail of what you placed.
- **Signature.** The corner number. Every element shown carries its atomic number in its top-left corner in small mono figures, exactly as the wall chart prints it: tiles, element chips, the review list, the detail card, the app icon. Nowhere else.

This is an app, so app rules apply: near-neutral surfaces, the moments carry the colour. The template check (unslop `signs.md`, "Template look") failed on a pure grey page with white text, so the ramp is unslop's Warm ramp: the paper the chart is printed on. Paper (light) is the default theme; dark is the same paper at night. The accent is cobalt ink on that paper.

---

## 3. Colour

One warm ramp, the chart's paper (unslop tokens, Warm). Saturation stays so low that a surface never reads as a colour.

| Role | Token | Dark | Light |
| --- | --- | --- | --- |
| Deepest surface | `--bg-deep` / `bg-bg-deep` | #12110f | #efeae1 |
| Page | `--bg` / `bg-bg` | #161513 | #f7f4ee |
| Card, sheet | `--surface` / `bg-surface` | #1c1a18 | #fdfbf7 |
| Raised: active row, input, secondary button | `--surface-2` / `bg-surface-2` (`bg-raised`) | #262421 | #efe9df |
| Hairline | `--line` / `border-line` | ink at 8% | ink at 8% |
| Strong hairline, empty track | `--line-strong` | ink at 16% | ink at 16% |
| Control edge: a control that must be found at rest (switch track and knob when off, `.field` border, chosen `.seg-item` ring) | `--line-control` / `border-line-control` | #7d776d | #8a8175 |
| Empty square in a mini table | `--mini-empty` | ink at 10% | ink at 8% |

`--line-control` is the one exception to quiet hairlines: it is 3:1 or better against bg, surface and surface-2 in both themes (WCAG 1.4.11), and only goes on the edges that tell a student where a control is or which option is chosen.

### Three text roles

| Role | Token | Dark | Light | Use |
| --- | --- | --- | --- | --- |
| Primary | `text-ink` | #efe9de | #1f1b16 | headings, body, values |
| Secondary | `text-ink-2` | #aaa398 | #5e554a | labels, descriptions, inactive nav |
| Muted | `text-ink-3` | #969085 | #6b6357 | meta, captions, units only (4.5:1 or better on every surface) |

### One accent: cobalt

`--accent` / `text-accent` / `bg-accent`: dark #6ea3ff (text on it `--on-accent` #0e0e10), light #1f5bd6 (white text, 6:1). Cobalt is element 27 and the blue of school lab glass.

The accent covers a few percent of a screen and only marks: the current selection (`.is-selected`, the active tab marker, chosen radio), progress (`.meter`, `Ring`), and the one key figure (the XP gained in a result). It is never a background wash, a border on every card, or a label colour.

**Primary action is not the accent.** `.btn-primary` is filled with the ramp's primary text colour: off-white with dark text on dark, near-black with white text on light. One per screen.

### Semantic colours (meaning only)

| Token | Dark | Light | Meaning |
| --- | --- | --- | --- |
| `--good` | #4cc38a | #13773a | correct, goal met |
| `--bad` | #ec5d61 | #c92a2a | wrong, destructive |
| `--star` (fill) / `--star-line` (edge) | #f2b53a / #c98f1e | #e8a400 / #8f5f00 | result stars, hint marker in the trail |
| `--gold` | #f2b53a | #8f5f00 | gold used as text ("New best") |

### Category colours (moment 1)

`--cat-*` stay as tuned, including the Okabe–Ito colour-blind set. They appear only on tiles, element chips, category dots, mini tables and the atom nucleus. Every size uses the same printed material: category colour mixed into the surface plus a category hairline. Tiles and chips mix by `--tile-tint`; `MiniTable` squares mix by `--mini-tint` (dark 52%, light 40%), stronger so a 10px square still reads, and never as a fully saturated block. Text on a tile is the category colour mixed with ink by `--cell-ink-mix`; measured worst cases with the flat tile: dark 6.9:1, light 5.6:1, colour-blind dark 6.0:1, colour-blind light 5.2:1.

### Removed and forbidden

Hue-to-hue gradients, gradient text, glows and coloured shadows, radial washes, blobs, glass and backdrop blur, grain and grid textures, neon borders. A gradient is allowed only as a small tone shift inside one neutral.

---

## 4. Type

- **Interface: Figtree** (`@fontsource-variable/figtree`, `font-sans`). Friendly and open, readable for young readers, with a little play in its round shapes. Chosen for "curious, a little playful".
- **Partner: Geist Mono** (`@fontsource-variable/geist-mono`, `.mono`, `font-mono`). For atomic numbers (the signature), figures in data, units, counts, keyboard hints. Chosen for "exact".
- No display face. `.font-display` is a deprecated no-op that renders Figtree.

| Use | Class | Size / line | Weight |
| --- | --- | --- | --- |
| Meta, counts, units | `.meta` (mono) | 12 / 16 | 400 |
| Section label (replaces every eyebrow) | `.label` | 13 / 20, `text-ink-2` | 500 |
| Secondary text, captions | `text-sm` / `text-[13px]` | 13 to 14 / 20 | 400 |
| Body, nav items | `text-[15px]` / `text-base` | 15 to 16 / 22 to 24 | 400 to 500 |
| Card heading | `.t-heading` | 20 / 28 | 500 |
| Page title | `.t-title` | 30 phones, 36 from sm / 1.15 | 500 |
| The one headline (Home hero, result) | `.t-display` | 36 phones, 48 from sm / 1.08, -0.02em | 500 |
| Result score | `num text-[56px]` | 56 / 1 | 500 |

Dates have one format, `formatDate()` in `src/lib/date.ts`: "Thu, Nov 19". The year is added only on the teacher summary ("Thu, Nov 19, 2026").

Rules: weights 400 and 500, 600 only for rare emphasis (the wordmark). `font-bold`, `font-extrabold` and `font-black` are capped to 600 by the theme so nothing renders heavier; do not use them. Sentence case everywhere, no `uppercase`, no `tracking-wider`. No negative tracking under 16px. No italic. Every figure is tabular: `.num` (Figtree tabular) for values in the interface family, `.mono` for meta and atomic numbers. One number format: `toLocaleString('en-US')` with grouping, temperatures as `1,538 °C`, times as `m:ss`, never zero-padded counts like `01`.

---

## 5. Spacing

4px grid: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96. A 2px step only inside small controls. No `*.5` Tailwind steps outside controls, no `[13px]`-style one-offs.

- Inside a control: 4 to 12. Rows in a list: gap 4 to 8. Label to its list: 8. Between groups: 16 to 24. Between sections: 32 to 64.
- Page edges: 16 on phones, 24 from sm. Content capped at `max-w-7xl` (1280), matching the header.
- Cards: padding 20 to 24 (`p-5`/`p-6`). Compact panels 16.
- Header 56 tall on phones, 64 from md. Nav rows 36. Tab bar 56 plus safe area.
- Touch targets: 44 on phones for every control (`.btn` is 44, `.icon-btn` 44 on phones and 36 from md, `.seg-item` 44 on phones and 40 from md, the header level link at least 44 wide).
- Focus is never hidden under fixed chrome (WCAG 2.4.11): `html` has `scroll-padding-top` for the sticky header and, below md, `scroll-padding-bottom` for the tab bar (56 + safe area + 16). The results overlay pads its own scroll for the pinned phone actions.

## 6. Radius and depth

| Element | Token / class | Radius |
| --- | --- | --- |
| Keycap, chip, small tag | `rounded-tag` | 6 (keycap 4) |
| Button, input, row, seg control, nav item | `rounded-control` | 10 (seg items 8 inside 2px padding) |
| Card, toast | `rounded-card` | 16 |
| Sheet, panel, dialog | `rounded-panel` | 20 |
| Element tile | `tileRadius(size)` | 14% of size, 4 to 20 |

Nested radius: inner = outer − padding, never below 4. A 16 card with 8 padding holds 8 radius items. Pills (`rounded-full`) only for things that are round by nature: toggles, dots, rings, the sheet grabber, progress tracks.

Depth: dark uses surface steps and hairlines only; things that float (sheets, toasts, the swipe hint) get `--shadow-md` / `--shadow-lg`, neutral. Light uses `--shadow-sm` (cards) and `--shadow-md` / `--shadow-lg` (floating). `--highlight` gives the active nav item and primary button a 1px top highlight on dark.

## 7. Motion

One curve, `cubic-bezier(0.22, 1, 0.36, 1)`: CSS `var(--ease-out)` and Tailwind `ease-out`; motion/react `EASE` from `src/components/motion.tsx`.

| Use | CSS | motion/react |
| --- | --- | --- |
| Hover, press, toggles | `var(--dur-press)` 150ms | `DUR.press` |
| Menus, popovers, toasts | `var(--dur-menu)` 200ms | `DUR.menu` |
| Entrances, sheets, layout | `var(--dur-enter)` 360ms | `DUR.enter` |
| Stagger | | `STAGGER` 50ms, at most six items |

- Use `tween(duration, delay)` or the `rise` preset. Never `type: 'spring'`, never overshoot, never `repeat: Infinity`.
- Hover is a colour or surface change (`.card-link`). Press is `scale(0.98)`. Rise on enter is 8px. One entrance per screen.
- Transition named properties only (`transition-colors`, `transition-[transform,opacity]`), never `transition-all`. Never animate width, height, top, left: progress fills use `transform: scaleX()` (`.meter-fill`).
- Feedback that explains is kept: the wrong-drop shake (`.animate-shake`, 4px), the red slot flash (`.flash-bad`), the correct-drop ring (`ripple`), the swipe hint nudge (3px, twice), number tweens (`AnimatedNumber`), the result stars appearing in turn.
- Removed: aurora drift, shine sweeps, pulse rings, floating cards, spinning electrons, hover lifts and scales, confetti.
- Reduced motion: the setting adds `.reduce-motion` and the OS setting is honoured in CSS; motion/react follows `MotionConfig reducedMotion={setting ? 'always' : 'user'}`, so the OS preference always applies and the app setting can only add reduction.
- Toasts appear at the top, and at the bottom while the results screen, an element card or settings is open, so they never cover a dialog's headline.

## 8. Icons

lucide only. 18px in controls and nav (20 in the phone tab bar), 16 inline with small text, stroke 1.5 everywhere. Colour is the text role, usually `text-ink-2` or `text-ink-3`; never a hue, never filled. 8px gap to the label. Drop icons that add nothing. Categories and achievement tiers that need colour get a `.dot`. No sparkles: the achievements that used Sparkles and BrainCircuit now name `BadgeCheck` and `ListChecks`. No emoji anywhere in the interface (the daily share text keeps its coloured squares because it leaves the app as plain text).

## 9. Copy

Plain, specific, no exclamation marks, no trailing periods on headlines, labels, buttons or captions (paragraphs keep theirs), sentence case, no greetings, no hype.

| Before (this app) | After |
| --- | --- |
| Good morning. Ready for round 15? | Next: Reactive metals (the region the primary button plays; a round counter means nothing to a student) |
| Learn the first 20 elements. **Three minutes at a time.** (second line in gradient) | Learn the first 20 elements. Three minutes at a time. (one colour; the e2e suite matches `/^Learn the first 20 elements\./`, so the wording stays) |
| Good try! | Good try |
| Level up! Level 5 | Level 5 reached |
| 55 XP to go. You're on your way! | 55 XP to today's goal |
| Goal reached. See you tomorrow! | Goal reached for today |
| Spot on! / Close! / Match! | Correct / Almost: it also contains … / Pair found |
| 🔥 3 in a row! | 3 in a row |
| 💡 Fun fact | Fun fact |
| DID YOU KNOW? | Did you know |
| Search name, symbol, number… | Search elements |
| Today · Daily #2 is live → | Daily #2 (a quiet text link) |
| Periodica turns the periodic table into fast, satisfying puzzle rounds | Learn the periodic table in three-minute lessons and quick games |
| Made for curious minds | (removed) |
| The living table (Explore) | The periodic table |
| Master the Periodic Table (browser title) | Periodica · Learn the periodic table |
| Daily Challenge #2, Match Pairs, In Real Life, Quick Quiz | Daily challenge #2, Match pairs, In real life, Quick quiz |
| The First Twenty, Lanthanides & Actinides, Lab Assistant (data names) | The first twenty, Lanthanides and actinides, Lab assistant |
| All 118 elements. The ultimate test. | All 118 elements in one round |
| Symbol and name only. The classic challenge. | Symbol and name only |

Changes say what they compare to ("+12 vs yesterday"). Accessible names the e2e suite relies on stay exactly as they are; when visible text and an accessible name differ, keep the name.

---

## 10. Component vocabulary

Screens build from these. Classes are in `src/styles/index.css` (`@layer components`, so Tailwind utilities on the same element win).

**Surfaces**
- `.card`: card surface, hairline, `rounded-card`. Add `.card-link` when the whole card is a link (surface step on hover, nothing moves).
- `.panel`: larger panel, `rounded-panel`.
- Raised areas inside a card: `bg-surface-2 rounded-control` (or `rounded-card` when padding is 16+ and the parent is a panel).

**Buttons** (all 44px tall, `rounded-control`, 15px 500)
- `.btn .btn-primary`: the one main action. `.btn-lg` (48) for the main call to action of a screen, `.btn-sm` (36) on desktop toolbars only.
- `.btn .btn-secondary`: second action.
- `.btn .btn-quiet`: tertiary, text only.
- `.btn .btn-danger`: destructive confirm.
- `.icon-btn`: square icon-only button (back, close, mute, settings). Always with `aria-label`.

**Controls**
- `.seg` + `.seg-item`: segmented control (difficulty, theme, lenses). Selected item via `aria-checked` / `aria-selected` / `aria-pressed` / `aria-current`: the surface step plus a `--line-control` ring, so the choice reads at 3:1.
- `Switch` (`src/components/Switch.tsx`): the only on/off control. Off: surface-2 track, `--line-control` edge and knob. On: accent track, `--on-accent` knob. Put it inside a `<label>` so the whole row is the target.
- `.field`: text input, 44 tall, `--line-control` border, accent on focus.
- `.chip`: quiet tag (uses, filters, meta), `rounded-tag`.
- `.kbd`: keyboard hint keycap.
- `.meter` + `.meter-fill` (style `transform: scaleX(v)`): progress bar. `Ring` (Stats.tsx) for circular progress.
- `.row`: list row, 44 min height, surface step on hover.
- `.is-selected`: selected option (accent soft fill, accent edge). `.is-target`: the one cell to act on (static accent ring).
- `.dot` (set `--c` or `background`): category or tier status dot.

**Type**: `.t-display`, `.t-title`, `.t-heading`, `.label`, `.meta`, `.num`, `.mono`.

**Elements (moment and signature)**
- `ElementTile` (`.tile`, `.tile-number`, `.tile-name`): the printed square, flat category tint, corner number in mono from 34px up. The name is never cut off: its size fits the tile's real width (container units), at most 13% of the tile and never under 8px.
- `ElementChip`: an element as a chip, symbol with corner number (9px or more, from 28px chips). Use it for review lists, lesson element lists, result lists, "contains" lists.
- `.cat-chip`, `.cat-ink`: category-tinted fill or text (set `--c`).
- `.slot`, `.slot-armed`: an empty place on the table.
- `MiniTable`, `PeriodicGrid`: the table at any size. `MiniTable` takes `flagged` to outline squares in `--bad` (the slips of a round). `PeriodicGrid` prints the f-block ranges ("57–71") only where they fit on one line at 9px. A table whose cells fall under 28px (Home on phones) is plain printed squares, no symbols or markers, never a zoomed-down desktop table.

**Moments and shared screens**
- `Results`: the result moment, in this order: headline, stars (the daily trail directly under them), then the summary card with the score set large and, under it, the round on a `MiniTable` (every element in its printed colour, slips outlined in `--bad`), the stats and the level meter; then the actions, then worth another look and achievements. Actions: one primary (Next, Share, or Play again), at most one secondary (Play again), and the way out ("All regions", "Home", "Back to path") as a quiet text button. On phones the actions are pinned to the bottom edge. At 1440x900 they sit in the first viewport.
- `TrailSquares`: the daily trail.
- Learn path: the chapter to do next is lifted above the list as its own card (32px chips, meta line, one `.btn-primary` "Start chapter N"); chapters already done are compact rows (number, title, stars).
- Match card back: a plain raised card with one hairline and a small `.slot` square, the "empty place on the table". Never the logo: "Pa" reads as Protactinium.
- `Sheet`: bottom sheet on phones, centred panel on larger screens.
- `Toasts`, `SettingsSheet`, `DifficultyPicker`, `ElementDetailSheet`, `GoalRingBadge`.

**Motion**: `EASE`, `DUR`, `STAGGER`, `rise`, `tween()` from `src/components/motion.tsx`.

**Removed.** The old effect classes and variables (`.text-grad`, `.glass`, `.aurora`, `.grid-lines`, `.grain`, `.shine`, `.card-hover`, `.solid`, `.pulse-ring`, `.font-display`, `.btn-ghost`, `--grad`, `--accent-2`, `--accent-3`, `--bg-2`, `--surface-solid`, `--on-grad`, `--ease-spring`, `--ease-out-expo`) no longer exist. Use `.card`/`.card-link`, `.is-target`, `.btn-secondary`, `--accent` and `ease-out`.

---

## 11. Checklist (from unslop, applied to every screen)

- [ ] The direction is written and every pass follows it
- [ ] Every spacing value is on the 4px scale and equal things have equal sizes
- [ ] Icons, labels and numbers each sit in one aligned column
- [ ] One tinted neutral ramp, three text roles, one accent with enough contrast
- [ ] No hue gradients, gradient text, glows, coloured shadows or colour blobs
- [ ] No emoji left in the interface
- [ ] One icon set at one size and stroke
- [ ] Type chosen for the character, weights 400 to 600, no uppercase tracked labels, no italic, no negative tracking on small text
- [ ] No exclamation marks, no trailing periods on short strings, no greeting headline, no unverified claims
- [ ] Numbers in one format with tabular figures
- [ ] Nested radii add up
- [ ] Table row states read apart: header, value in use, selection and keyboard focus are each recognizable
- [ ] Buttons share the control radius, no square corners against the component style
- [ ] The first screen is composed as a whole with no dead empty band
- [ ] No looping or bouncy motion, one easing curve, no animated layout properties
- [ ] Template check: swap the name for another product's. If the screen still fits, push the corner number, the tiles and the copy harder

Accessibility stays a hard floor: text 4.5:1, UI boundaries 3:1, visible focus rings (`:focus-visible`, 2px `--focus`), reduced motion, the colour-blind palette, 44px touch targets on phones, focus never hidden under the header or tab bar, and a `<main>` landmark on every screen (immersive screens such as games, lessons, the daily and the quiz bring their own). Unearned stars are drawn in `--ink-3` so the count reads at 3:1. De-emphasis never uses opacity on text: an option that steps back after an answer turns to plain ink at full text contrast and is marked `aria-disabled`.

---

unslop by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0. Keep this credit in copies and adaptations.
