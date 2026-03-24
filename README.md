# Sleep Mixer

Sleep Mixer is a mobile-first ambient sound blending web app designed for relaxation and better sleep.

## Features

- Premium dark blue, minimal UI optimized for one-handed mobile use.
- Mix multiple calming sounds simultaneously:
  - Rain
  - Ocean
  - Wind
  - Forest
  - Fireplace
  - White Noise
  - Brown Noise
  - Night Ambience
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

- Audio URLs are sourced from free-to-use Mixkit preview assets.
- No backend is required.
