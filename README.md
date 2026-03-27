# Sleep Mixer

> **For anyone making changes (human or AI):**
> - Bump the version in `package.json` with every change.
> - Add an entry to the `## Changelog` section at the bottom of this file describing what changed and why.
> - If sound generation changes significantly, bump `PRESET_STORAGE_KEY` in `src/data.ts` (e.g. `v2` → `v3`).

Sleep Mixer is a mobile-first ambient sound blending web app designed for relaxation and better sleep.

## Features

- Premium dark blue, minimal UI optimized for one-handed mobile use.
- Mix multiple calming sounds simultaneously, fully generated in-app (no external audio APIs/files), including:
  - Nature: Rain, Tent Rain, Rain on Tin Roof, Ocean, Wind, Forest, Thunder, Stream, Waterfall, Night Insects, Birdsong, Frogs, Underwater
  - Cozy: Fireplace, Café, Shower
  - Noise/Transport: White/Pink/Brown Noise, Deep Space, Heartbeat, Fan, Airplane, Dryer, Train
- Per-sound controls:
  - On/off toggle
  - Individual volume slider
- Master controls:
  - Play all active sounds
  - Pause all sounds
  - Stop all sounds
  - Master volume slider
- Sleep timer with automatic stop.
- Preset save/load/delete using `localStorage`.

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS
- HTMLAudioElement API for audio playback and mixing

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
    ├── App.tsx
    ├── data.ts
    ├── index.css
    ├── main.tsx
    ├── types.ts
    ├── components/
    │   ├── ActiveMixer.tsx
    │   ├── Header.tsx
    │   ├── MasterControls.tsx
    │   ├── PresetManager.tsx
    │   ├── SleepTimer.tsx
    │   ├── SoundCard.tsx
    │   ├── SoundLibrary.tsx
    │   └── VolumeSlider.tsx
    └── hooks/
        └── useAudioMixer.ts
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
- The version number (from `package.json`) is displayed as a tiny fixed label in the bottom-right corner of the screen. It is rendered in `src/App.tsx` inside the `.app-footer` as a `.footer-version` element, styled in `src/index.css` with `position: fixed; bottom: 6px; right: 8px` at 8px font size and low opacity so it stays unobtrusive.

## Changelog

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
