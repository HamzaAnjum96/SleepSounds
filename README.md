# Sleep Mixer

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

## Changelog

### 0.1.8
- Rewrote `genFire` with a 9-layer architecture: deep brown roar, pink body, flame hiss, ember sizzle, air whoosh, clustered crackle bursts with resin pings, spit crackles, pops, and log-shift rumble events
- Fixed fire sounding like white noise — lowered hiss/ember filter cutoffs, boosted roar/body weights, reduced continuous high-freq layer contributions
- Bumped `PRESET_STORAGE_KEY` to `v2`

### 0.1.7
- Initial WAV generation implementation
