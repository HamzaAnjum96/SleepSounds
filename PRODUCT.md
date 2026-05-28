# Product

## Register

product

## Users

People winding down for sleep. The typical session is in bed, lights off, phone
in one hand, half-awake, in a quiet room. They open drift to stop the day's
noise (mental or literal) and settle. A secondary group is the awake-but-focused
user: someone studying, reading, or trying to mask a noisy environment who wants
a sound bed running in the background.

The job to be done: assemble a calming soundscape and get it playing with as
little friction as possible, then forget the app exists. A meaningful minority
want to go further and shape the sound itself (tune rain density, fire
character, etc.) or save a mix they can return to night after night.

## Product Purpose

drift is a mobile-first ambient sound mixer. Every sound is generated in the
browser at runtime (procedural synthesis to WAV, no external audio files or
APIs), so the library is self-contained and works offline. Users blend multiple
calming sounds at once, adjust per-sound and master volume, fine-tune individual
sounds through per-sound editors, save and recall presets, and set a sleep timer
that stops playback automatically.

Success looks like: a user opens drift and has a soothing mix playing within
seconds, with no learning curve and nothing demanding their attention; and for
those who want it, the depth (editors, presets, timer) is there without ever
getting in the way of the simple path.

## Brand Personality

Calm, nocturnal, premium. Quiet and refined rather than soft and cute. The voice
is hushed and unhurried, set in lowercase ("rest well", "name this mix"), never
chirpy or salesy. The interface should feel like the last calm thing you touch
before sleep: dark, still, and confident enough to recede.

## Anti-references

- **Generic meditation-app pastels.** No Calm/Headspace purple-teal gradients,
  rounded blobs, or soft-wellness illustration. drift is darker and more
  restrained than the category default.
- **Busy dashboard / SaaS density.** Not a mixing console or admin panel. No
  wall of cards, dense control clusters, or data-tool busyness. Controls stay
  sparse and breathe.
- **Loud / playful / neon energy.** No bright saturated color, bouncy or
  gamified motion, or high-stimulation moments. Anything that raises arousal is
  wrong for a sleep context.

## Design Principles

- **Calm is the feature.** Every interaction should lower arousal, never raise
  it. When a choice is between more capability and more stillness, stillness
  wins unless capability is the whole point of the screen.
- **Seconds to sound.** The path from opening the app to a playing mix is short
  and obvious. Depth (editors, presets, timer) is opt-in and stays out of that
  path.
- **Quiet confidence.** Restraint over decoration. The interface earns trust by
  receding so the sound, not the UI, is the experience. No element shouts.
- **Forgiving in the dark.** Designed for half-asleep, one-handed, low-light
  use. Targets are generous, state is obvious at a glance, and nothing is
  destructive without being easy to undo.
- **Generated, not borrowed.** The sounds are synthesized in-house and the
  atmosphere (starfield, drifting moon) is hand-built, not stock. Authenticity
  is part of the product's character.

## Accessibility & Inclusion

No hard requirements were set, so these are the recommended baselines for a
dark, nighttime, one-handed app (refine as needed):

- **Contrast: target WCAG AA.** Body text ≥4.5:1, large text and controls ≥3:1
  against their background. On a near-black UI the standing risk is muted-gray
  text (and slider/label dimming) falling below threshold; keep an eye on
  `--text-secondary` / `--text-dim` usage for anything that must be read.
- **Reduced motion.** The ambient motion (star pulse, moon drift, play-button
  pulse, entrance reveals) should honor `prefers-reduced-motion: reduce` with a
  calm fallback, which matters more here than usual given the audience.
- **Generous touch targets** for one-handed, in-the-dark, half-asleep use, with
  obvious active/inactive states.
- **Keyboard and screen-reader support** for all controls (labels, roles, focus
  states), so the app isn't pointer-only.
