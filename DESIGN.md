# Design

The visual system for **drift**, a calm, nocturnal, premium sleep-sound mixer.
Tokens defined in `src/index.css` (`:root`) are the single source of truth;
every component consumes tokens, never raw values. Tailwind is present only for
its base reset (`@tailwind base`); the app uses no Tailwind utility classes.

## Theme

Dark, nighttime, single-surface. A near-black blue-ink canvas under a procedural
starfield and a single drifting moon. The interface recedes so the sound, not
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
| `--surface-active` | `rgba(180,200,255,.06)` | Active card |
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

## Typography

Two families on a contrast axis (serif display + humanist sans), plus mono for
the dev sound-editor readouts. Never more than these three.

- `--font-display`: **Cormorant** italic — the `drift` wordmark and footer line only.
- `--font-body`: **Inter** (300/400/500) — everything else.
- `--font-mono`: SF Mono / Fira Code — sound-editor values.

### Scale
A deliberately compact product scale. The label tier is consolidated to a single
size; small controls sit one step up for legibility and one-handed tapping.

| Token | Size | Role |
|---|---|---|
| `--fs-display` | `clamp(2.4rem, 7vw, 3.2rem)` | Wordmark |
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
| `--shadow-card` | `0 10px 30px rgba(2,9,30,.35)` | Raised panels |
| `--glow-accent` | `0 0 24px var(--accent-glow)` | Active card / focused card halo |

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

A semantic scale, never arbitrary values: `--z-bg 0` (background, starfield,
watermark) · `--z-scene 1` (moon) · `--z-app 2` (app shell) · `--z-overlay 10`
(version stamp). `--z-modal 50` and `--z-toast 60` are reserved for future
layers.

## Components

One surface (the mixer). Shared interactive vocabulary:

- **Pill / chip** — category filters, preset chips, timer chips, sound-editor
  buttons. 1px border, transparent fill, `--fs-control`, accent or warm on
  active. The recurring control primitive.
- **Card** — sound tile: icon, name, dot↔equaliser indicator, reveal-on-active
  volume slider, optional editor handle. `--r-xl`, `--surface`, accent glow when
  active. Two-column grid.
- **Slider** — `.drift-slider`: 2px track, 10px accent thumb, accent fill via the
  shared `sliderFill()` helper (`src/lib/sliderFill.ts`). Used for master volume,
  per-sound volume, and editor parameters.
- **Play control** — 48px circular accent button; pulses while playing.

Every interactive control has default / hover / focus-visible / active states
(and disabled where relevant). Focus is keyboard-only (`:focus-visible`) with an
accent ring; cards ring the whole tile to avoid clipping inside `overflow:hidden`.

## Layout

Mobile-first, single column, `max-width: 520px`, centered, full-height scroll
region with hidden scrollbars. Header → master bar (play, timer, master volume)
→ presets → category filter → sound grid → footer. Safe-area insets are honored
top and bottom for notched devices. Responsiveness is structural (the column
caps and centers); type is fixed-rem, not fluid, except the wordmark.
