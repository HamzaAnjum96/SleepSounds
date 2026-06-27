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

- All audio loops are procedurally synthesized in `src/audio/` (`generators.ts` over the `dsp.ts` helpers) and encoded to WAV blobs at runtime (mono 16-bit PCM). The generator module is code-split, so it loads on a sound's first play rather than at startup.
- No backend is required.
- The version number (from `package.json`) renders inline in the page footer (`.footer-meta` in `src/App.tsx`), beside the privacy link.

## Changelog

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
