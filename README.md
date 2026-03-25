# Sleep Mixer

Sleep Mixer is a mobile-first ambient sound blending web app designed for relaxation and better sleep.

## Features

- Premium dark blue, minimal UI optimized for one-handed mobile use.
- Mix multiple calming sounds simultaneously, fully generated in-app (no external audio APIs/files), including:
  - Nature: Rain, Tent Rain, Ocean, Wind, Forest, Thunder, Stream, Waterfall, Night, Birdsong, Frogs, Underwater
  - Cozy: Fireplace, Café, Shower, Cat Purr
  - Noise/Transport: White/Pink/Brown Noise, Deep Space, Heartbeat, Fan, Airplane, Dryer, Train, Boat Cabin
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

- All audio loops are procedurally synthesized in `src/data.ts` and encoded to WAV blobs at runtime.
- No backend is required.
