# Tail-sounds refinement — research notes

Research pass over the six least-mature sounds (train, airplane, heartbeat,
purr, chimes, clock) ahead of the 0.0.39–0.0.44 refinements. Each change is
grounded in how the real source behaves, kept deliberately conservative, and
level-matched against the baseline probe (`RMS per variant within ~1 dB`).

Baseline probe (mixed-to-mono RMS / peak per variant, 32 s render):

| sound | variant | rms | peak | structural |
|---|---|---|---|---|
| train | Distant Line / Sleeper / Old Local / Express | .134 / .104 / .102 / .094 | .61–.67 | clack band (1.1–6 k) rms .0135–.0197 |
| airplane | Night / Cruise / Wing / Chop | .127–.141 | .59–.61 | 60–160 Hz AM index .02–.04 (no coherent beat) |
| heartbeat | Asleep / Rest / Chest / Womb | .071–.077 | .60 | interval lag-1 ≈ −0.5…0 (white jitter) |
| purr | Dozing / Content / Deep | .108–.114 | .62 | matches documented 0.106 calibration |
| chimes | Still / Deep / Breeze / Dancing | .057–.062 | .40–.49 | 25–50 strikes per loop |
| clock | Pendulum / Bare / Even / Pocket | .018–.032 | .80 | 16–60 ticks per loop |

## Train — the four-beat clickety-clack

On jointed track a coach rides on **two bogies** (two axles each, ~2.6 m
apart) whose centres sit ~15–16 m apart under a ~20 m body, while rails run
~18–20 m. Each fixed joint therefore fires **four** clacks per coach: the
leading axle pair, then — after the bogie spacing has passed — the trailing
pair. With bogie spacing (≈15.7 m) close to rail length (19 m), the trailing
pair of one joint lands just before the leading pair of the next, grouping
into the classic *da-da … da-da ……* gallop every rail length. The previous
render fired a **single** axle pair per joint — a two-beat, which is the
rhythm of a two-axle freight wagon, not a passenger coach.

Change: emit both bogie passes per joint (trailing pair a touch softer,
±1 % spacing wobble), halve the per-heavy-clack floor-thump chance
(0.4 → 0.28) and scale per-clack strength ×0.72 so the clack-band energy and
overall level stay at baseline. Welded-out joints (15 %) stay silent for both
bogies — the joint is missing, not the bogie.

## Airplane — the twin-engine beat

Two engines in cruise never hold exactly the same shaft speed; their cabin
tones sit a fraction of a Hz apart and *beat* — the slow wah…wah swell every
few seconds that is one of the most recognisable cabin signatures (it's what
"synchrophasers" on props exist to tame). The render had a single fundamental
plus a 2.02× partner: no physical beat, only a random amplitude LFO (measured
AM index 0.02–0.04 with no stable rate).

Change: split the fundamental into two engines ~0.31 Hz apart (both
loop-locked — the offset is an exact multiple of the 1/32 Hz loop grid, so
the beat phase closes over the seam), each at 1/√2 of the old amplitude so
total tonal power is unchanged. Expected: 60–160 Hz AM index rises with a
stable peak near 0.31 Hz.

## Heartbeat — respiratory sinus arrhythmia

A resting heart does not jitter white: it swings smoothly with breathing
(faster on the inhale, slower on the exhale — respiratory sinus arrhythmia),
a few percent either way over each ~4 s breath, strongest in exactly the
relaxed, drifting-off state this sound is for. The render drew each beat
interval i.i.d. (±2.25 %), so successive intervals were uncorrelated.

Change: modulate the interval with a slow loop-closed random wander
(±4 %, 1.8–3.2 s holds — breathing-paced) plus a much smaller white jitter
(±1 %). Expected: measured interval lag-1 correlation rises clearly above
the baseline (which sits ≤0 — detector differencing pushes white jitter
negative). Mean rate, S1/S2 voicing and timing are untouched.

## Purr — a body that shifts

Sissom, Rice & Peters (1991) put the domestic purr near 26 Hz with the
ingressive phase slightly higher-pitched — both already modeled. What the
render held constant was the **body**: the chest/throat resonance the pulses
ring was one fixed frequency for the whole 32 s. A real cat against you
shifts, and the coupling (and so the resonant colour) moves a little with
every breath.

Change: draw a per-breath resonance multiplier (±4 %) and per-breath throat
weight (0.32–0.44), alongside the existing per-breath pitch/level/share
draws. Pulse rate, breath envelope and muffle voicing are untouched.

## Chimes — strike points and clapper bounces

Two things a real clapper does that the render didn't:

1. **It hits at varying points.** Which transverse modes a strike excites
   depends on where the clapper lands; the render's mode balance was fixed
   per render. Change: per-strike mode-amplitude jitter, wider on higher
   modes (±15 % on mode 2 up to ±40 % on mode 4) — the fundamental barely
   moves, the sparkle above it varies naturally.
2. **It bounces.** A clapper that swings into a tube often re-contacts it
   ~40–90 ms later at a fraction of the energy — a soft *to-tok* double.
   Change: 22 % of strikes get a same-tube re-contact at 25–45 % amplitude
   (never inside the loop-seam guard).

## Clock — the second contact rings too

The escapement's secondary contact (~11 ms behind the beat) was rendered as
pure noise — a "tk…sh". A real second contact excites the same plate/gear
resonance as the main one, only weaker and darker. Change: give the echo a
small damped ring at 0.85× the beat frequency under its noise (energy split
so the echo's total level is unchanged), and let its delay wobble ±1.5 ms
per beat (mechanical variation). Beat structure, pace/contrast/brightness
voicing, and the bare-mechanism character are untouched.

## Listening feedback (0.0.45–0.0.47)

Three fixes from real listening after the refinement pass:

- **Train (0.0.45): the keyboard click.** The joint-clack noise bursts started
  at full amplitude on their first sample — an instant broadband edge whose
  spectral splatter cuts far above the clack's own lowpass and reads as a
  keyboard key, not a wheel. This was the one discrete event in the library
  violating the no-clicks rule. A ~1.2 ms raised-cosine attack halves the
  measured worst-case high-band edge (max |Δx| above 3 kHz: 0.134 → 0.067
  default, 0.166 → 0.074 Old Local) with clack-band and overall RMS unchanged
  (±0.15 dB).
- **Chimes (0.0.46): opening on a dying ring.** The generic loop blend
  crossfades the *end* of the buffer into its first 1.2 s, so on first play
  the chimes opened mid-decay — a ring you never heard struck. Strike
  probability now tapers away over the ~3 s before the seam guard (so the
  material the blend copies forward is quiet), forced lull-bridging strikes
  skip the taper zone, and a guaranteed opening strike lands in the first
  half-second so the loop begins with a chime beginning. Loop-seam
  continuity is untouched — the blend still runs; there's simply little left
  for it to smear.
- **Clock (0.0.47): too much like wood.** A single decaying sine is
  literally the woodblock model; metal reads as *inharmonic partials*. Each
  tick now rings two faint inharmonic partials (1.63× and 2.47× the beat
  frequency, per-beat micro-detuned, faster-decaying) under the fundamental,
  sitting below the top-safety shelf. Beat structure and tick counts are
  unchanged; levels within the usual gate.

## What was deliberately left alone

- Train's removed hiss layers (9.1.x listener feedback) stay removed.
- Clock's bare-mechanism base (listener-chosen) keeps zero room/case noise.
- Purr's breath rate/envelope (0.0-era calibration against panting) unchanged.
- All mono/stereo policies unchanged (heartbeat/purr/clock centred;
  train/airplane/chimes wide) — pinned by tests.
