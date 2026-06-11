# Sleep Mixer

> **For anyone making changes (human or AI):**
> - Bump the version in `package.json` with every change.
> - Add an entry to the `## Changelog` section at the bottom of this file describing what changed and why.
> - If sound generation changes significantly, bump `PRESET_STORAGE_KEY` in `src/data.ts` (e.g. `v2` → `v3`).

**drift** (repo name Sleep Mixer) is a mobile-first ambient sound app for
relaxation and sleep. All 25 sounds are generated in the browser; nothing is
streamed or downloaded.

## Features

- **Scenes**: eight curated mixes as gradient-art cards; tap to play instantly.
- **The library**: 25 procedurally generated sounds in 8 categories, layered
  freely with per-sound volume and (for select sounds) deep parameter editors.
- **Mini player + now-playing sheet**: persistent player bar; the sheet holds
  per-layer sliders, master volume, sleep timer, save-mix, and drift mode.
- **Drift mode**: fullscreen night surface with clock, breathing play orb, and
  screen wake lock for the nightstand.
- **Sleep timer** (15m/30m/1h/90m) with a progress ring and a gentle 90-second
  wind-down fade; the night sky dims with it.
- **Your mixes**: save/load/delete via `localStorage`; lock-screen media
  controls (Media Session API); installable PWA with custom install prompt.

## Tech Stack

- React + TypeScript + Vite
- Hand-rolled CSS design system (`src/index.css`, documented in `DESIGN.md`);
  Tailwind present only for its base reset
- HTMLAudioElement + Web Audio worklets for playback and mixing

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
    ├── data.ts              # procedural sound synthesis + presets
    ├── index.css            # the design system (see DESIGN.md)
    ├── main.tsx
    ├── types.ts
    ├── components/
    │   ├── DriftMode.tsx        # fullscreen night surface
    │   ├── InstallPrompt.tsx    # PWA install affordance
    │   ├── MiniPlayer.tsx       # persistent bottom player
    │   ├── NightSky.tsx         # living canvas starfield
    │   ├── NowPlayingSheet.tsx  # mix control room
    │   ├── SoundCard.tsx        # library tile
    │   ├── SoundEditor.tsx      # per-sound parameter editor
    │   └── soundEditorDefs.ts
    ├── hooks/
    │   └── useAudioMixer.ts     # playback engine wrapper
    └── lib/
        ├── categoryIcons.ts · haptics.ts · scenes.ts · sliderFill.ts · time.ts
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

- All audio loops are procedurally synthesized in `src/data.ts` and encoded to WAV blobs at runtime (mono 16-bit PCM).
- No backend is required.
- The version number (from `package.json`) renders inline in the page footer (`.footer-meta` in `src/App.tsx`), beside the privacy link.

## Changelog

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
- **Privacy & terms**: added a hosted policy page (`public/privacy.html`, linked from the footer) and a repo mirror (`PRIVACY.md`), covering the no-data-collection model, local-only storage, the single Google Fonts third-party request, and a not-a-medical-device disclaimer.

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
