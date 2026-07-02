# Adding a sound

The checklist for adding a new generated sound to drift away, in the order
that works. Every sound is synthesized in the browser — no samples, no
streams ("generated, not borrowed"). The 9.0.x releases (Cat Purr, Wind
Chimes, Ticking Clock) walked exactly this path if you want worked examples.

## 1. Write the generator

Add `genYourSound(params)` to `src/audio/generators.ts`, composed from the
`src/audio/dsp.ts` helpers, and register it in `generatorMap`.

Rules the existing generators live by:

- **Deterministic.** All randomness goes through `random()` — the PRNG is
  seeded per render from the sound id + params (`regenerateSound`), so the
  same inputs are byte-identical. Never use `Math.random`.
- **Loop-clean.** The buffer is 32 s and will loop for hours. Snap periodic
  structure to the loop (whole cycles per loop — see `genPurr`'s breath
  fitting, `genClock`'s 32 beats, `genOcean`'s wave fitting; `lockFreq()` for
  raw sinusoids), don't start events in the last ~0.7 s (ring tails get
  crossfaded by the loop blend), and let `gen()`/`genStereo()` do the seam
  conditioning.
- **Not on rails.** Fixed-frequency LFOs read as a cycle within minutes; use
  `smoothRandomLfo()` (loop-closed random walks) for anything that breathes,
  gusts, or drifts. Event scheduling should cluster and rest, not tick.
- **No clicks.** Every discrete event gets an eased onset (raised-cosine
  attack) — or better, a resonator recurrence whose impulse response starts
  at zero (see the chime strikes, the clock knock).
- **Fast.** Budget a few hundred ms per render (bench against rain/ocean).
  Per-sample `Math.sin`·`Math.exp` on long tails is the usual sin — replace
  with two-tap damped-resonator recurrences (`y[n] = 2r·cos(w)·y[n-1] −
  r²·y[n-2]`, ~10× faster).
- **Stereo with intent.** Broad noisy beds: `decorrelateMono()` (bass-mono /
  treble-wide). Discrete events: equal-power panning to a held position.
  Compact or tonal sources (heartbeat, purr, fan, clock): stay mono/centred —
  widening them combs. See DESIGN.md "Stereo & masking".

## 2. Wire it through the app

Each step is one small edit; miss one and something specific breaks:

| Where | What | If you skip it |
|---|---|---|
| `src/audio/generators.ts` `generatorMap` | id → generator | sound renders nothing (and the library test fails) |
| `src/data.ts` `SOUND_LIBRARY` | `wavSound(id, name, Category)` | not in the library |
| `src/components/soundEditorDefs.ts` | editor model: sliders + variants | no editor; defaults come from here (they are the single source of truth for what plays) |
| `src/audio/layerMeta.ts` `LAYER_META` | role (`bed`/`motion`/`accent`) + mask group | masking ignores it (and config test fails) |
| `src/lib/soundIcons.ts` | Material Symbols glyph name | card shows no icon |
| `scripts/subset-icons.py` `ICONS` + re-run | add the glyph to the subset font | icon renders as its raw name in text — see README "Icons" |
| `src/data.ts` `DEFAULT_VOLUME` | only if the render runs hot/cold | starts at 0.5 like everything else |

Editor model conventions: variants are **characters, not intensity tiers**
(places, appliances, moments — "Around the Eaves", not "Medium"), ordered
calm → lively (the chip position-bars encode that order), with exactly one
variant carrying `{}` (the default — its values must equal the slider
`def`s). Slider labels say what the control literally does ("undertow",
"rail clatter", "wood knock" — not "depth", "texture", "tone").

## 3. Verify like you mean it

Unit tests cover every library sound automatically (validity, determinism
sample, variant distinctness — `tests/generators.test.ts`); add the new id to
the stereo-width or centred-mono lists there. Beyond the suite:

- **Probe the numbers.** Render in Node (stub `Blob`/`URL`, call
  `regenerateSound`) and check peak / RMS / crest per variant. Calibrate RMS
  against a neighbour (purr was matched to heartbeat's 0.106).
- **Look at it.** Waveform + spectrogram (any plotting stack). This is where
  the first-cut purr's broadband grain clicks, the chimes' 11-second dead
  gap, and the clock's glassy tops were caught before anyone heard them.
- **Play it.** `node scripts/sweep-sounds.mjs` with the dev server running —
  drives the real app, toggles every sound, and asserts signal reaches the
  master bus. This end-to-end check is the only thing that exercises worklet
  loading and the media-element routing (it's what caught live Birdsong
  being ~20 dB down while every unit test stayed green).
- The usual gate: `npm run typecheck && npm run lint && npm run test &&
  npm run test:e2e`.

## 4. Ship

Bump `package.json`, add the README changelog entry (what changed and *why*,
with the measured evidence), and — only if a kept param key changed meaning
incompatibly — see the saved-mixes note at the top of the README before
touching `STORAGE_KEYS`.
