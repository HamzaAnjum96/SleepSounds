# Architecture

How **starlight** is put together. This complements the file map in
[`README.md`](README.md) and the visual system in [`DESIGN.md`](DESIGN.md);
here we cover the runtime: how a tap becomes sound, how the audio graph is
staged, how playback survives backgrounding and interruptions, how state is
persisted, and how the app updates itself. No backend is involved — everything
runs in the browser.

## The shape of it

```
        UI (React)                     Audio engine (no React)
  ┌────────────────────┐         ┌──────────────────────────────┐
  │ App.tsx            │         │ sources.ts  makeSource()     │
  │  useAudioMixer ────┼────────▶│   CrossfadeAudio (WAV loops) │
  │  useSleepTimer     │  state  │   WorkletWithFallback        │
  │  components/…      │◀────────┤     └ WorkletSource + WAV    │
  └────────────────────┘  meters └──────────────┬───────────────┘
            │                                    │ all layers
            │ persistence                        ▼
        storage/ (localStorage + migrations)  graph.ts  master bus
                                              (compressor→shelf→limiter→out)
```

The React layer owns *intent* (what should be playing, at what level, with what
tuning). The audio engine owns *sound* (nodes, elements, scheduling) and is
deliberately framework-free so it can be reasoned about and tested on its own.
`useAudioMixer` is the seam between them.

## Sound sources

Every library sound resolves to one `MixerSource` (`audio/sources.ts`):

- **`CrossfadeAudio`** — a pair of `<audio>` elements playing a procedurally
  rendered WAV loop, equal-power crossfaded near the loop seam so the 32-second
  loop never clicks. Used directly for the WAV-only sounds (fan, ocean, noise…).
- **`WorkletSource`** — a live `AudioWorkletProcessor` (rain, fire, thunder,
  birdsong, windy forest) whose parameters are automated at k-rate, so the
  editor's sliders/variants change the sound in real time.
- **`WorkletWithFallback`** — a worklet primary with a `CrossfadeAudio` of the
  pre-rendered WAV as a safety net. If the worklet module can't load (old
  browser, blocked module script) the source fails over seamlessly. This is why
  every worklet sound also has a generator in `generators.ts`.

A source's first `play()` can wait seconds — on the generator module, the
render, or the worklet module. Every source therefore keeps a *play intent*
that `pause()`, `stop()` and `destroy()` bump: a `play()` that finds its intent
superseded when its awaits return bows out without starting. Without it, a
layer switched off while still loading would start on its own once the render
landed, with its card showing off.

The WAV loops are synthesized on demand from `audio/generators.ts` over the
`audio/dsp.ts` helpers, code-split so the DSP module loads on a sound's first
play rather than at startup. Renders are seeded (a stable PRNG keyed on sound id
+ params), so the same inputs always produce byte-identical audio — which is
what makes the generators snapshot-testable.

Adding a sound touches seven files in a fixed order (generator → library →
editor model → layer meta → icons → subset font → tests); the full checklist,
with the synthesis rules and the verification recipe, is
[`docs/ADDING-A-SOUND.md`](docs/ADDING-A-SOUND.md).

## The master bus

All layers feed one `AudioContext` through a single master chain
(`audio/graph.ts`): per-layer bus (lowpass → high-shelf → trim) → master input →
gentle glue compressor → calming high-shelf → brick limiter → analyser →
destination. The chain is ~loudness-neutral on a single sound and only does real
work when several broadband layers pile up. The analyser is tapped for the
headroom meter and for tests (`__driftMasterPeak`).

Per-layer **masking** (`audio/layerMeta.ts`) ducks and darkens stacked beds so
several broadband sounds at once stay clear instead of fogging or sharpening
together; it's recomputed whenever the active set changes.

## Playback intent, fades, and tuning

`hooks/useAudioMixer.ts` holds `soundState` (per-sound enabled/volume/tuning),
`masterVolume`, the wind-down `masterFade`, and mute/solo. It:

- fades layers in/out (`doFadeIn`/`doFadeOut`) so nothing starts or stops
  abruptly — long-lived fade closures read mute/solo through refs, so a mute
  mid-fade sticks;
- re-asserts worklet params on every (re)start (worklet params persist on the
  node across plays), and debounces WAV regeneration when a slider is dragged;
- tracks what each WAV-only layer's loop was rendered with (`ensureRendered`).
  A rendered loop keeps its tuning until something renders another, so when a
  scene, saved mix or resumed session wants a different character — including
  plain defaults — the layer re-renders first, and its start waits for that
  render; when the loop already matches, nothing re-renders;
- numbers every start per layer, and every stop/pause bumps the number, so a
  start that resolves after the user has moved on stands down instead of
  fading in — and isn't reported as a failure to start;
- gates each layer's level by mute/solo and applies masking shaping.

## Backgrounding and interruptions

A sleep mixer has to keep playing with the screen off and must *not* fight other
apps. Two mechanisms (`lib/backgroundAudio.ts` + `audio/graph.ts`):

- **Keep-alive.** A looping near-silent `<audio>` element + `audioSession.type =
  'playback'` keep the OS media session alive so audio survives backgrounding
  and the lock-screen/notification player appears (even for worklet-only mixes).
  It is **primed only on playback actions** — never on pause or toggle-off — so
  emptying the mix can't leave its murmur running.
- **Interruptions.** When another app takes audio focus (a call, a video,
  music), the mix pauses and *stays* paused; only a deliberate tap resumes it.
  iOS signals this by flipping the `AudioContext` to a non-standard
  `'interrupted'` state (and auto-resuming when the interruption clears — which
  we suppress by re-suspending while paused). Android drives the media
  notification and audio-focus through the keep-alive element, so its
  unsolicited pause is the interruption signal there. Both route to one handler
  that pauses the mix.

## State & persistence

`storage/` wraps `localStorage` behind **migrations** (`storage/migrations.ts`)
that never throw and never trust the input: unknown sound ids are dropped,
volumes clamped, names/ids/timestamps backfilled. So a corrupt or
older-shaped store can never break startup. Two things persist: the saved-mixes
list and the "resume your night" last session (debounced writes).

## PWA & self-update

The app is a fully offline-capable PWA. A precache manifest is injected at build
(`scripts/inject-precache.mjs`). The running app asks the active service worker
for its build version (`hooks/useAppUpdate.ts`); if a newer one is cached, it
silently reloads — but only while **nothing is playing**, online, and
foregrounded, and at most once per session — so an update can never cut off a
mix.

Navigations are network-first with the cache as the offline fallback. Only a
navigation to the app itself refreshes the cached shell (`./`); any other page
(the privacy page) is cached under its own path, and error responses are never
cached — otherwise whichever page was opened last online would become the app
on the next offline launch.

**Cache correctness for stable-named assets.** Vite content-hashes JS/CSS, but
everything under `public/` ships with a stable name — the fonts, the icon
subset, and *all the audio worklets*. Two mechanisms make in-place edits to
those reach installed clients: the SW build id is a hash over every precached
file's **bytes** (not just names), so any byte-level change installs a fresh
cache; and the install step precaches with `cache: 'reload'` requests, so those
fetches bypass the HTTP cache rather than re-caching stale bytes. (The 8.3.0
release demonstrated the failure mode: a re-subset icon font under an unchanged
name never reached installed clients.)

## Fonts & icons

Type (Inter, Cormorant) and icons (Material Symbols Rounded) are self-hosted
woff2 subsets in `public/fonts/` — nothing is fetched from Google at runtime.
The icon font is a **ligature font** (markup carries the icon's *name* as
text), subset from ~510 KB down to ~7 KB by `scripts/subset-icons.py`, which
resolves each name in its `ICONS` list through the font's ligature table and
keeps only those glyphs. Any new glyph referenced in `src/` must be added to
that list and the script re-run, or the icon renders as its raw name in text.
The full process is documented in the script's docstring and in
[CONTRIBUTING.md](CONTRIBUTING.md#icons-the-material-symbols-subset).

## Testing

- **`tests/*.test.ts`** (vitest, node env): generator validity (no NaN, audible,
  non-clipping, deterministic), per-variant distinctness, stereo width, storage
  migrations, config invariants, the audio interruption / keep-alive guards
  (driven through mocked `AudioContext` / `Audio`, since headless can't reach the
  `'interrupted'` state), and the drift-mode wake lock surviving a trip to the
  background (a mocked Wake Lock API).
- **`tests/e2e/*.spec.ts`** (Playwright, over the production build): the real
  flows — scenes, the player and sheet, the sleep timer on wall-clock time,
  save/restore across reloads, undo, drag and keyboard reordering (including
  RTL), audio reaching the master bus, failures that must speak (a sound that
  can't start, a save that can't be stored) and ones that must stay silent (a
  sound switched off mid-load), tuning surviving scenes and resumes, and the
  offline shell. Hard-to-reach failures are forced rather than reasoned about:
  a slowed render, a rejected `play()`, a throwing `setItem`.
  `a11y.spec.ts` is an axe-core gate: no serious or critical violations on the
  main page, the now-playing sheet, an open sound editor, the mirrored (RTL)
  layout, drift mode, the privacy page, or the desktop split layout — plus a
  keyboard walk proving focus stays trapped inside the open modals.
- **Worklets aren't type-checked or unit-tested** (they load as classic scripts
  in the audio thread), so changes to `public/worklets/*` are verified with Node
  DSP probes that load the processor via `new Function(...)` and assert
  NaN-free / non-clipping output.

## Versioning

`package.json` is the single source of version truth (rendered in the footer,
and compared with the service worker's to detect an update). Every change bumps
it and adds an entry to [CHANGELOG.md](CHANGELOG.md); the conventions are in
[CONTRIBUTING.md](CONTRIBUTING.md#versioning-and-the-changelog).
