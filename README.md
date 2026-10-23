# starlight

**starlight** is a calm, mobile-first sleep-sound mixer that runs entirely in
the browser — **<https://starlight.rest/>**. Every sound is synthesised on the
device at runtime: nothing is recorded, streamed or downloaded, so it works
fully offline as an installable PWA, with no account, no ads and no tracking.

(The repository is `SleepSounds`; the app was called *drift away* until it
was renamed starlight.)

> **Making a change?** Read [CONTRIBUTING.md](CONTRIBUTING.md) first — every
> change bumps the version and adds a [CHANGELOG.md](CHANGELOG.md) entry, and
> a few rules (saved-mix storage, the icon subset, the discoverability
> surfaces, the accessibility gate) catch people out.

## Features

- **19 generated sounds** across eight families — rain, fire, fan, birdsong,
  night insects, thunder, windy forest, ocean, wind, underwater, white / pink /
  brown noise, train, airplane, heartbeat, cat purr, wind chimes and a ticking
  clock. Rain, thunder, windy forest, fire and birdsong are synthesised live in
  AudioWorklets; the rest are procedural loops rendered in a Web Worker. (Two
  more, Stream and Shower, are finished but held back — `HIDDEN_SOUND_IDS` in
  `src/data.ts`.)
- **Layer freely** with per-sound volume. Mixing is masking-aware, so stacked
  beds stay clear instead of fogging together.
- **Shape each sound** through named character presets (ocean: Lapping Shore /
  Distant Surf / Rolling Waves / Storm Surf), with fine-tune sliders behind a
  toggle.
- **Ten curated scenes** — one tap to a finished mix.
- **Save your own mixes**, and pick up last night's mix where you left it.
- **Sleep timer** (15 min – 8 h) with a gentle 90-second wind-down fade; the
  night sky dims with it.
- **Drift mode**: a full-screen night clock with a screen wake lock, for the
  nightstand.
- **Arrange the library** — hold a card and drag it, or use the keyboard grip.
- **Plays in the background** with lock-screen controls, pauses (and stays
  paused) when a call or another app takes the audio, and never updates
  itself while a mix is playing.
- **Forgiving in the dark**: stopping or deleting anything leaves an undo.

## Quick start

Requires Node `^20.19` or `>=22.12`.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (no service worker, so nothing is cached) |
| `npm run build` | Typecheck, production build, then inject the service-worker precache manifest |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc -b` |
| `npm run lint` | ESLint over `src/` (including jsx-a11y) |
| `npm test` | Vitest unit tests (`tests/*.test.ts`) |
| `npm run test:e2e` | Playwright over the production build: smoke flows plus the axe-core accessibility gate |
| `node scripts/sweep-sounds.mjs [url]` | With a dev server running: toggles every sound and asserts audio reaches the master bus |
| `python3 scripts/subset-icons.py` | Rebuild the icon-font subset (see [CONTRIBUTING.md](CONTRIBUTING.md#icons-the-material-symbols-subset)) |
| `node scripts/og-card/render-og-card.mjs` | Re-render the social preview image |

**Dev mode**: five quick taps on the moon (within 3 seconds). The moon wanes to
a crescent, the app turns monochrome, and the library reveals the held-back
sounds for auditioning. Five more taps or a refresh turns it off; nothing
persists.

## Documentation

| | |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | How it works at runtime: the audio engine, the shared graph, backgrounding and interruptions, storage, the PWA update flow, testing |
| [DESIGN.md](DESIGN.md) | The visual system: tokens, type, colour, motion, accessibility decisions |
| [PRODUCT.md](PRODUCT.md) | Who it's for and the principles behind every choice |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Rules and checklists for making changes |
| [CHANGELOG.md](CHANGELOG.md) | Every release, with what changed and why |
| [docs/ADDING-A-SOUND.md](docs/ADDING-A-SOUND.md) | The checklist for adding a generated sound |
| [docs/research/](docs/research/) | Background research on synthesis (reference only) |
| [PRIVACY.md](PRIVACY.md) | Privacy & terms (mirrors the in-app `public/privacy.html`) |

## Project structure

```txt
├── index.html              # shell, SEO/social meta, JSON-LD, install-prompt capture
├── public/
│   ├── sw.js               # service worker (precache manifest injected at build)
│   ├── worklets/           # live AudioWorklet generators (rain, fire, thunder, …)
│   ├── fonts/ · fonts.css  # self-hosted Inter, Cormorant and the icon subset
│   ├── privacy.html        # the in-app privacy page (standalone, not React)
│   └── manifest.json · llms.txt · robots.txt · sitemap.xml · icons, screenshots
├── scripts/                # precache injection, sound sweep, icon subset, OG card
├── tests/                  # Vitest units; tests/e2e/ holds the Playwright specs
├── docs/                   # adding a sound; research notes
└── src/
    ├── App.tsx             # the shell: scenes, mixes, library, player state
    ├── main.tsx            # entry: crash boundary, service-worker registration
    ├── data.ts             # the sound library, built-in scenes, lazy WAV rendering
    ├── types.ts
    ├── index.css           # the design system (see DESIGN.md)
    ├── audio/
    │   ├── sources.ts      # mixer sources: crossfaded WAV loops, worklets with fallback
    │   ├── graph.ts        # the shared AudioContext, master bus, interruption guard
    │   ├── layerMeta.ts    # masking roles and per-layer shaping
    │   ├── generators.ts   # procedural WAV synthesis per sound (code-split)
    │   ├── genWorker.ts    # runs the generators off the main thread
    │   └── dsp.ts          # noise, filters, loop conditioning, WAV encoding
    ├── components/
    │   ├── SoundCard.tsx · ShelfCards.tsx (scene + saved-mix cards)
    │   ├── MiniPlayer.tsx · NowPlayingSheet.tsx · SidePanel.tsx · MixControls.tsx
    │   ├── SoundEditor.tsx · soundEditorDefs.ts (editor models: sliders, variants, defaults)
    │   ├── DriftMode.tsx · NightSky.tsx
    │   └── Toast.tsx · CookieNotice.tsx · InstallPrompt.tsx · ErrorBoundary.tsx
    ├── hooks/
    │   ├── useAudioMixer.ts    # playback engine wrapper (intent ↔ audio sources)
    │   ├── useSleepTimer.ts    # wall-clock countdown and wind-down fade
    │   ├── useGridReorder.ts   # hold-to-drag library arrangement
    │   ├── useMediaSession.ts  # lock-screen metadata and transport
    │   ├── useAppUpdate.ts     # silent update into a newer build, only when idle
    │   ├── useToast.ts · useFocusTrap.ts · useShelfHint.ts · useAmbient.ts
    ├── storage/            # localStorage keys, load/save, migrations, library order
    ├── platform/           # the platform seam (wake lock, media metadata); web today
    ├── lib/                # icons, scenes, formatting, haptics, background audio, …
    ├── config/features.ts  # feature flags
    └── utils/logger.ts
```

`.github/skills/impeccable/` and `.impeccable/` hold the design-review
tooling used for the UI rounds; they are not part of the app.

## Deployment

Every push and pull request runs CI (`.github/workflows/ci.yml`: typecheck,
lint, unit tests, build, and the e2e + accessibility suite). Pushes to `main`
deploy to GitHub Pages (`.github/workflows/deploy.yml`), served at the custom
domain <https://starlight.rest/>. No backend is involved.
