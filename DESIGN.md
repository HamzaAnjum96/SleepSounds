# Design

The visual system for **drift away**, a calm, nocturnal, premium sleep-sound mixer.
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
for WCAG AA on `--bg` (contrast noted).

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

### Text (contrast on `--bg`)
| Token | Value | Contrast | Use |
|---|---|---|---|
| `--text-primary` | `#dfe3ed` | 15.2:1 | Body, sound names |
| `--text-bright` | `#e8eef8` | ~16:1 | Active sound name |
| `--text-secondary` | `#727b9a` | 4.7:1 | Labels, readouts, secondary controls |
| `--text-dim` | `#5e657c` | 3.4:1 | De-emphasized marks, decorative dots |

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
| `--fs-lead` | 13px | Footer line, emphasis |
| `--fs-body` | 12px | Sound names, inputs, list rows |
| `--fs-control` | 11px | Chips, buttons, secondary controls |
| `--fs-eyebrow` | 10px | Uppercase tracked labels, numeric readouts |

Tracking: `--tracking-eyebrow` (0.2em) on all uppercase labels;
`--tracking-wordmark` (0.06em) on the wordmark. Icon glyph sizes (Material
Symbols Rounded, 13–32px) are set per-context and are not part of the text scale.

## Spacing

A px-named linear scale: `--sp-2 · 4 · 5 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 ·
24 · 28 · 32 · 44 · 48`. Structural padding, gaps, and margins consume it.
Rhythm is varied deliberately (e.g. card padding `16 16 14`, header
`44 … 28`), not uniform.

## Radius

`--r-xs 6 · --r-sm 8 · --r-md 10 · --r-lg 12 · --r-xl 14 · --r-pill 20 ·
--r-full 999`. Cards and the master bar use `--r-xl`; pills and chips use
`--r-pill`; circular controls use `--r-full`.

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
card spinner 0.8s, the dot↔equaliser crossfade 0.28s.

**Reduced motion:** `prefers-reduced-motion: reduce` disables all animation,
makes transitions instant, holds the moon and starfield still (no drift, no
parallax), and freezes the equaliser as a static mark so "playing" still reads.

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

**Scenes** are the eight built-in presets presented as gradient-art cards in a
snap-scrolling shelf (`scenes.ts` holds the mood line + CSS-generated art per
scene). Tapping plays instantly; tapping the playing scene pauses. A hand-edit
of the mix clears the scene badge so it never lies. **Your mixes** are saved
presets as warm-bordered serif cards with layer counts and delete.

## Components

Shared interactive vocabulary:

- **Pill / chip** — category filters, preset chips, timer chips, sound-editor
  buttons. 1px border, transparent fill, `--fs-control`, accent or warm on
  active. The recurring control primitive.
- **Card** — sound tile: category-tinted icon (a quiet trace of the family hue
  even at rest), name, dot↔equaliser indicator, reveal-on-active
  volume slider, optional editor handle. `--r-xl`, `--surface`, accent glow when
  active. Two-column grid.
- **Slider** — `.drift-slider`: 2px track, 10px accent thumb, accent fill via the
  shared `sliderFill()` helper (`src/lib/sliderFill.ts`). Used for master volume,
  per-sound volume, and editor parameters.
- **Play control** — 48px circular accent button; pulses while playing. When a
  sleep timer is set, a warm 1.5px progress ring around it empties clockwise.
- **Drift mode** — the fullscreen night surface (`DriftMode.tsx`): app chrome
  fades (`.app-quiet`), leaving the sky, a large Cormorant clock, mix names,
  countdown, and an 84px breathing play orb. Controls recede after 5 still
  seconds; the clock stays. Wake lock held while open. The only surface where
  display type carries UI, a deliberate exception to the product register.

Every interactive control has default / hover / focus-visible / active states
(and disabled where relevant). Focus is keyboard-only (`:focus-visible`) with an
accent ring; cards ring the whole tile to avoid clipping inside `overflow:hidden`.

## Accessibility

WCAG AA contrast on all text tiers (see Color). Keyboard focus is accent-ringed
via `:focus-visible` on every control; cards ring the whole tile. Every slider
carries an aria-label; toggle chips expose `aria-pressed`; decorative marks are
aria-hidden. Drift mode is a proper dialog (focus moved in, restored on exit,
Esc closes). Reduced motion stills the entire scene, including the canvas sky.
Small chips keep a calm visual size but carry invisible touch halos toward the
44px guideline; `touch-action: manipulation` removes tap delay; pinch zoom
stays enabled. A first-run whisper above the grid teaches the mixer in one
line, then never returns.

## Layout

Mobile-first, single column, `max-width: 520px`, centered, full-height scroll
region with hidden scrollbars. Header (wordmark + time-of-day greeting) →
scenes shelf → your mixes → the library (category filter + sound grid) →
footer; the mini player floats above the bottom edge when a mix is active, and
horizontal shelves bleed to the viewport edge for the scroll. Safe-area insets
are honored top and bottom. Responsiveness is structural; type is fixed-rem,
not fluid, except the wordmark.

## Sound engine

All sound is generated in the browser; nothing is streamed. Two synthesis
paths: most sounds are procedural WAV loops crossfaded by `useAudioMixer`,
while the event-driven ones run as live **AudioWorklet** generators off the
main thread — Fire and Birdsong, and (v2.1) Rain, Thunder, and Windy Forest.
The worklets follow a bed + movement + discrete-event model (drops, claps,
leaf bursts), which is what makes environmental sound read as real rather than
as stationary noise. Each worklet source carries the old WAV as an automatic
fallback, and its editor sliders drive k-rate worklet params live.

## Atmosphere

Three fixed layers behind the shell: the `bg-layer` gradients, the **aurora**
(two transform-animated drifts of indigo/violet/teal at ≤0.10 alpha, 90s loop),
and the living starfield canvas. The moon floats above them. Everything stills
under reduced motion.
