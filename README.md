# Sleep Mixer

> **For anyone making changes (human or AI):**
> - Bump the version in `package.json` with every change.
> - Add an entry to the `## Changelog` section at the bottom of this file describing what changed and why.
> - If sound generation changes significantly, bump the saved-mixes key in `src/storage/keys.ts` (`STORAGE_KEYS.savedMixes`, e.g. `-v2` → `-v3`) so stale loops aren't restored.

**drift away** (repo name Sleep Mixer) is a mobile-first ambient sound app for
relaxation and sleep. All 18 sounds are generated in the browser; nothing is
streamed or downloaded. Rain, Thunder, Windy Forest, Fire, and Birdsong are
synthesised live via AudioWorklet (event-based); the rest are procedural WAV loops.

## Features

- **Scenes**: eight curated mixes as gradient-art cards; tap to play instantly.
- **The library**: 18 procedurally generated sounds, layered
  freely with per-sound volume and (for select sounds) deep parameter editors.
- **Mini player + now-playing sheet**: persistent player bar; the sheet holds
  per-layer sliders, master volume, sleep timer, save-mix, and drift mode.
- **Drift mode**: fullscreen night surface with clock, breathing play orb, and
  screen wake lock for the nightstand.
- **Sleep timer** (15m/30m/1h/2h/4h/8h) with a progress ring and a gentle
  90-second wind-down fade; the night sky dims with it.
- **Your mixes**: save/load/delete via `localStorage`; lock-screen media
  controls (Media Session API); installable PWA with custom install prompt.

## Tech Stack

- React + TypeScript + Vite
- Hand-rolled CSS design system (`src/index.css`, documented in `DESIGN.md`);
  Tailwind present only for its base reset
- HTMLAudioElement + Web Audio worklets for playback and mixing
- Code-split for a light first paint: the WAV-generator DSP, the now-playing
  sheet, drift mode, and the sound editor are fetched on demand (and idle-
  prefetched after first paint), so the initial bundle carries only the shell.

## Project Structure

```txt
sleep-mixer/
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── src/
    ├── App.tsx              # shell: scenes, mixes, library, player state
    ├── data.ts              # sound library + built-in presets (lazy WAV loader)
    ├── index.css            # the design system (see DESIGN.md)
    ├── main.tsx
    ├── types.ts
    ├── audio/
    │   ├── dsp.ts               # noise sources, filters, WAV encoding
    │   ├── generators.ts        # per-sound procedural WAV synthesis (code-split)
    │   └── sources.ts           # mixer sources: crossfade WAV + worklet w/ fallback
    ├── components/
    │   ├── DriftMode.tsx        # fullscreen night surface (lazy)
    │   ├── InstallPrompt.tsx    # PWA install affordance
    │   ├── MiniPlayer.tsx       # persistent bottom player
    │   ├── NightSky.tsx         # living canvas starfield
    │   ├── NowPlayingSheet.tsx  # mix control room (lazy)
    │   ├── SoundCard.tsx        # library tile
    │   ├── SoundEditor.tsx      # per-sound parameter editor (lazy)
    │   └── soundEditorDefs.ts
    ├── hooks/
    │   └── useAudioMixer.ts     # playback engine wrapper
    ├── storage/                 # localStorage keys + load/save + migrations
    ├── platform/                # platform seam (web bridge today)
    ├── config/                  # feature flags
    ├── utils/                   # logger
    └── lib/
        ├── backgroundAudio.ts · categoryIcons.ts · haptics.ts · scenes.ts
        ├── sliderFill.ts · soundIcons.ts · time.ts
└── public/worklets/             # live AudioWorklet generators (rain, fire, …)
```

## Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Start development server

```bash
npm run dev
```

### 3) Build for production

```bash
npm run build
```

### 4) Preview production build

```bash
npm run preview
```

## Notes

- All audio loops are procedurally synthesized in `src/audio/` (`generators.ts` over the `dsp.ts` helpers) and encoded to WAV blobs at runtime (two-channel 16-bit PCM; a few non-directional sources stay centred). Stereo width is baked in at generation — broad beds via decorrelated opposite time-shifts (no comb filtering), discrete events via equal-power panning — and layering is masking-aware (`layerMeta.ts` roles + `layeringTrim`). The generator module is code-split, so it loads on a sound's first play rather than at startup.
- No backend is required.
- The version number (from `package.json`) renders inline in the page footer (`.footer-meta` in `src/App.tsx`), beside the privacy link.

## Changelog

### 7.10.1
- **"Fan & Rain" scene now really is rain on glass.** The preset's mood line is
  "a fan's hush over steady rain on glass," but its rain layer used a generic
  tuning. It now uses the **At a Window** variant (glassy taps, roomy, a touch of
  ring), with the bed trimmed a little so it sits under the fan's hush.

### 7.10.0
- **Hide per-layer mute / solo for now.** The **M** (mute) and **S** (solo)
  toggles on each now-playing layer are hidden behind a new `layerMuteSolo`
  feature flag (off). The mixer logic stays fully wired up, so flipping the flag
  back on restores them; the e2e coverage is skipped meanwhile.

### 7.9.0
- **Soft-square design system — phase 2: cards, rename, docs.** Scene cards, mix
  cards and the empty-mix tile move to the 16px `--radius-card-lg`; sound cards
  and the inline editor adopt the semantic `--radius-card` (14px, unchanged
  value). Renamed `.cat-pill` → `.cat-filter` (and `.cat-pills` → `.cat-filters`)
  across the CSS and markup so the category controls read as filter tiles, not
  capsules, and the naming can't drift back. Documented the whole soft-square
  radius system (scale + semantic roles table) in `DESIGN.md`. Focus rings
  already follow each control's radius (outline / box-shadow respect
  `border-radius`), so no change was needed there.

### 7.8.0
- **Soft-square design system — phase 1: controls off the pill.** Per the
  soft-square visual report, controls are now rounded *rectangles*, not capsules.
  Replaced the `--r-pill` (20px) token with a proportional radius scale and
  semantic aliases (`--radius-control-sm` 8, `--radius-control` 10,
  `--radius-button` 12, `--radius-card` 14, `--radius-card-lg` 16,
  `--radius-sheet` 20). Category filters, timer keys, variant chips, the
  fine-tune toggle, install / cookie / toast / crash actions all move to 8–10px
  soft squares; the short floating bars (mini-player, toast) drop from a 20px
  pill to 16px. Circles stay only for genuinely circular objects (play orb,
  dots, thumbs, slider track). Cards and the rename/focus pass follow in 7.8.x.

### 7.7.0
- **Fine-tune control reads as a button.** The sound-editor disclosure that
  reveals the per-parameter sliders was bare muted text with a small chevron, so
  it was easy to miss and unclear what it did. It now uses the shared pill
  vocabulary (bordered, tappable), leads with a `tune` (sliders) icon, states the
  action ("fine-tune sliders" → "hide sliders"), and takes the category-accent
  "open" state of a real toggle.

### 7.6.0
- **Variant chips gain crafted marks.** Each preset chip in the sound editor now
  leads with a small 16px mark (new `src/lib/variantIcons.tsx`, drawn in
  `currentColor` so it inherits the chip's idle/active colour). Intensity sounds
  show 1/2/3 ascending bars; rain shows fine drizzle → 1/2/3 drops, then the three
  surface scenes (peaked **roof**, glazed **window**, corrugated **tin**) grouped
  last; fire shows per-character flames (embers, hearth arch, campfire, bonfire,
  wood-stove box, crackling sparks). The variant **name** stays the code identity
  and the visible, accessible label (marks are `aria-hidden`); a couple of lists
  were reordered so the bars read low→high. Verified in-browser (mobile
  screenshots) and via 71 unit + 16 e2e, typecheck, lint, build.

### 7.5.0
- **Rain — open-air drops become a super-muted soft patter.** The open-air
  variants (Light Rain, Drizzle, Steady, Downpour) keep their drops, but as a
  soft, dull patter sitting under the wash — rain on soft ground or a tent
  canvas — rather than discrete taps even with the bed. The `dropGain` floor is
  lowered (0.8 → 0.5) so low `drops` genuinely recedes, and the open-air variants
  drop to roughly half their previous hit level (e.g. Steady dropGain 1.34 →
  0.71). At metallic 0 the hits are already dull/dark (the de-tinning), so muted
  reads as soft, not tinny. The surface variants (On a Roof, At a Window, Tin
  Roof) raise `drops` to compensate exactly, so their crisp hits are unchanged
  (e.g. Tin Roof dropGain stays 2.36). WAV fallback floor matched. Verified: 71
  unit + 16 e2e, typecheck, lint, build green.

### 7.4.0
- **Rain — Tin Roof no longer rings like wind chimes.** At high *metallic* the
  solid drops each fired a ~90 ms pure sine at a random 2.4–5 kHz pitch, so a tin
  roof played a chord of different notes. Real heavy rain on tin is bright
  broadband *drumming*; a tuned ring only suits sparse drops on glass. The tonal
  ring now peaks at moderate metallic (≈ At a Window) and fades out as metallic
  climbs — at full Tin Roof the rings drop from ~42% of drops to ~7%, 6× quieter
  and 3× shorter, with the broadband brightness carrying the metal instead. The
  ramp is anchored so *At a Window* (metallic 0.30) is left exactly as it was.
  Tin Roof stays bright (measured centroid ≈3380 Hz, above Window ≈2530 and the
  ≈1880 default). Verified: 71 unit + 16 e2e, typecheck, lint, build green.

### 7.3.0
- **Rain — the default no longer sounds like rain on tin.** The 7.2.0 metallic
  control was opt-in but never actually darkened the baseline, so every preset
  still rang in the bright glass/metal register. This reworks the default to be
  genuinely soft rain on the ground and makes brightness ride entirely on the
  **metallic** macro: drop centres sit low and broad (≈430–1000 Hz, not 1.5–3.4
  kHz) and only rise with metallic; the water plips lose their tonal high-Q ring;
  the colored 4 kHz/8 kHz bed bands sit well down; and a clean 2-pole **master
  lowpass** (dark by default, opening with metallic) caps the whole shower.
  Measured spectral centroid of the default fell from ≈4440 Hz to ≈1870 Hz
  (energy above 2.5 kHz 55% → 26%), with a clean brightness gradient up through
  At a Window (≈2510 Hz) to Tin Roof (≈3390 Hz). The WAV fallback is darkened to
  match. A worklet-DSP probe (run in Node) caught a runtime ReferenceError the
  unit tests can't reach, since the worklet isn't unit-tested. Verified: 71 unit
  + 16 e2e, typecheck, lint, build green; peaks well below clipping, no NaN.

### 7.2.0
- **Rain — opt-in metallic surface + clearer surface variants.** The rain worklet
  gains a **metallic** control: at 0 the default stays natural and de-tinned (rain
  on soft ground), but raising it brings the solid drops' ring back on purpose —
  brighter (2–5 kHz band), louder, longer and more frequent — so a real tin-roof
  surface can ring without that edge leaking into every preset. Two new variants
  use it to pull the surfaces apart: **Tin Roof** (sharp ringing pings) and a
  glassier **At a Window** (a touch of ring, roomier), while **On a Roof** is now
  wooden and muffled with almost no ring. A **Light Rain** variant adds the very
  sparse, intermittent end the intensity range was missing. Verified: 71 unit +
  16 e2e, typecheck, lint, build green.

### 7.1.0
- **Fire — flame hiss band + distinct presets.** The fire worklet gains a
  dedicated high-band *hiss* (one-pole high-pass → gentle low-pass), gated by
  flame energy and the roar envelope so it breathes with the fire instead of
  sitting as flat air. A new **hiss** control exposes it. This unlocks textures
  the old roar-plus-crackle model couldn't reach — most of all a **Wood Stove**
  preset (dark low rumble, prominent escaping-air hiss, only a few distant pops).
  Presets are retuned to actually diverge rather than differ by volume: Embers
  smoulders (sparse soft crackle), Hearth is a steady close fireplace, Bonfire
  lets the roar dominate with frequent loud pops and little hiss, Crackling stays
  dry-kindling rapid. Verified: 71 unit + 16 e2e, typecheck, lint, build green.

### 7.0.0
- **Rain & fire realism — opening the 7.x line.** A focused pass on the two
  generators the research report singled out: rain that reads as rain on soft
  ground rather than on tin, with intensities and surface variants that actually
  diverge; and fire whose presets are distinct textures (stove, embers, hearth,
  campfire, bonfire) rather than one bonfire at different volumes. This major
  bump opens the line; the work lands across the 7.x minors that follow. No
  behaviour change in this entry itself — it sets the baseline.

### 6.5.0
- **Audio engine — sprint 6: final check + fix.** Closes the 6.x audio pass.
  Documented the unified mix graph, per-layer EQ, two-dimensional masking,
  mute/solo, and sleep-safe in `DESIGN.md`. Fixed a mute/fade race (a fade-in
  started just before a mute could ramp the volume back up) by reading mute/solo
  from refs so live fade timers see current state. Verified end to end:
  71 unit + 16 e2e (incl. audio-flow, mute-silences, sleep-safe), typecheck,
  lint, build all green.
  - **Note for device testing:** WAV layers route through the graph via
    `MediaElementAudioSourceNode`, which is verified on Chromium but can be silent
    on some iOS Safari versions; the code falls back to direct output if routing
    is refused. Please confirm background / lock-screen playback on an iPhone.

### 6.4.0
- **Audio engine — sprint 5: mute / solo + sleep-safe toggle.** Every layer in
  the now-playing controls gains compact **M** (mute) and **S** (solo) toggles —
  silence a layer or isolate it without removing it. A **sleep-safe** toggle in
  the master section (on by default, persisted) enforces the calmer DSP policy: a
  darker master high-shelf and the spectral slotting of stacked broadband beds;
  turn it off for a brighter, more cinematic balance. Also fixed a fade race so
  muting a just-started layer takes effect immediately.

### 6.3.0
- **Audio engine — sprint 4: sleep-safe defaults.** Retuned the default character
  of most layers toward calmer, sleep-first listening (from the research report's
  sleep-safe table): a fainter, softer rain bed with fewer drops; quieter, darker
  fire crackle; wind whistle way down; sparser, more distant thunder; less twig
  detail in the forest; lower ocean foam and stream sparkle; darker white noise;
  warmer pink/brown noise; quieter night insects. WAV loops now render from their
  editor `def`s (single source of truth for a default), so a default lives in one
  place. Named variants and saved mixes are unaffected; every value is still
  editable.

### 6.2.0
- **Audio engine — sprint 3: per-layer EQ + spectral masking.** Every layer now
  runs through its own bus (lowpass → high-shelf → trim) into the master bus.
  Masking is no longer just a level trim: when **more than two** broadband/water
  beds stack, the non-accent ones move out of each other's way — a darker top, a
  high-shelf cut, and a small extra trim — so the busiest layer keeps the
  spectrum and the rest recede. Solo sounds and small mixes stay transparent;
  accents keep their top. (Sharpness drives listening fatigue more than level.)

### 6.1.0
- **Audio engine — sprint 2: WAV loops join the bus.** The rendered loop layers
  now feed the shared graph too, via `MediaElementAudioSourceNode` → master bus.
  The proven `HTMLAudioElement` crossfade still drives playback (so background /
  lock-screen behaviour is preserved), but its output is processed with
  everything else — the whole mix is finally gain-staged together. Falls back to
  direct element output if a platform won't allow the routing. Added a master
  analyser/peak meter (verified audio flows through the bus in-browser).

### 6.0.0
- **Audio engine — sprint 1: shared master bus.** Introduced one Web Audio graph
  with a master bus (`src/audio/graph.ts`): a gentle glue compressor, a quiet
  high-shelf to take the edge off the top, and a fast safety limiter against
  clipping. The live worklet sounds (rain, fire, thunder, windy forest,
  birdsong) — the most transient, harshness-prone layers — now play through it
  instead of straight to the speakers. The chain is ~loudness-neutral on a single
  sound; it only works when layers stack. (Start of an audio-architecture pass;
  major bump to open the 6.x line. WAV loops join the bus next.)

### 5.5.1
- **Fix: save name field too small on phone.** The save row now takes its own
  full-width line below the actions, with the name field on its own line above a
  full-width save button, instead of a cramped inline field.
- **Fix: fire crackle sounded bubbly again.** Stabilising the worklet pan (5.x
  audio work) removed an old per-channel smoothing that had been masking the
  crackle's resonant ring; on clean stereo those tonal pings read as water
  bubbles. The crackle bandpass Q is dropped to a broad, dry band and blended
  with a raw transient, so each crackle snaps rather than plinks.

### 5.5.0
- **UX redesign — sprint 6: review, refactor, docs.** Closes the 5.x UI/UX pass.
  Verified the whole flow across mobile and desktop, documented the new layout
  and components in `DESIGN.md`, and locked behaviour with e2e coverage for the
  desktop side panel, stop/undo, save-from-player, and delete/undo. No new
  surface; consolidation of sprints 1–5.

### 5.4.0
- **UX redesign — sprint 5: accessibility + contrast.** All three text tiers now
  clear WCAG AA for normal text: `--text-dim` was at 3.4:1 (below the 4.5:1 floor
  for the meta-count labels that use it) and is raised to 4.6:1, with
  `--text-secondary` lifted to 5.5:1 so the tiers stay visibly ordered. The small
  card ✕ controls and the toast dismiss gained wider invisible touch halos
  (toward the 44px guideline) for one-handed use in the dark.

### 5.3.0
- **UX redesign — sprint 4: scene clarity + microcopy.** Scene cards now carry a
  quiet layer count (e.g. "2 layers"), so they read as real presets — the icons
  already show *which* sounds, the count shows *how many* — matching the saved-mix
  cards. On wide screens the scenes wrap into a grid (every scene visible, no
  horizontal-scroll trick) while mobile keeps its peeking shelf. The install row
  copy is clearer: "install for a faster start and offline nights."

### 5.2.0
- **UX redesign — sprint 3: desktop/tablet split layout.** Wide screens
  (`≥1000px`) are no longer a phone-width column stranded in the middle. The
  shell becomes a two-column grid: browse on the left, a persistent control
  panel on the right that shapes the mix in place (layers, master, sleep timer,
  drift, save) instead of through the slide-up sheet. The now-playing controls
  were extracted into a shared `MixControls` component, so the mobile sheet and
  the desktop panel can never fall out of sync. Mobile is untouched.

### 5.1.0
- **UX redesign — sprint 2: save discoverability + undo.** Saving a mix no
  longer hides a layer deep in the now-playing sheet: a bookmark sits in the
  mini player and opens straight into the name field, and while a mix is playing
  with nothing saved yet, the "your mixes" section shows a quiet card that
  teaches the feature and doubles as the save entry. Destructive actions are now
  forgiving in the dark: "clear all" becomes "stop mix" and both stopping a mix
  and deleting a saved one leave a five-second **undo** snackbar.

### 5.0.0
- **UX redesign — sprint 1: prompt timing.** First load now stays clear: the
  storage notice and the install row are held back until the first sound has
  actually played, and they never appear together. The storage notice shows
  first (once, then remembered); the install row only surfaces once that's
  acknowledged or was on a prior visit. Nothing competes with the path to sound.
  (Start of a UI/UX pass; major bump to open the 5.x line.)

### 4.5.2
- **Fix: wind sounded like two large fans.** Wind's whoosh is a low/mid-band
  source (rolled off ~1–1.4 kHz), so the default 800 Hz decorrelation crossover
  was spreading the body itself — the gust split into two sources left and right.
  Wind now uses a higher crossover (1.6 kHz) so the whole whoosh stays centred;
  its width comes from the panned edge-tone whistles instead.

### 4.5.1
- **Fix: decorrelated beds sounded like two separate sources.** Pink/white noise
  and the other broadband beds were widened by shifting the *whole* band in
  opposite directions per channel, which drives the interaural correlation toward
  zero on steady noise — the ear hears that as two uncorrelated sources on either
  side rather than one wide source. `decorrelateMono` now keeps the low/mid band
  shared (a fused mono centre, where the binaural system takes its localisation
  cue) and only spreads the highs (bass-mono / treble-wide). Spacious but
  coherent, still no comb filtering. (Fan, brown noise, heartbeat and the
  underwater body remain intentionally centred.)

### 4.5.0
- **Stereo overhaul — sprint 6: hardening & docs.** Locked the stereo and
  masking work behind regression tests: generators are asserted to render
  two-channel loops, broad beds to be genuinely decorrelated (L/R correlation
  below threshold) while compact sources (brown noise, fan, heartbeat) stay
  centred, and `layeringTrim` to apply the expected same-group cuts. Documented
  the stereo/masking model in `DESIGN.md` and the README. No audible change —
  this sprint makes the previous five safe to build on.

### 4.4.0
- **Stereo overhaul — sprint 5: worklet spatial polish.** Fire and Birdsong were
  jittering their pan *every sample*, which reads as a constant stereo "fizz"
  rather than a located source. Both now hold a pan position and ease between
  positions: the fire sways gently as one source, and each bird call/trill jolts
  the placement so calls arrive from new directions across the field. (Measured:
  fire's abrupt pan jumps dropped from hundreds to ~0 per 1000 samples.)

### 4.3.0
- **Stereo overhaul — sprint 4: masking-aware layering.** Added layer roles
  (`src/audio/layerMeta.ts`): every sound is a **bed**, **motion**, or **accent**
  in a spectral mask group (broad / water / low / detail). When layers in the
  same group stack, the mixer now applies a gentle automatic level trim — beds
  duck a little for each broadband neighbour, a crowd of same-group motion layers
  ducks the extras, accents are left alone — so stacking (Fan + White Noise +
  Rain, say) stays clear instead of fogging into one lump, without hand-tuning
  every preset. (Graph-backed WAV playback for per-layer panning is deferred to a
  session where the audio can be checked by ear.)

### 4.2.0
- **Fixed the "jet engine" comb artefact** in the stereo beds (4.0–4.1). The
  widener was blending each channel with a short delayed copy of itself, which
  comb-filters noise into a flanged whoosh on both sides. It now decorrelates by
  pure opposite time-shifts, so each channel keeps a flat spectrum — wide and
  diffuse, no flanging.
- **Stereo overhaul — sprint 3: urban & deep beds.** **Train** rolls around you
  (decorrelated floor + spread joint clatter; underfloor thumps stay centred),
  **Airplane** widens its boundary-layer "blanket" while the engine body stays
  centred, **Underwater** scatters its bubbles across the field over a centred
  deep body, and **Night Insects** place their chirp bands around you. **Brown
  noise, Fan, Heartbeat** and the underwater body stay mono on purpose (compact
  or non-directional sources). All WAV sounds are now stereo-aware.

### 4.1.0
- **Stereo overhaul — sprint 2: water, air, and noise beds.** Converted the broad
  ambience layers to stereo: **Stream** (body and bright ripples decorrelated
  separately, so it glitters wide), **Wind** (decorrelated gust bed with each
  edge-tone whistle placed across the field), **Shower** (wide spray + a roomier
  reflection spread), and the **White / Pink / Brown noise** beds (gentle width;
  brown stays near-centre since bass isn't directional). Tests assert each is
  genuinely not mono.

### 4.0.0
- **Stereo audio overhaul — sprint 1: foundation.** First step of moving the
  procedural sounds from a flat mono wash to a wide, moving stereo image. Added
  stereo rendering to `dsp.ts` (a 2-channel WAV writer, `genStereo`, equal-power
  `panMonoInto`, and `decorrelateMono` for widening beds), and converted **Ocean**
  to it: a decorrelated undertow bed with surf that crests and pans across the
  image instead of pulsing dead-centre. Hardened `CrossfadeAudio.destroy()` to
  revoke blob URLs (no leaks over long retuning sessions). New tests cover stereo
  seam continuity and L/R decorrelation.
- **Fixed** the rain editor's "fine-tune" control showing literal "expand_more"
  text — that glyph isn't in the subsetted icon font; switched to the bundled
  `keyboard_arrow_down`.

### 3.9.0
- **Sound "variants" + progressive disclosure.** Opening a sound now leads with a
  row of named character presets (chips) instead of a wall of sliders — e.g. rain
  → *Drizzle · Steady · Downpour · On a Roof · At a Window*, fire → *Campfire ·
  Embers · Hearth · Bonfire · Crackling*. Every editable sound gets 3–5 evocative
  variants. The full sliders moved behind a **"fine-tune"** disclosure, collapsed
  by default, so the three depths are: card (toggle + volume) → variant chips →
  sliders. The default character is unchanged for every sound. Picking a chip
  applies its values live; nudging a slider shows a quiet "custom" marker.

### 3.8.2
- **Decluttered the rain editor** (10 sliders → 7). Folded overlapping controls
  that shape one thing into single macro sliders: the bed's tone now follows
  `surface` (a soft surface dulls the whole shower), stereo width rolls into
  `space` (room + width together), and the slow swell plus the drop clustering
  combine into `movement` (steady → alive). Renamed the rest for plainness
  (bed level → **background**, drop hits → **drops**). The default sound is
  unchanged and the Fan & Rain bed control is untouched. Reviewed the other
  sounds' slider names too; they were already concrete, so they're left as-is.

### 3.8.1
- Rain follow-ups: softened the drop impacts so they read as taps rather than a
  tin-roof ping (lower centre frequency, gentler filter Q, rarer/fainter tonal
  ring; the WAV fallback's ping was thinned to match) and lowered the default
  drop level. Fan & Rain's bed is back, just a bit fainter than normal (0.7).

### 3.8.0
- **Per-scene sound tuning.** Built-in scenes (and the resume-your-night session)
  can now carry editor slider overrides per layer, not just a level — so a scene
  can shape a sound's character. Applied on load and reset when a sound plays on
  its own, so the standalone sound keeps its normal settings.
- **Fan & Rain fix.** The rain layer there brought its own broadband bed, which
  doubled up with the fan's hush. The scene now drops the rain bed right down
  (new `bed level` control at 0.18) so the fan carries the wash and the rain just
  adds drops over it. Standalone rain is unchanged.
- **Rain bed controls.** Two new sliders in the rain editor: **bed level** (how
  much of the continuous curtain sits under the drops) and **bed tone** (dark and
  soft → open and airy). The bed bands were also broadened (lower filter Q) and
  the top trimmed, taking the metallic "tin-roof" edge off the curtain.
- Lengthened each scene's mood line by a couple of words, and clamped the line to
  two so a longer description tapers cleanly on the fixed-height card.

### 3.7.4
- **Polish pass — lighter first paint.** Code-split the heavy, post-startup
  pieces out of the initial bundle: the procedural WAV-generator DSP
  (`src/audio/generators.ts`, ~6.8 kB gz) now loads on a sound's first play, and
  the now-playing sheet, drift mode, and sound editor load on first open (all
  idle-prefetched after first paint so opening stays instant). The WAV source
  path (`data.ts` → `audio/sources.ts`) is now async to support this. Initial
  app JS dropped ~72 → ~63 kB gz. The service worker auto-precaches the new
  chunks, so offline is unaffected (verified by the e2e suite).
- **Fixed:** under `prefers-reduced-motion`, rotating/resizing the window cleared
  the `NightSky` canvas and left it blank (no animation loop to repaint) — it now
  redraws the still frame on resize.
- **Refactors:** extracted the shared "start a source with fade-in" logic in
  `useAudioMixer` (deduped across toggle / resume-all / restore-mix); memoized the
  library/visible-sound lists in `App` so they don't churn effects each render;
  corrected the `storage/keys.ts` doc comment.

### 3.7.3
- **Rain: softer by default.** Lowered the default *drop hits* (0.70 → 0.35) so
  the surface impacts sit under the bed (gentle, not harsh); the slider still
  reaches fully forward.

### 3.7.2
- **Fixed: the mini player covered the footer (privacy/version) intermittently.**
  The clearance was a hardcoded gap; the player's real height varies with
  safe-area insets, font scaling, and subtitle wrap. It now measures the live
  player (`ResizeObserver` → `--mini-player-h`) so the footer always clears it.

### 3.7.1
- The scenes shelf "there's more this way" wink now plays on every load, not just
  the first (the one-time `localStorage` guard was removed).

### 3.7.0
- **Rain rework.** Moved the rain worklet from a single filtered-noise bed +
  uniform-Poisson ticks toward a richer texture, keeping the same browser stack:
  a multi-band, decorrelated bed whose sub-bands drift on slow random walks (so
  it breathes instead of hissing); a two-level scheduler (steady background
  drizzle + occasional clustered bursts) so the rain clumps and lulls; surface-
  aware drop atoms (hard → bright/snappy, foliage/wet → darker/softer); and a
  short multi-tap early-reflection bus for placement. Added four character
  controls to the editor — **drop hits**, **patter**, **space**, **stereo
  width** — alongside the existing intensity / heaviness / surface / swell.

### 2.11.3
- Renamed the "tonight" section heading to "the scenes" (meta line now "curated mixes"), matching the "the library" naming pattern.

### 2.11.2
- **Fixed the odd line under the presets shelf.** The scene/mix rows are horizontal scroll containers, which clip vertically — so the cards' soft drop shadows were being sliced into a hard dark band at the shelf's bottom edge (background looked different below vs above). Removed the outer drop shadows on shelf cards; the border + inset top hairline carry the depth.

### 2.11.1
- **Fixed: couldn't reinstall after uninstalling.** Installing wrote a permanent "dismissed" flag to localStorage, which outlives the app — so after an uninstall the in-app install prompt never returned. Installing no longer writes the flag (Chrome stops firing `beforeinstallprompt` while installed anyway, and clears it instead), dismissal now hides the row for 14 days rather than forever, and the old legacy flag is treated as expired so existing devices recover automatically.

### 2.11.0
- **App-icon shortcuts + scene deep links.** Long-press the installed app icon (Android; right-click on desktop) for Rainfall / Fireside / Deep Rest shortcuts. They use `?scene=<id>` deep links, which the app now resolves on launch (autoplay-blocked launches load the mix paused, one tap to play). Manifest also gains `id`, `lang`, `dir`, and `display_override`.

### 2.10.0
- **Offline support.** Added a service worker (`public/sw.js`, registered in production): the app shell, hashed assets, icons, worklets, and fonts are cached so drift away opens and plays with no signal — sounds are generated on-device, so offline is fully functional. Navigations stay network-first, so deploys are picked up on the next online visit.

### 2.9.0
- **iOS background playback + best-possible media notification.** New `src/lib/backgroundAudio.ts`: declares `navigator.audioSession.type = 'playback'` (iOS 16.4+) so audio keeps playing when the tab is backgrounded or the screen locks, and runs a looping *silent* `<audio>` keep-alive (started inside the play gesture, synced to play/pause) so the lock-screen / notification player reliably appears even for worklet-generated sounds, on both iPhone and Android.
- **Polished webapp head.** Brand-blue browser tab/address-bar (`theme-color #7ba7e8`, with a dark-scheme variant), `color-scheme: dark`, Open Graph + Twitter cards (icon artwork), canonical URL, `application-name`, `mobile-web-app-capable`, and `format-detection` off for phone numbers.

### 2.8.3
- **Fixed the scene cards going solid** ("something pops in behind"). The culprit was `backdrop-filter` on the preset cards: over the near-black sky the blur had nothing useful to frost, so it composited a near-solid dark layer that popped in behind the translucent gradient. Removed `backdrop-filter` from the scene and mix cards (and reverted 2.8.2's frosted-white film). The cards are now just their translucent colour gradient over the night sky — colour + transparency, no pop. The mini player, sheet, and storage notice keep their blur since they sit over real content.

### 2.8.2
- Fixed the scene cards looking "transparent on fade-in, then solid at rest." They were a dark colour gradient with no frosted base, so over the near-black sky they read as solid (the only translucency was the entrance fade). Gave them a faint frosted-white film under the colour tint — the same trick the mix cards use — by moving the gradient to `background-image` and adding `background-color: rgba(255,255,255,0.06)`. They now read as a lighter glass pane, tinted by the scene colour, at rest.

### 2.8.1
- Preset cards: the gradients were still too dense to see through (a regex had also nudged some colour radials up to 0.30). Rewrote each scene's art with a genuinely faint tint — colour radials ~0.16–0.24, near-clear base (~0.08/0.03) — so the frosted night sky shows through the cards. The bottom scrim still carries the name.

### 2.8.0
- **Preset cards are now genuinely transparent.** v2.7's glass treatment kept the gradient base at ~0.55 alpha, which over the near-black background still read as solid. Dropped the base gradient stops to 0.30 / 0.18 alpha so the night sky shows through the cards (the colour tint + blur + sheen remain); strengthened the bottom text scrim so names stay legible.

### 2.7.0
- **UI review & fix-up — tinted-glass preset cards.** The scene and mix cards keep their colour gradients but now read as proper tinted glass: a backdrop blur + saturate frosts the night sky behind, a light-catching top hairline (`inset 0 1px 0`) and a top-left sheen sell the glass, and a soft drop shadow lifts them off the page (instead of flat gradient tiles).
- **Unified glass material** across all five glass surfaces — scene cards, mix cards, mini player, now-playing sheet, and the storage notice now share the same blur + saturate + highlight recipe, so they feel like one material.
- Removed two orphaned design tokens (`--surface-active`, `--shadow-card`); DESIGN.md updated. Revert point for this pass: branch `backup/pre-ui-review-v2.6.0`.

### 2.6.0
- **Storage notice ("cookie" popup).** drift away sets no tracking/advertising cookies, so instead of a misleading banner it shows an honest one-time note: mixes and settings are kept on-device (localStorage), nothing leaves it, no tracking/ads — with a privacy link and a "Got it" button, styled to match the playback bar's glass. Remembered after dismissal.
- **Train rebalanced.** A broadband pink-noise "carriage" wash (mixed at 0.33) was overwhelming the wheel-clatter rhythm (only 0.10). The carriage bed is now darker and much quieter (0.11) and the clatter leads (0.24), so the train reads as a train.

### 2.5.1
- Reordered the scene shelf to lead with the strongest presets: Rainfall, Fireside, Deep Rest, then the rest.

### 2.5.0
- **Renamed the app to "drift away"** — wordmark, page title, PWA manifest (name + short name), apple-web-app title, media-session metadata, and the privacy page.
- **Fixed the slider "detached ball" look.** The thumb's soft glow over a thin 4px track read as a floating ball beside a rectangle. The track is now 6px, the thumb is grounded with a tight drop shadow (no glow), and `::-moz-range-track` is defined for consistent cross-browser centering — the thumb now reads as a knob sitting on the bar.
- **Made the playback bar stand out.** It was too translucent to register: now a more opaque, defined glass bar with a stronger lift shadow and a defining edge, and the play control is a **solid bright accent disc** (dark glyph) as the one high-contrast focal point.
- **Deep pass on the library.** The category filter pill now glows in its own family hue when active (Fire ember, Air cyan, …), tying the row to the cards; active sound cards are tinted with their category color instead of a generic blue-white; sound names are a step larger/clearer; counts and icons refined.

### 2.4.0
- Removed the Café sound and its "Café in the Rain" scene (library is now 18 sounds, 7 scenes). The Underwater scene is now just underwater (dropped the night drone).

### 2.3.2
- Trimmed scene layers per feedback: Rainfall is just rain (no fan), Windy Forest is just wind + forest (no birdsong), Fireside is just fire + a 5% night drone (no wind).

### 2.3.0
- **Reworked the eight curated scenes with proper level balance** (not everything at 0.5). Each is mixed so the focal layer leads and broad beds sit underneath: Rainfall (rain 0.60 · fan 0.18), Distant Storm (thunder 0.62 · rain 0.40 · wind 0.16), Windy Forest (forest 0.60 · wind 0.30 · birdsong 0.12), Fireside (fire 0.62 · wind 0.20 · night 0.05), Ocean Night (ocean 0.55 · wind 0.18 · night 0.08), Deep Rest (brown noise 0.50 · heartbeat 0.24 · night 0.12), Underwater (underwater 0.60 · night 0.20), and Café in the Rain (café 0.55 · rain 0.30). Scene art and mood lines re-synced to the new set.

### 2.2.0
- **Library curation.** Removed Waterfall, Tent Rain, Tin Roof Rain, Frogs, Dryer, and Deep Space. **Night** now plays the Deep Space synthesis (the deep, drifting void was the keeper), so its slider set is now Void / Shimmer / Drift. The library is now 19 sounds.
- **Campfire Night** reworked: the Night drone at 2% under Fire (was Fire + Forest). The **Underwater Cave** scene and the **Rainforest** scene were updated to drop the removed layers (Underwater + Night; Rain + Windy Forest + Birdsong). Dead generators and editor entries removed.

### 2.1.2
- **Removed static noise floors.** Thunder no longer carries a constant pink "air" bed — it now lives over true silence between events. Underwater's hissy midrange pink "current" wash is gone; its movement now comes from a slow swell of the deep rumble, with a darker final low-pass so no high-frequency static survives.
- **Translucent scene & mix cards.** The curated-scene cards bottomed out in opaque colours; their gradient art is now translucent over a backdrop blur (and mix cards gained the same glass), so the night sky shows through and they sit in the same material as the mini player and now-playing sheet.

### 2.1.1
- **Rain de-laser tuning.** Raindrop hits read as sci-fi "pew" sounds because the water family used a descending sine glide (a literal laser zap) and the other drops used high-Q bandpasses that ring tonally. Fixed by removing the glide entirely, dropping filter Q across all drop families so each is a broadband *tick* rather than a tuned beep, and making resonant rings faint, short, and rare. Water plips are now low, soft, and infrequent.

### 2.1.0
- **Real-time synthesis for Rain, Thunder, and Windy Forest** (sound generation overhaul, fully in-browser via AudioWorklet). These three were the least recognisable because they were stationary noise loops; environmental sounds are identified from *temporal events*, not static spectra. Each is now generated live off the main thread (`public/worklets/`), with the previous WAV kept as an automatic fallback if the worklet can't load:
  - **Rain** (`rain.worklet.js`): an airy filtered-noise bed under three drop families — solid hits (with occasional modal rings), leaf hits, and water chirps — scheduled as independent Poisson processes across near/mid/far lanes with slow density drift. You hear impacts first, bed second.
  - **Thunder** (`thunder.worklet.js`): sparse storm events over silence, each a sequence of 1–4 staggered claps → a downward-sweeping rumble → an undulating afterimage → a sub-bass deepener, all from one seed (62% of strikes are 1–2 claps, per the model).
  - **Windy Forest** (`windyforest.worklet.js`, renamed from "Forest"): four wind-speed-driven canopy bands with leaf rustle emitted as a *child of the gust field* (rustle swells with the whoosh), plus rare branch creaks/whistles on stronger gusts.
  - The 3-slider editors for these now drive the worklet **live** (k-rate params) instead of regenerating a WAV; the generic worklet source + WAV-fallback path is unified in `useAudioMixer.ts` (fire reuses it too). Saved mixes are unaffected (sound ids unchanged).

### 2.0.0
- **Full product overhaul** (revert point: branch `backup/pre-overhaul-v1.2.0` / tag `v1.2.0-pre-overhaul`). The in-browser sound generation engine is untouched; everything above it was rebuilt around a browse-first, player-persistent architecture:
  - **Scenes**: the eight built-in presets become curated gradient-art cards in a snap-scrolling shelf, each with a mood line and CSS-generated art (`src/lib/scenes.ts`). Tap to play instantly; tap the playing scene to pause. Hand-editing the mix clears the scene badge.
  - **Mini player** (`src/components/MiniPlayer.tsx`): a floating glass pill at the bottom whenever a mix is active: play/pause with the sleep-timer ring, serif mix title, countdown/layer count, one tap into the sheet.
  - **Now-playing sheet** (`src/components/NowPlayingSheet.tsx`): the mix's control room. Per-layer category-colored sliders with remove, master volume, the sleep timer (with "ends ~11:42 pm"), and doorways to drift mode and saving the mix. Replaces the old master bar entirely.
  - **Your mixes**: saved presets as warm serif cards with layer counts, replacing the chip row. Saving lives in the sheet.
  - **Typography**: Cormorant italic now carries the brand moments: greeting ("good evening"), section headings (tonight / your mixes / the library), scene and mix names, sheet title.
  - **Atmosphere**: a slow aurora layer (indigo/violet/teal, 90s transform loop) joins the starfield; stilled under reduced motion.
  - **Details**: time-of-day greeting, spacebar play/pause, footer simplified (rest well · privacy · version inline; privacy moved off fixed positioning since the mini player now owns the bottom edge), `formatCountdown` deduplicated into `src/lib/time.ts`.

### 1.2.0
- **Reusable install prompt**: Chrome only shows its native install banner once, then suppresses it. Added an early `beforeinstallprompt` capture (`index.html`) plus an in-app install row (`src/components/InstallPrompt.tsx`) that appears under the header whenever the app is installable and triggers the native prompt on demand. It hides once installed or dismissed, never shows when already running standalone, and falls back to a short "Add to Home Screen" hint on iOS Safari (which has no install event).

### 1.1.1
- Pinned the footer "privacy" link to the very bottom of the screen (fixed, centered) instead of trailing the "rest well" footer line.
- Made the privacy page typography match the app: loads Cormorant + Inter, with the Cormorant italic wordmark replacing the Georgia serif fallback.

### 1.1.0
- **New app icon**: redrew the icon as a gold crescent with a soft halo over a radial night sky (`public/icon.svg`), regenerated to all PNG sizes (192/512/1024 + 180 apple-touch) and a refined small-size `favicon.svg`. Manifest icons split into proper `any` + `maskable` entries.
- **Better media-session player**: the notification/lock-screen player now leads with the mix names as the title (with "drift" as the artist line), ships multiple artwork sizes, and uses a redrawn crescent-night artwork that matches the app icon so Android tints the notification on-brand.
- **Android system bars**: `theme_color` and `background_color` set to the true background `#080c14` so an installed PWA themes the status bar (and, on recent Android, the navigation bar) to match. (The bottom nav bar can only be fully controlled from a native/TWA wrapper, not from the web layer.)
- **Sound editor**: removed the developer "config values" export section (JSON + copy button) entirely, along with its now-orphaned styles.
- **Privacy & terms**: added a hosted policy page (`public/privacy.html`, linked from the footer) and a repo mirror (`PRIVACY.md`), covering the no-data-collection model, local-only storage, the fully self-hosted (no third-party) and offline design, and a not-a-medical-device disclaimer.

### 1.0.1
- **Replaced the per-card icon watermark with a soft corner color wash.** The large faint category glyph (and its per-family motion) read as decoration and crowded each card alongside its real sound icon. Each card now carries only a gentle radial glow of its category hue in the top-right corner (`.sound-card::after`): invisible at rest, a hint on hover, gentle when active. The per-category color identity stays; the glyph is gone.

### 1.0.0
- **Onboarding, accessibility, and ship-grade hardening** (Stage 6, completing the design roadmap):
  - **First-run whisper**: a single Cormorant line above the grid ("tap a sound to begin · layer as many as you like"), shown until the first sound is ever toggled, then remembered via `localStorage`.
  - **Accessibility pass**: aria-labels on every slider (master, per-sound, editor params), `aria-pressed` on category pills and timer chips, decorative elements (indicator, watermark, ring, version stamp) hidden from assistive tech; drift mode already carries dialog semantics with focus management.
  - **Expanded hit targets**: small chips keep their calm visual size but gain invisible touch halos approaching the 44px guideline; `touch-action: manipulation` removes double-tap zoom delay; tap highlight removed. Pinch zoom re-enabled (dropped `maximum-scale=1` from the viewport).
  - **PWA/meta fixes**: `manifest.json` icon paths and `start_url`/`scope` made relative (they 404'd under the `/SleepSounds/` GitHub Pages base), manifest and `theme-color` aligned to the true background `#080c14`, media-session artwork fallback made base-aware, and a meta description added.

### 0.6.0
- **Per-sound character + tactile micro-interactions** (Stage 5 of the design roadmap):
  - **Category accents**: each sound family now carries its own muted hue when active (Fire ember, Air pale cyan, Earth sage, Noise dusty violet, Urban steel, Wildlife moss, Cozy warm gold; Water keeps the signature blue). Applied to the active card's border, glow, icon, indicator dot, equaliser, volume slider, and editor handle. All hues ≥7:1 contrast on the background.
  - **Element watermark returns**: reinstated the per-card category watermark (it had become orphaned CSS after an earlier refactor) and gave each family motion that fits its nature while playing: water bobs, fire flickers, air/wildlife sway, cozy breathes; earth, noise, and urban hold still.
  - **Tactile controls**: slider tracks 2→4px and thumbs 10→14px with a soft glow and press scale; cards compress slightly on press; new preset chips ease in when saved; long preset names now ellipsize.
  - **Haptics**: tiny vibration confirmations (8–12ms, best-effort, no-op on iOS Safari) on sound toggle, play/pause, timer set, and preset save.

### 0.5.0
- **Drift mode + wind-down timer** (Stage 4 of the design roadmap):
  - New fullscreen **drift mode** (`src/components/DriftMode.tsx`), entered via the moon button in the master bar once sounds are active: the mixer chrome fades away, the living sky shows through, and a large Cormorant clock, the mix names, the countdown, and a breathing play orb remain. Controls quiet down after 5 still seconds (the clock stays); any touch wakes them. Esc or the close button exits; exiting is automatic if the mix empties.
  - Requests a **screen wake lock** while drift mode is open (best-effort, re-acquired on tab return) so the bedside display stays softly lit.
  - **Timer redesign**: the −30/+15/+30/✕ increment chips are replaced with absolute durations (15m · 30m · 1h · 90m); tap the active chip to cancel. A warm progress ring around the play button empties as the timer runs.
  - **Gentle wind-down fade**: over the timer's final 90 seconds the mix eases out (playback gain only, via a new `masterFade` multiplier in `useAudioMixer`) so the stop never jolts. Sound-generation algorithms untouched.

### 0.4.0
- **Living night sky** (Stage 3 of the design roadmap): replaced the static CSS starfield with a procedural canvas scene (`src/components/NightSky.tsx`):
  - Seeded star placement, so drift's constellation is identical every visit
  - Stars twinkle on individual phases; the sky brightens gently while the mix plays and settles when idle
  - During the last five minutes of the sleep timer, the sky gradually dims with the wind-down
  - A rare meteor crosses while playing (never when idle or during deep wind-down)
  - 30fps render cap, DPR capped at 2, pauses on hidden tabs, and draws a single static frame under `prefers-reduced-motion`

### 0.3.0
- **Design-system foundation + typographic refinement** (UI/look-and-feel; no audio or behaviour changes):
  - Added `DESIGN.md` documenting the full visual system (color roles, type scale, spacing, radius, motion, z-index, elevation, components, layout).
  - Reworked `src/index.css` into a token-driven system: every component now consumes design tokens (`--fs-*`, `--sp-*`, `--r-*`, `--dur-*`/`--ease`, `--z-*`, color roles) instead of scattered literal values.
  - Consolidated the typographic scale: the old 8/9/9.5/10px label sprawl collapses to one 10px eyebrow tier, small controls move to a legible 11px, and the wordmark/footer keep Cormorant. Unified eyebrow letter-spacing and tightened the header/wordmark lockup rhythm.
  - **Removed a dead parallel design system**: deleted six unused components (`ActiveMixer`, `Header`, `MasterControls`, `PresetManager`, `SleepTimer`, `SoundLibrary`) that were the only consumers of the Tailwind theme, then stripped the now-unused Tailwind theme tokens (`midnight`, `deepBlue`, `cardBlue`, `accentSoft`, `hero-gradient`, `shadow-card`, `pulseSoft`).
  - De-duplicated the slider-fill helper (previously copied in three files) into `src/lib/sliderFill.ts`.

### 0.2.1
- **Accessibility polish pass** (no behavioural changes):
  - Raised muted-text contrast to meet WCAG AA: `--text-secondary` 3.5:1 → 4.7:1 and `--text-dim` 1.9:1 → 3.4:1 against the background, keeping the cool blue-grey hue. Section labels and the preset-name placeholder now use the secondary tier so their small text clears 4.5:1.
  - Added a `prefers-reduced-motion: reduce` block: the moon drift, scroll parallax, star pulse, play-button pulse, equaliser bounce, and entrance reveals all settle to a static state; the equaliser stays visible as a static mark so "playing" still reads.
  - Added `:focus-visible` keyboard focus rings (accent outline) to every control; previously each set `outline: none` with no replacement. Card toggles ring the whole card to avoid clipping inside the card's `overflow: hidden`.
- Removed unused `src/components/VolumeSlider.tsx` (dead code; the app renders sliders inline).

### 0.2.0
- **Major sound expansion**: Added 11 new procedurally generated sounds: Waterfall, Tent Rain, Tin Roof Rain, Underwater, Shower, Frogs, Cafe, Airplane, Dryer, Deep Space, and Heartbeat — bringing total to 25 sounds
- **Meaningful sliders**: Every sound now has 3 tuning sliders that actually regenerate the audio with different parameters (e.g. Rain intensity changes drop density, heaviness changes filter character, surface changes resonance). Replaced the old playback-rate/gain-multiplier approach with real WAV regeneration on slider change
- **New category**: Added "Cozy" category with Heartbeat; expanded Water (8 sounds), Urban (4 sounds), Noise (4 sounds), Wildlife (3 sounds)
- **Smooth parameter updates**: Slider changes trigger debounced WAV regeneration (300ms) with seamless 400ms crossfade to the new audio — no audible gaps
- All existing sounds retain their original character at default slider positions

### 0.1.18
- Reduce audible loop-gap risk while preserving sound character: keep crossfade timing based on sound end, but add a lightweight playback monitor (120 ms cadence) so crossfades still trigger smoothly even when browser `timeupdate` events are sparse
- Prevent category chip layout shift: always reserve the count circle space and show an inactive grey placeholder when the active count is zero

### 0.1.17
- Move version number from header superscript to a tiny fixed label in the bottom-right corner of the screen

### 0.1.16
- Fix element watermark overlapping volume slider: repositioned to top-right of card with smaller size
- Add "Noise" category (music note icon) for White Noise, Pink Noise, Brown Noise
- Add "Wildlife" category (raven icon) with new Birdsong sound (chirps, trills, and peeps over gentle forest bed)
- Add sound selection buttons to Sound Builder (Fire, Birdsong) for choosing which sound to tune

### 0.1.15
- Fix persistent bubble/stream character in fire pops: remove all sine-wave components (f1/f2 oscillators at 180–560 Hz were the root cause) and replace with a 100% noise burst; shorten max pop life from 115 ms to 68 ms and tighten envelope (exp(-12p)) for a sharper crack with no tonal tail

### 0.1.14
- Bake in user-tested optimal fire settings as new defaults (bodyVol 1.4, bodyLp 0.007, roarMean 0.81, roarSpeed 0.00005, roarSigma 0.0015, crackleBase 13.5, crackleVol 5.4, popVol 1.35)
- Fix bubble sound in pop renderer: remove descending pitch chirp and increase noise ratio to 70%; update SoundBuilder default values to match

### 0.1.13
- Fix build error: add missing `src/vite-env.d.ts` with `/// <reference types="vite/client" />` so TypeScript recognises `import.meta.env.BASE_URL`

### 0.1.12
- Fix worklet module path: replace hardcoded `/worklets/fire.worklet.js` with `import.meta.env.BASE_URL + worklets/fire.worklet.js` in both `useAudioMixer.ts` and `SoundBuilder.tsx` — absolute path was resolving to domain root instead of `/SleepSounds/` on GitHub Pages, causing "Unable to load a worklet's module" error and silently falling back to pre-computed audio in the main mixer

### 0.1.11
- Fix SoundBuilder play button: use a module-level AudioContext singleton and call `ctx.resume()` synchronously before first `await`, ensuring it runs within the user gesture on iOS Safari; add visible error display so failures surface in the UI

### 0.1.10
- Fix SoundBuilder play button: reuse `FireWorkletSource` shared AudioContext instead of creating a new one, which caused suspend/resume failures on iOS Safari

### 0.1.9
- Renamed fire sound label back to "Fire"
- Slowed EQ bar animation from 0.9 s to 1.6 s per cycle
- Replaced fire background hiss with a rolling thunder roar: deep LP (~35 Hz) modulated by a slow OU envelope (~0.75 s time constant) for a distant-thunder swell/fade effect
- Crackles louder (mix weight 2.0 → 2.8) and more frequent (base rate 0.5 → 3.0)
- Exposed 8 new real-time AudioWorklet k-rate params on fire-synth processor (bodyVol, bodyLp, roarMean, roarSpeed, roarSigma, crackleBase, crackleVol, popVol)
- Added Sound Builder dev tool: collapsible section at bottom of app with grouped sliders for all fire parameters and a copy-to-clipboard config output
- Reclassified sounds into elemental categories: Water, Fire, Air, Earth
- Added faint element icon watermark to each sound card (Material Symbols); brightens when active

### 0.1.8
- Rewrote `genFire` with a 9-layer architecture: deep brown roar, pink body, flame hiss, ember sizzle, air whoosh, clustered crackle bursts with resin pings, spit crackles, pops, and log-shift rumble events
- Fixed fire sounding like white noise — lowered hiss/ember filter cutoffs, boosted roar/body weights, reduced continuous high-freq layer contributions
- Bumped `PRESET_STORAGE_KEY` to `v2`

### 0.1.7
- Initial WAV generation implementation
