# Design

The visual system for **starlight**, a calm, nocturnal, premium sleep-sound mixer.
Tokens defined in `src/index.css` (`:root`) are the single source of truth;
every component consumes tokens, never raw values. Tailwind is present only for
its base reset (`@tailwind base`); the app uses no Tailwind utility classes.

## Theme

Dark, nighttime, single-surface. A near-black blue-ink canvas under a living,
seed-stable procedural starfield (canvas, `NightSky.tsx`) and a single drifting
moon. The sky reacts to the product: it brightens slightly while the mix plays,
settles when idle, dims through the last five minutes of the sleep timer, and
lets a rare meteor cross while playing. The interface recedes so the sound, not
the UI, is the experience. Light mode is intentionally not offered: the physical
scene is "in bed, lights off, phone in hand," which forces a dark theme.

Color strategy: **Restrained**. Tinted near-black neutrals carry the surface; a
single cool-blue accent marks active state and primary actions; a warm gold is
reserved for the sleep timer. No second hue competes.

## Color

OKLCH-adjacent ink palette, expressed as hex/RGBA tokens. Text tiers are tuned
for WCAG AA against `--surface-hover`, the lightest surface they render on —
not against `--bg`; see the Text table below for why that distinction matters.

### Surfaces
| Token | Value | Use |
|---|---|---|
| `--bg` | `#080c14` | Body canvas |
| `--surface` | `rgba(255,255,255,.035)` | Cards, master bar, inputs |
| `--surface-hover` | `rgba(255,255,255,.055)` | Card hover |
| `--surface-faint` | `rgba(255,255,255,.02)` | Inset groups, count badge |
| `--surface-sunken` | `rgba(0,0,0,.25)` | Code/output well |
| `--track` | `rgba(255,255,255,.10)` | Unfilled slider track |

### Lines
| Token | Value |
|---|---|
| `--border` | `rgba(255,255,255,.07)` |
| `--border-strong` | `rgba(255,255,255,.14)` |
| `--border-active` | `rgba(160,185,255,.22)` |

### Text (contrast on `--surface-hover`)
| Token | Value | Contrast | Use |
|---|---|---|---|
| `--text-primary` | `#dfe3ed` | 13.7:1 | Body, sound names |
| `--text-bright` | `#e8eef8` | ~15:1 | Active sound name |
| `--text-secondary` | `#98a1ba` | 6.8:1 | Labels, readouts, secondary controls |
| `--text-dim` | `#848da7` | 5.3:1 | De-emphasized marks, meta counts |

**Ratios are measured against `--surface-hover`, not `--bg`.** That is the
lightest surface these tiers actually render on, and it is the number that
decides whether they pass. Measuring against the bare background is what let an
earlier `--text-dim` ship documented at 4.63:1 while rendering at 4.16:1 inside
a panel: under the AA floor in every place it was really used (section meta,
footer, category counts, hints). All four tiers now clear AA for normal text
(≥4.5:1) on the lightest surface, so they clear it everywhere.

Two scoped overrides keep that promise where the canvas changes:

- `html.samsung-browser` lifts `--bg` to `#0d1626` to survive Samsung
  Internet's dark-mode pass. That lighter canvas costs contrast, so the ink is
  re-lifted alongside it (`#a3abc2` / `#9099b2`) rather than left to scrape the
  floor at 3.74:1.
- `prefers-contrast: more` raises both tiers again (`#b9c0d2` / `#a2aac0`),
  staying clear of the new baseline.

### Accent, warm, state
| Token | Value | Use |
|---|---|---|
| `--accent` | `#7ba7e8` | Active state, primary actions, slider fill |
| `--accent-glow` / `-tint` / `-tint-2` / `-line` | blue alphas | Glow, fills, borders |
| `--warm` | `#b89a6a` | Sleep timer only |
| `--warm-glow` / `--warm-line` | gold alphas | Timer active/hover |
| `--danger` | `#e07070` | Destructive hover (delete) |

### Category accents
Each sound family has a muted hue (`--cat` rgb triplet, set per `data-cat` on
the card; `--card-accent` resolves it). Active cards use it for border, glow,
icon, indicator, equaliser, slider fill, and a soft top-right corner wash
(`.sound-card::after`: invisible at rest, a hint on hover, gentle when active).
All ≥7:1 on `--bg`.

| Category | Triplet | Character |
|---|---|---|
| Water (default) | `123,167,232` | the signature blue |
| Fire | `224,158,96` | ember |
| Air | `159,196,216` | pale cyan |
| Earth | `163,179,138` | sage |
| Noise | `170,156,196` | dusty violet |
| Urban | `143,161,184` | steel |
| Wildlife | `143,191,154` | moss |
| Cozy | `209,166,114` | warm gold |

## Typography

Two families on a contrast axis (serif display + humanist sans), plus mono for
the dev sound-editor readouts. Never more than these three.

- `--font-display`: **Cormorant** italic — the `drift` wordmark, the brand
  moments in the scale below, and the whole footer (rest-well line, privacy
  link, version).
- `--font-body`: **Inter** (300/400/500) — everything else.
- `--font-mono`: SF Mono / Fira Code — sound-editor values.

### Scale
A deliberately compact product scale, with Cormorant italic carrying the brand
moments: the wordmark, the greeting, section headings (22px), scene and mix
names, the sheet title, and the drift-mode clock.

| Token | Size | Role |
|---|---|---|
| `--fs-display` | `clamp(2.4rem, 7vw, 3.2rem)` | Wordmark |
| (serif) | 22px | Section headings, sheet title |
| (serif) | 15–18px | Scene/mix names, mini-player title, greeting |
| `--fs-lead` | `0.8125rem` (13px) | Footer line, emphasis |
| `--fs-body` | `0.75rem` (12px) | Sound names, inputs, list rows |
| `--fs-control` | `0.6875rem` (11px) | Chips, buttons, secondary controls |
| `--fs-eyebrow` | `0.625rem` (10px) | Uppercase tracked labels, numeric readouts |

**Text is sized in rem, icons in px.** The scale is anchored to the reader's
own font size, not to 16px: in px, none of it moved when someone raised their
browser's default text size, so the app's smallest labels stayed at 10px no
matter what they asked for. The rem values are identical at the 16px default,
so nothing shifts for a reader who never changed it (verified pixel-for-pixel).

Icon glyphs (Material Symbols Rounded, 13–32px) deliberately stay in px and are
not part of the text scale: a glyph is sized to the control box it sits in, not
to reading, and scaling it would burst the fixed-size buttons around it. The
same goes for the small marks set in the body face inside fixed boxes — the
card ✕, the M/S layer toggles.

Because text scales, **containers that hold text must not be fixed-height.**
The scene and saved-mix cards use `min-height` and let a stretch flex row
equalise them, and the scene mood carries no line clamp: capping it at two
16px lines meant a larger text size silently ate the end of most scene
descriptions rather than giving them room.

Tracking: `--tracking-eyebrow` (0.2em) on all uppercase labels;
`--tracking-wordmark` (0.06em) on the wordmark.

## Spacing

A px-named linear scale: `--sp-2 · 4 · 5 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 ·
24 · 28 · 32 · 44 · 48`. Structural padding, gaps, and margins consume it.
Rhythm is varied deliberately (e.g. card padding `16 16 14`, header
`44 … 28`), not uniform.

## Radius

A **soft-square** system: controls are rounded *rectangles*, not capsules. A
shape reads as a pill once its radius reaches half its height, so controls stay
well under that. Scale: `--r-xs 6 · --r-sm 8 · --r-md 10 · --r-lg 12 · --r-xl 14
· --r-2xl 16 · --r-full 999` (the old `--r-pill 20` is gone). Components consume
the **semantic roles**, not raw numbers:

| Role | Value | Used by |
|---|---|---|
| `--radius-control-sm` | 8 | timer keys, install / cookie / toast actions |
| `--radius-control` | 10 | category filters, variant chips, fine-tune toggle |
| `--radius-button` | 12 | primary / secondary buttons (`.sheet-action`, `.crash-btn`) |
| `--radius-card` | 14 | sound cards, inline editor |
| `--radius-card-lg` | 16 | scene / mix cards, the short floating bars (mini-player, toast) |
| `--radius-sheet` | 20 | the tall now-playing sheet |
| `--r-full` | 999 | circles only — orbs, dots, thumbs, round icon buttons, slider track |

Circles are reserved for genuinely circular objects, never as a default button
shape. Category filters are `.cat-filter` (a soft-square tile), not `.cat-pill`,
so the language doesn't drift back toward capsules.

## Elevation

| Token | Value | Use |
|---|---|---|
| `--glow-accent` | `0 0 24px var(--accent-glow)` | Active card / focused card halo |

Glass surfaces (scene & mix cards, mini player, now-playing sheet, cookie
notice) share one material: a translucent tint over `backdrop-filter: blur()
saturate(1.2)`, a light-catching `inset 0 1px 0` top hairline, and a soft drop
shadow. The preset cards add their colour gradient as the tint and a top-left
sheen, so they read as tinted glass rather than flat tiles.

## Motion

Easing is a single exponential ease-out, `--ease`
`cubic-bezier(0.22, 1, 0.36, 1)`. Interaction durations come from a small scale:
`--dur-1 .15s · --dur-2 .2s · --dur-3 .25s · --dur-4 .35s`, with `--dur-enter
.7s` for the staggered first-paint reveals (header, master bar, sections, cards).

Signature ambient timings are intentionally bespoke and live outside the scale:
star pulse 12s, moon drift 14s, play-button pulse 2.8s, equaliser bounce 1.6s,
card spinner 0.8s, the dot↔equaliser crossfade 0.28s. The moon's scroll
parallax runs as a CSS scroll-driven animation (`scroll-timeline` on `.app`,
scoped to the fixed `.moon-track`) on the compositor where supported, with a
JS `--moon-scroll` handler as the fallback.

**Reduced motion:** `prefers-reduced-motion: reduce` disables all animation,
makes transitions instant, holds the moon and starfield still (no drift, no
parallax), and freezes the equaliser as a static mark so "playing" still reads.

**Unprompted motion has to earn its keep, and then stop.** The scenes shelf
winks once on load to teach that it scrolls sideways. It used to do that on
every load, which re-taught a nightly user the same lesson in the dark forever;
it now stops for good the first time they handle the shelf themselves (a
pointer, wheel or key gesture on the row, remembered in
`drift-scenes-explored`). A teaching animation that keeps playing after the
lesson has landed is just motion, and this app spends none of that on someone
trying to fall asleep.

## Z-index

A semantic scale, never arbitrary values: `--z-bg 0` (background, aurora,
starfield) · `--z-scene 1` (moon) · `--z-app 2` (app shell) · `--z-overlay 10`
(floating chrome) · `--z-player 30` (mini player) · `--z-sheet 40` (now-playing
sheet) · `--z-modal 50` (drift mode) · `--z-toast 60` (reserved).

## Architecture

Browse-first, player-persistent. One scrolling surface (scenes → your mixes →
the library) plus three layers above it:

- **Mini player** (`MiniPlayer.tsx`): a floating pill at the bottom whenever a
  mix is active. Play/pause with the sleep-timer ring, the mix title in serif,
  countdown or layer count, one tap into the sheet.
- **Now-playing sheet** (`NowPlayingSheet.tsx`): the mix's control room. Every
  active layer on its own category-colored slider with remove, master volume,
  the sleep timer (chips, countdown, "ends ~time"), and the doorways to drift
  mode and saving the mix. Glass panel, dialog semantics, Esc/backdrop closes.
- **Drift mode** (`DriftMode.tsx`): the fullscreen night surface (see below).

**Scenes** are the ten built-in presets presented as gradient-art cards in a
snap-scrolling shelf (`scenes.ts` holds the mood line + CSS-generated art per
scene). Tapping plays instantly; tapping the playing scene pauses. A hand-edit
of the mix clears the scene badge so it never lies. **Your mixes** are saved
presets as warm-bordered glass cards, each tinted by a gradient derived from
its own layers' category hues, with the layer icons, a serif name, layer
count, the dot-equaliser playing mark, and delete. Both shelves dissolve at
their side edges (mask fade) instead of hard-clipping mid-card.

## Components

Shared interactive vocabulary:

- **Pill / chip** — category filters, preset chips, timer chips, sound-editor
  buttons, "stop mix". 1px border, transparent fill, `--fs-control`, accent or
  warm on active. The recurring control primitive: **if it can be pressed, it
  wears this.** Uppercase `--fs-eyebrow` text means "static label" and nothing
  else, so a control never has to be told apart from the label beside it.
  Category filters size to their content and wrap; they are never stretched to
  share a row, which pushed their count badge outside their own border on a
  small phone and marooned their label on a wide screen. A filter's count badge
  is drawn only when that family has something playing.
- **Card** — sound tile: category-tinted icon (a quiet trace of the family hue
  even at rest), name, dot↔equaliser indicator, reveal-on-active
  volume slider, optional editor handle. `--r-xl`, `--surface`, accent glow when
  active. Two-column grid.
- **Toast** — `.toast`: one calm snackbar carrying the undo for destructive
  actions. Deliberately *not* a live region (the app's own status region
  already speaks the change; making the toast live announced everything
  twice), but its auto-dismiss is held while focus or the pointer is inside
  it — undo is the forgiveness mechanism and must never expire mid-reach.
- **Slider** — `.drift-slider`: a 6px track drawn on the track pseudo-element
  inside a 28px touch box, category/accent fill via the shared `sliderFill()`
  helper (`src/lib/sliderFill.ts`), and a bright 16px thumb (so the knob reads
  as a handle, never a same-color blob). Used for master volume, per-sound
  volume, and editor parameters.
- **Sound editor** — the shape-the-sound panel, inline in the library grid and
  tinted by its sound's category: sound glyph + serif title header, a "play"
  pill while the sound is silent (so shaping is always audible), icon-circle
  reset/close, and param rows that flow into two columns where the panel is
  wide enough. Groups divide with hairlines, never nested boxes.
- **Play control** — 48px circular accent button; pulses while playing. When a
  sleep timer is set, a warm 1.5px progress ring around it empties clockwise.
- **Mix controls** — the shared control body (`MixControls.tsx`): active layers
  with per-sound sliders, master volume, the sleep timer (presets, +30m/+1h,
  fade note), and the drift / save actions. Rendered inside the mobile
  now-playing **sheet** and the desktop **side panel**, so the two never drift
  apart. The mini player carries a bookmark **save** entry that opens straight
  into the name field, so saving isn't buried.
- **Toast** — a single calm snackbar above the player (`Toast.tsx`, `--z-toast`):
  a quiet line plus an optional action. Used for forgiveness on destructive
  acts — stopping a mix or deleting a saved one leaves a five-second **undo**.
- **Drift mode** — the fullscreen night surface (`DriftMode.tsx`): app chrome
  fades (`.app-quiet`), leaving the sky, a large Cormorant clock, mix names,
  countdown, and a centered control trio: an 84px breathing play orb flanked
  by two 56px companions, back-to-the-mixer on one side and stop-the-mix on
  the other. Controls recede after 5 still seconds; the clock stays. Wake
  lock held while open. The only surface where display type carries UI, a
  deliberate exception to the product register.

Every interactive control has default / hover / focus-visible / active states
(and disabled where relevant). Focus is keyboard-only (`:focus-visible`) with an
accent ring; cards ring the whole tile to avoid clipping inside `overflow:hidden`.

## Accessibility

WCAG AA contrast on all text tiers (see Color). Keyboard focus is accent-ringed
via `:focus-visible` on every control; cards ring the whole tile. Every slider
carries an aria-label; toggle chips expose `aria-pressed`; decorative marks are
aria-hidden. The page is landmarked — `<header>`, `<main>`, `<footer>`, and
the desktop mixer as a labelled `<aside>` — and an axe-core e2e gate
(`tests/e2e/a11y.spec.ts`) keeps every primary surface free of serious
violations. Drift mode is a proper dialog (focus moved in, restored on exit,
Esc closes). Reduced motion stills the entire scene, including the canvas sky.
Small chips keep a calm visual size but carry invisible touch halos toward the
44px guideline; `touch-action: manipulation` removes tap delay; pinch zoom
stays enabled. The halo is for marks that must stay small, not a licence for
real controls to be small: the mini-player play button is a true 44px, since
it is the control the app is mostly used through, in the dark and one-handed.
The one link in the shell (`.footer-privacy`) is underlined rather than set
apart by colour alone.

The **privacy page** (`public/privacy.html`) is a standalone static page with
its own copy of the palette, since it ships outside the React bundle. Keep its
`--ink / --dim / --muted / --accent` in step with the app's text ramp; they
drifted once, leaving its eyebrow at 3.38:1. It is inside the axe gate now.

**Forced colors** (Windows High Contrast) gets its own block. The forced
palette is mostly kind here — the app degrades to clean black on white — but
it discards our colours, and anything that spoke *only* in colour went silent:
the equaliser bars, scene/mix state marks and connectivity dot all flattened to
white on white, the active card was a 3.5% wash apart from a resting one, and
slider tracks (drawn on pseudo-element backgrounds) disappeared entirely. Each
is restated in system colours (`Highlight`, `CanvasText`, `Canvas`), so which
sounds are playing, and where every slider sits, stay readable. When adding
anything whose meaning rides on a fill or an accent, extend that block too. A first-run whisper above the grid teaches the mixer in one
line, then never returns.

## Layout

Mobile-first, single column, `max-width: 520px`, centered, full-height scroll
region with hidden scrollbars. Header (wordmark + time-of-day greeting) →
scenes shelf → your mixes → the library (category filter + sound grid) →
footer; the mini player floats above the bottom edge when a mix is active, and
horizontal shelves bleed to the viewport edge for the scroll. Safe-area insets
are honored top and bottom. Responsiveness is structural; type is fixed-rem,
not fluid, except the wordmark.

At `≥1000px` the shell becomes a **two-column split** (`.layout` grid, which is
`display:contents` below the breakpoint so mobile is untouched): browse on the
left, a persistent **side panel** on the right that holds the mix controls in
place instead of the slide-up sheet. The mini player and now-playing sheet stand
down on desktop; the panel and the sheet render the **same `MixControls`** body
(layers, master, sleep timer, drift, save), so the two surfaces never drift
apart. When nothing is playing the panel shows a calm idle line.

## Sound engine

All sound is generated in the browser; nothing is streamed. Synthesis is
lazy: no WAV is rendered at page load — each sound pays its ~50ms generation
cost inside the tap that first plays it, under the card spinner. The generator
module itself is code-split too, so the DSP isn't in the initial bundle; it's
fetched on the first play (and idle-prefetched after first paint). Two synthesis
paths: most sounds are procedural WAV loops crossfaded by `useAudioMixer`,
while the event-driven ones run as live **AudioWorklet** generators off the
main thread — Fire and Birdsong, and (v2.1) Rain, Thunder, and Windy Forest.
The worklets follow a bed + movement + discrete-event model (drops, claps,
leaf bursts), which is what makes environmental sound read as real rather than
as stationary noise. Each worklet source carries the old WAV as an automatic
fallback, and its editor sliders drive k-rate worklet params live.

### Stereo & masking (v4)

WAV loops render in **two channels**. Width is baked in at generation, not added
by a panner: broad beds (ocean, stream, wind, shower, the noise colours, train,
airplane, night) are **decorrelated bass-mono / treble-wide** — the low/mid band
stays shared (a fused mono centre, where the binaural system takes its
localisation cue) and only the high band is shifted in opposite directions per
channel (left slightly behind, right slightly ahead). Spreading the *whole* band
instead would drive the interaural correlation toward zero on steady noise, which
the ear hears as two separate sources on either side rather than one wide one;
keeping the lows shared fuses the image. Lows and highs are complementary bands,
so there's no within-channel comb filtering (the "jet engine" flange a dry+delayed
blend would create). Discrete events (surf, wind whistles,
bubbles, insect bands) are placed with **equal-power panning**
(`L=cos((p+1)·π/4)`, `R=sin((p+1)·π/4)`). Compact or non-directional sources —
brown noise, fan, the underwater body, heartbeat — stay deliberately centred,
since widening tonal/bass material combs or smears the image. The worklets pan a
**held position that drifts** between events rather than jittering per sample, so
a fire or bird reads as a located source that sways, not as fizz.

### Mix graph (v6)

Every source — live worklets and the rendered loops — runs through **one Web
Audio graph** (`src/audio/graph.ts`). A loop's `HTMLAudioElement` still drives
playback (so background / lock-screen behaviour is preserved) but is routed in
via `MediaElementAudioSourceNode`; worklets connect their gain node directly.
Each layer passes through its own **layer bus** (lowpass → high-shelf → trim)
before summing at the **master bus**: a gentle glue compressor, a master
high-shelf, and a fast safety limiter, with a post-limiter analyser for the
headroom meter. The chain is ~loudness-neutral on a single sound; it only works
when layers stack. If a platform refuses `MediaElementSource`, the element falls
back to direct output.

Masking is **two-dimensional**: `layerMeta.ts` tags every sound with a role
(bed/motion/accent) and mask group (broad/water/low/detail). `layerShaping`
returns a gain trim **and** spectral targets per active layer: beds/motion duck
for same-group neighbours, and when more than two broadband/water beds stack the
non-accent ones move out of each other's way — darker lowpass, high-shelf cut,
extra trim — applied on each layer bus (`useAudioMixer` recomputes on every
active-set change).

Per layer, **mute (M)** and **solo (S)** gate a layer's gain without removing it
(folded into the level, fade-safe). A **sleep-safe** toggle (default on,
persisted) deepens the master high-shelf and enables the spectral slotting; off
eases both back for a brighter balance. Defaults across the library are tuned
**sleep-first** (calmer beds, quieter crackle/whistle/sparkle, darker noise);
WAV loops render from their editor `def`s, the single source of truth for a
default.

## Failure states

The rule: **never confirm something that did not happen.** The app speaks its
successes out loud (a status region, a toast), so a swallowed failure does not
just lose the action — it actively tells the user the opposite.

Two paths were doing exactly that, and both now report:

- **Saving a mix.** The write was wrapped in a swallowing catch, so with
  storage refused (private browsing, an exhausted quota, storage switched off)
  the app announced "saved mix X", showed it in the shelf, stored nothing, and
  the mix was gone on the next open with no warning ever given. It now says
  `couldn't save "X" — it won't be here next time`, and the announcement no
  longer claims a save. The mix stays live for the session: it plays, and
  dropping it would help nobody.
- **Starting a sound** (below).


Sounds are synthesised at runtime rather than fetched, so "it did not start" is
a real possibility — a worklet that will not load, a generation that throws, a
context that will not resume — not just a network problem.

A layer the user **deliberately switches on** and which then fails to start
gets a toast (`couldn't start Fan`) with a **retry**, plus a live-region
announcement. It previously just flipped itself back off, leaving a control that
looked broken, while the status line said "stopped" as though the user had done
it on purpose. The tap is itself a user gesture, so autoplay policy is never the
cause here; something actually broke, and it is worth saying so.

Two neighbouring paths stay deliberately quiet, for reasons worth keeping
straight from the two above. The resume paths (`playAllActive`,
`restoreMixerState`) A blocked autoplay there is expected — the app restores last night's mix
paused precisely because a gesture is required — and it corrects itself on the
next tap. Reporting it would cry wolf on every cold open.

And the sound-order write (hold-to-arrange) stays quiet because it never
claims otherwise: the move genuinely happened, and the announcement describes
the move rather than a save. Losing the arrangement is a smaller harm than
being told a mix is safe when it is not.

Both reporting paths are gated by e2e tests that force the real failure —
rejecting `HTMLMediaElement.play`, and a `setItem` that throws
`QuotaExceededError` — and assert both that the failure speaks and that the
happy path stays silent and still persists.

## Dev mode

Five quick taps on the moon toggles it (session-only by design — a refresh
always lands back in the normal app). It reveals the held-back sounds, wanes
the moon to a crescent, marks the greeting, and **drains the colour out of the
whole app**: same layout, same components, same everything, just no hue.

The monochrome is a `grayscale(1)` filter on the document element, set from a
`dev-mono` class. It goes on `<html>` rather than into the React tree because
the things that need desaturating include every fixed layer painted outside the
shell — starfield, aurora, moon, mini player, sheets, drift mode, toast — and
the inline gradient art on the scene and saved-mix cards, which no token
override could reach. The transition lives on `html` rather than inside
`.dev-mono` so the fade is symmetric, grey on the way in and colour on the way
out, for the same reason the moon's crescent is a real child rather than a
one-shot animation.

Two things were checked rather than assumed, because a filter creates a
containing block and a new stacking context:

- **Fixed positioning survives it.** The mini player stays pinned while the
  shell scrolls under it, the sheet stays flush to the bottom edge, and drift
  mode still covers the viewport exactly.
- **It is free.** Measured 3.8% main-thread time in dev mode against 4.4%
  normal over eight seconds — the filter composites on the GPU and does not
  fight the starfield.

Gated by an e2e test that samples real pixels (a grayscale filter is invisible
to the DOM): colour goes from ~46% of lit pixels to 0.00% and back on toggle,
while the header and player boxes do not move.

## Short viewports

The vertical rhythm is tuned for a portrait phone, and one rule made turning
that phone sideways worse than it had to be: the wordmark is sized off viewport
*width* (`7vw`), so landscape grew it to its `3.2rem` cap at exactly the moment
height became scarce. Measured on an 844x390 landscape phone, the header took
**39%** of the screen and the library — the actual product — began at y=421,
past the fold; at 740x360 the first scene card was cut off outright.

A `@media (max-height: 500px)` block pins the wordmark to a fixed `2.2rem` and
tightens the header padding, greeting and section rhythm. Header goes from 39%
to 23% of the screen, and the scene card that was cut off now fits. It keys off
the constraint that actually binds (height), not a device guess, so a short
desktop window gets the same relief; portrait phones (~844px) and desktops
(~900px) are untouched, verified pixel-for-pixel.

Two things to keep in mind when adding rules there:

- **A media query adds no specificity.** Declared before the base `header` and
  `.section` rules it simply lost the cascade, and only the token override took
  effect. It lives after them for that reason.
- Anything sized in `vw` is worth a second thought: on a phone, width and
  height swap places.

Known and accepted: with 12+ layers in the mix, the sleep timer and drift-mode
actions sit below the fold of the now-playing sheet (measured: 1290px of content
in a 587px window at 19 layers). Everything is still reachable by scrolling, and
reordering the sheet would disturb its drag-to-close and focus-trap behaviour,
so this is a note rather than a change.

## Direction and locale

The shell is built from **logical properties**, so setting `dir="rtl"` on the
document mirrors it: `inset-inline-start/end` rather than `left/right`,
`padding-inline-end` rather than `padding-right`, `text-align: start` rather
than `left`. Converting the 22 physical properties that were left changed
nothing in LTR (verified pixel-for-pixel across a full-page render) and is the
whole reason the mirrored layout works at all.

Three things stay deliberately physical, because they are:

- `left: 50%` paired with `translateX(-50%)` on the mini player, toast and
  storage notice. Transforms are always physical, so this pair centres
  correctly in both directions; `inset-inline-start` here would break RTL.
- Icon and moon geometry that is scenery rather than reading order.
- The starfield canvas, which is painted, not laid out.

Mirroring is not only CSS. Four behaviours read direction at runtime, and each
was wrong before:

- **Slider fill.** Chromium reverses a range input under RTL, but a gradient
  angle is physical, so the painted fill sat on the opposite side of the thumb
  from the portion it represents. A `[dir="rtl"]` track rule flips it.
- **Drag-and-drop reorder.** Column centres cluster left-to-right while slots
  run in DOM order, so every drop landed in the horizontally-opposite cell
  until the column index is mirrored.
- **Keyboard reorder.** Left/right are physical keys against a logical order,
  so the arrow that moves a card back is the right one under RTL.
- **The scenes-shelf wink.** `scrollLeft` runs negative under RTL, so a hard
  `+56` shoved the shelf into its already-visible edge.

Both the mirrored layout and the mirrored drop geometry are gated by e2e tests.

User-supplied text (saved mix names) is wrapped in `<bdi>`: a name in the
opposite script would otherwise reorder the punctuation and counts around it.
Percentages go through `Intl.NumberFormat` (`src/lib/format.ts`) rather than
`${Math.round(v * 100)}%`, since digits and percent-sign placement are
locale-specific even before anything is translated.

**Not done, deliberately:** the interface strings are still English literals in
the components. A message catalogue is an architectural change, and shipping
one with no translations in it would be scaffolding. What is here is the part
that is expensive to retrofit later — layout, geometry, and formatting — so
adding a locale becomes a translation job rather than a rebuild.

## Known trade: the volume taper

Layer and master volume map **linearly to amplitude** — the slider value goes
straight to `HTMLMediaElement.volume` / `GainNode.gain` with no perceptual
curve. Measured, that puts the whole top half of a fader's travel inside 6 dB
(slider 0.5 is -6 dB, roughly 66% as loud, not 50%), while the bottom tenth
spans silence to -20 dB. So the quiet end is hypersensitive and the loud end is
mushy — the opposite of what balancing layers at bedtime wants.

A perceptual taper (`gain = x²`, or a proper dB curve) is the standard fix, and
it is deliberately **not** applied here: every saved mix stores its raw slider
values, and all ten built-in scenes were hand-tuned by ear against the current
mapping. Changing the curve silently re-voices all of them, quieter. That is a
product decision about how the library should sound, with a data migration
attached — not a refactor to make unilaterally.

## Performance

The one number this app is judged on is what it costs to leave running. The
starfield is the only thing animating on its own once a mix is playing, so it
sets that floor: it draws ~30fps and, since 0.1.22, *wakes* only ~30 times a
second. The cap used to sit inside a display-rate `requestAnimationFrame` loop
— measured 60 wakeups a second to deliver 21.8 frames, and on a 120Hz phone it
would have been 120 for the same. Sleeping between frames and only then asking
for a paint halved the wakeups and, because the old timestamp throttle drifted
past its own interval, actually raised the delivered rate to the documented 30.
The loop still stops dead on a hidden tab and still degrades to a single static
frame under reduced motion.

Measured, and deliberately left alone: the breathing play orb in drift mode
animates `box-shadow`, normally a repaint smell, but drift mode costs *less*
main-thread time than the mixer (9.6% vs 11.4% over ten seconds, with identical
style and layout time), so there is no signal to optimise against. The
dominant cost while playing is the audio graph itself, which is the product.

## Atmosphere

Three fixed layers behind the shell: the `bg-layer` gradients, the **aurora**
(two transform-animated drifts of indigo/violet/teal at ≤0.10 alpha, 90s loop),
and the living starfield canvas. The moon floats above them. Everything stills
under reduced motion.
