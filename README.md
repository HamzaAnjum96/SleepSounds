# starlight

> **For anyone making changes (human or AI):**
> - Bump the version in `package.json` with every change.
> - Add an entry to the `## Changelog` section at the bottom of this file describing what changed and why.
> - Saved mixes store only *parameter state* (never audio — loops re-render fresh every session), and `storage/migrations.ts` drops unknown sound ids and unknown-shaped data safely. So retuning a sound or renaming a param never needs a storage change. Bump the saved-mixes key in `src/storage/keys.ts` (`STORAGE_KEYS.savedMixes`, e.g. `-v2` → `-v3`) **only** if a kept param key changes *meaning* incompatibly (same key, different effect) — and know that bumping discards users' saved mixes, so prefer a migration.
> - If you add or change an icon glyph, follow **Icons: the Material Symbols subset** below — new glyph names must be added to the subset font or they render as text.
> - If you add/remove a sound or change a headline feature, keep the discoverability surfaces in sync: the meta/OG descriptions and the JSON-LD `featureList` in `index.html`, and `public/llms.txt` (see **Discoverability** below).
> - UI changes must pass the accessibility gate: `tests/e2e/a11y.spec.ts` fails on any serious/critical axe-core violation across the primary surfaces.

**starlight** (repo SleepSounds; formerly "drift away") is a mobile-first ambient sound app for
relaxation and sleep. All 19 sounds are generated in the browser; nothing is
streamed or downloaded. Rain, Thunder, Windy Forest, Fire, and Birdsong are
synthesised live via AudioWorklet (event-based); the rest are procedural WAV
loops. (Two more finished sounds, Stream and Shower, are pulled from the
lineup for now — `HIDDEN_SOUND_IDS` in `src/data.ts` — and don't count toward
the public tally.)

## Features

- **Scenes**: ten curated mixes as gradient-art cards; tap to play instantly.
- **The library**: 19 procedurally generated sounds across eight categories,
  layered freely with per-sound volume. All but the noise trio open an editor that leads
  with named character presets (variant chips with small drawn marks — e.g.
  ocean's Lapping Shore / Distant Surf / Rolling Waves / Storm Surf) and
  hides fine-tune sliders behind a toggle.
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

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for how these fit together (audio graph,
interruption handling, storage, PWA update flow, testing).

```txt
starlight/
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── docs/ADDING-A-SOUND.md  # the checklist for adding a generated sound
├── docs/research/          # background research reports (reference only)
├── tests/                  # vitest unit tests + tests/e2e Playwright specs
└── src/
    ├── App.tsx              # shell: scenes, mixes, library, player state
    ├── data.ts             # sound library + built-in presets (lazy WAV loader)
    ├── index.css           # the design system (see DESIGN.md)
    ├── main.tsx
    ├── types.ts
    ├── audio/
    │   ├── dsp.ts               # noise sources, filters, loop-conditioning, WAV encoding
    │   ├── generators.ts        # per-sound procedural WAV synthesis (code-split)
    │   ├── graph.ts             # the shared AudioContext + master bus + interruption guard
    │   ├── layerMeta.ts         # masking roles + per-layer shaping (anti-fog)
    │   └── sources.ts           # mixer sources: crossfade WAV + worklet w/ fallback
    ├── components/
    │   ├── CookieNotice.tsx     # one-time storage notice
    │   ├── DriftMode.tsx        # fullscreen night surface (lazy)
    │   ├── ErrorBoundary.tsx    # last-resort crash guard
    │   ├── InstallPrompt.tsx    # PWA install affordance
    │   ├── MiniPlayer.tsx       # persistent bottom player
    │   ├── MixControls.tsx      # per-layer mixer (volume, mute/solo, save)
    │   ├── NightSky.tsx         # living canvas starfield
    │   ├── NowPlayingSheet.tsx  # mix control room (lazy)
    │   ├── SidePanel.tsx        # desktop docked mixer
    │   ├── SoundCard.tsx        # library tile
    │   ├── SoundEditor.tsx      # per-sound parameter editor (lazy)
    │   ├── Toast.tsx            # forgiving undo snackbar
    │   └── soundEditorDefs.ts   # editor models: groups, variants, defaults
    ├── hooks/
    │   ├── useAudioMixer.ts     # playback engine wrapper (state ↔ audio sources)
    │   └── useSleepTimer.ts     # sleep-timer countdown, wind-down fade, handlers
    ├── storage/                 # localStorage keys + load/save + migrations
    ├── platform/                # platform seam (web bridge today)
    ├── config/                  # feature flags
    ├── utils/                   # logger
    └── lib/
        ├── backgroundAudio.ts · categoryIcons.ts · haptics.ts · scenes.ts
        ├── sliderFill.ts · soundIcons.ts · time.ts · variantIcons.tsx
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

### Developer tips

- **Dev mode**: five quick taps on the moon (within 3 seconds) toggle it —
  the moon wanes to a crescent, the greeting says so, and the library reveals
  the hidden / pulled sounds (e.g. Shower, Stream) for auditioning. Five more
  taps or a refresh turns it off; nothing persists.
- **Tests**: `npm run test` (vitest units), `npm run test:e2e` (Playwright
  over the production build — smoke flows plus the axe-core accessibility
  gate), `npm run lint`.

## Icons: the Material Symbols subset

The UI's icons are Google's **Material Symbols Rounded**, self-hosted as a
~7 KB subset (`public/fonts/material-8.woff2`) of the ~510 KB full font, so
icons work offline and no request leaves the device. It's a *ligature* font:
markup contains the icon's name as text (`<span
class="material-symbols-rounded">pets</span>`) and the font maps that letter
sequence to the glyph.

**Whenever you reference a new glyph name anywhere in `src/`** — the icon maps
in `src/lib/soundIcons.ts` / `src/lib/categoryIcons.ts`, or an inline
`material-symbols-rounded` span — you must add it to the `ICONS` list in
`scripts/subset-icons.py` and re-run the subset:

```bash
pip install fonttools brotli
python3 scripts/subset-icons.py
```

A glyph missing from the subset renders as its raw name in text (the word
"pets", not tofu), so eyeball any new icon. The script fails loudly on a
typo'd name. In-place font updates are cache-safe: the service-worker build id
hashes every precached file's bytes (`scripts/inject-precache.mjs`) and the SW
installs with `cache: 'reload'` (`public/sw.js`) — see the script's docstring
for the history behind that.

## Discoverability: SEO, social cards, and AI readers

The app is a client-side React shell, so scrapers that don't run JavaScript
see nothing in the body. Everything they need lives in explicit surfaces,
which must be kept in sync by hand when features change:

- **`index.html`** — the meta description, the Open Graph / Twitter card tags
  (absolute URLs; WhatsApp requires them), and one JSON-LD
  `schema.org/WebApplication` block (keep it to exactly one entity).
- **`public/og-starlight.jpg`** — the 1200×630 social preview, generated from the
  app's own ingredients (starfield, moon, Cormorant wordmark) by
  `scripts/og-card/render-og-card.mjs`; re-run it rather than editing the JPEG.
- **`public/robots.txt` + `public/sitemap.xml`** — everyone welcome, AI
  crawlers included; the sitemap lists the app and the privacy page.
- **`public/llms.txt`** — a plain-text summary for AI agents (per the llms.txt
  convention): what the app is, the feature list, key facts, doc links.

## Notes

- All audio loops are procedurally synthesized in `src/audio/` (`generators.ts` over the `dsp.ts` helpers) and encoded to WAV blobs at runtime (two-channel 16-bit PCM; a few non-directional sources stay centred). Stereo width is baked in at generation — broad beds via decorrelated opposite time-shifts (no comb filtering), discrete events via equal-power panning — and layering is masking-aware (`layerMeta.ts` roles + `layerShaping`). The generator module is code-split, so it loads on a sound's first play rather than at startup.
- No backend is required.
- The version number (from `package.json`) renders inline in the page footer (`.footer-meta` in `src/App.tsx`), beside the privacy link.

## Changelog

### 0.0.12
- **A11y: the modal dialogs now trap keyboard focus.** The now-playing sheet
  and drift mode are both `aria-modal="true"` and already moved focus in on
  open and restored it on close — but neither stopped Tab / Shift+Tab from
  walking out into the shell behind them, so a keyboard or screen-reader user
  could get lost outside an open modal while the rest of the page was meant to
  be inert. A small shared `useFocusTrap` hook (`src/hooks/useFocusTrap.ts`)
  now wraps focus at the dialog's edges and pulls it back if it lands outside.
  Purely additive — the existing focus-in/restore behaviour is untouched, and
  the trap is inert while the modal is closed. Tagged `[v0.0.12 a11y]`.

### 0.0.11
- **Perf: the sound grid no longer re-renders on unrelated updates.** Every
  library card (`SoundCard`) received freshly-allocated inline callbacks each
  render, and `handleSoundToggle` changes identity whenever `soundState` does —
  so dragging *one* card's volume slider, or a once-per-second sleep-timer tick,
  re-rendered all ~19 cards. The card is now wrapped in `memo`, its callbacks
  are id-parameterized, and the parent passes ref-backed handlers with a
  constant identity. Result: only the card whose own props actually changed
  repaints; a timer tick repaints none of them. No visual or audio change —
  pure render-cost reduction, most noticeable while dragging a slider on a
  low-end phone. Tagged `[v0.0.11 perf]` in `SoundCard.tsx` and `App.tsx`.

### 0.0.10
- **Revert the Fan stereo widening (0.0.9) — it sounded worse.** The
  airflow-widening measured cleanly (correlation, mono-sum, band ratios all
  looked fine) but by ear the decorrelation thinned the whoosh and unsettled
  the steady hush that makes a fan calming. Reverted to the exact pre-0.0.9
  mono render (verified byte-identical), and the generators test that pinned
  the fan as centred is restored, with a note recording why. The lesson: a
  clean measurement is not a listening test — the fan is a compact source and
  stays mono.

### 0.0.9
- **Fan: stereo width on the airflow, tones still centred.** A stereo-image
  audit (L/R correlation across the library) found the Fan the only
  broadband bed rendering fully mono — every other bed (ocean, wind, forest,
  train, airplane) is already widened. It had been kept mono on purpose,
  because decorrelating its near-pure blade/motor sinusoids combs them; but
  that also flattened the airflow "whoosh," which is the fan's largest and
  most genuinely diffuse component. Now the noise bed is split from the
  tones: the airflow above 900 Hz is decorrelated (L/R correlation 1.00 →
  0.72, matching the airplane bed) while the blade pulse, motor hum, casing
  resonances and all bass stay dead-centre — width without combing the
  tones. The mono sum is nearly unchanged (all bass fused), so it still
  sounds like a fan on a phone speaker; on headphones it fills the room.
  Verified by A/B against the old render and through the live audio graph.

### 0.0.8
- **WAV rendering moved off the main thread (Web Worker).** Every sound's
  first play and every variant/slider retune renders 32 s of audio — a
  synchronous 100 ms–3 s DSP block (ocean ~670 ms, fire ~560 ms on this
  machine) that ran on the main thread, freezing the UI mid-tap so even the
  card's loading spinner couldn't animate. Rendering now runs in a dedicated
  worker (`src/audio/genWorker.ts`); the blob URL is minted in the same
  origin's store, so only the URL string crosses back and the `<audio>`
  elements play it directly. Falls back to the old inline render if a worker
  can't start (CSP, test runners) — same deterministic output. Verified
  bit-for-bit parity with the main-thread path and 19/19 through the live
  audio graph.
- **Hardened the sound-sweep verifier against sparse sounds.** The permanent
  runtime sweep read a single ~6 ms peak-meter window per 250 ms poll, which
  almost never coincides with a sparse transient — a clock tick is ~30 ms
  once a second — so it could report the (perfectly audible) Ticking Clock as
  a FAIL. It now accumulates the peak per animation frame across each listen
  window, catching every tick; confirmed the clock ticks nine to eleven times
  in eight seconds at ~0.3–0.4 peak.

### 0.0.7
- **Scene balance audit: every advertised layer is now actually audible.**
  Scene volumes were tuned long before months of generator re-leveling, and
  a per-layer measurement (WAV rms at the scene's tuning × volume × masking
  gain, in dB against the scene's lead) showed several scenes no longer
  delivering their own mood line: **Fan & Rain**'s fan — the *title* layer —
  sat at −20.5 dB (the scene played as a Rainfall duplicate; now −5.4 dB, a
  proper co-headliner), **Fireside**'s "quiet dark" insects were at −22.4 dB
  (now −12.3, a real garnish), **Deep Rest**'s heartbeat was masked at
  −10.5 dB *inside the same low band* as the brown noise (now −6.5) with its
  insects at −16 (now −11.6), and **Ocean Night**'s insects were at −16.7
  (now −10.7). Targets: co-headline −3..−7 dB, named garnish −9..−13 dB,
  nothing advertised below −15. Mix numbers only — no generator changed.

### 0.0.6
- **Ticking Clock: audible at last.** A whole-library level audit found the
  clock ~20 dB under everything else (rms 0.011 vs the library's 0.08–0.16)
  — as an accent layer it gets no masking compensation, so in any mix it
  simply vanished, and solo it was startlingly quiet next to any other
  sound at the same slider. Fixed without changing the approved bare-tick
  character: the same sharp attack now carries a quiet ~11 ms gear-train
  tail, and the sparse transients normalize to 0.8 peak (they read far
  quieter than continuous beds at equal peak). Result: +7 dB energy across
  all four variants, true silence between beats preserved (floor at the
  dither level), and the clock is still the quietest sound in the library
  by sustained energy — present, not prominent. Verified per-variant by
  probe and through the live audio graph (19/19 sweep).

### 0.0.5
- **Descriptive variant marks for the last six bar-only sounds.** Birdsong,
  Stream, Thunder, Night Insects, Underwater, and Shower were still using
  the generic ascending-bars fallback on their character chips; each now has
  crafted 16px marks in the house grammar (`lib/variantIcons.tsx`, inline
  SVG — no icon-font subset step involved): far song / a perched bird / the
  dawn sun; a trickle / stones in a brook / rushing flow; a flicker beyond
  the horizon / rumble under a cloud / a gathering second cell / the bolt
  landing; a lone chirp in the grass / the moon over a meadow / deep-night
  stars; hanging bubbles / a current / the deep floor; and three shower
  pressures. Every sound with variants now has descriptive icons — the bars
  remain only as the deliberate fallback for future unmarked variants.

### 0.0.4
- **Fix: leftover "drift" branding in the install prompt.** The install row's `aria-label` still read "Install drift" from before the rebrand; now "Install starlight." Found while investigating a report of the install prompt not appearing (root cause was the intentional `hasPlayed && storageAck` gate plus per-browser support, not a bug — see `InstallPrompt.tsx`).

### 0.0.3
- **Privacy page: dropped the GitHub-repo link.** The closing "questions? open an issue" note pointed at the repo; removed along with its now-unused `.note` styling (the border/spacing moved onto the "back to starlight" link so the page's closing rhythm is unchanged).

### 0.0.2
- **Custom domain: the app now lives at `https://starlight.rest/`.** GitHub
  Pages 301-redirects the old `hamzaanjum96.github.io/SleepSounds/` URLs to
  the apex of the new domain — which broke the app there, because the build
  was rooted at `/SleepSounds/` and every asset 404'd after the redirect
  stripped the repo path. Fixes:
  - Vite `base` is now `/` (the custom domain serves from the root); the
    Playwright/e2e, sound-sweep, and OG-card scripts follow.
  - Every absolute URL — canonical, `og:url`, `og:image`, Twitter image,
    JSON-LD, `robots.txt`'s sitemap pointer, `sitemap.xml`, `llms.txt`, the
    privacy page's canonical — now points at `https://starlight.rest/`.
  - Old links keep working via GitHub's redirect; HTTPS on the new domain
    activates as soon as GitHub finishes provisioning the certificate
    (settings-side, nothing in-repo).

### 0.0.1
- **Rebrand: the app is now "starlight"** (formerly *drift away*), and the
  version counter restarts at 0.0.1 for the new brand — every entry below
  this one is the drift-away era. The night theme already fit the name, so
  this is a text/metadata pass:
  - **In-app**: wordmark, document title, media-session title/artist,
    storage notice, crash line.
  - **Metadata**: page meta + OG/Twitter tags, JSON-LD, PWA manifest
    name/short name, privacy page, `robots.txt`, `llms.txt`.
  - **Social card**: regenerated with the starlight wordmark and shipped
    under a fresh URL (`og-starlight.jpg`) so WhatsApp's cached preview of
    the old brand can't linger; the old `og-card.jpg` is gone.
  - **Service worker**: cache prefix renamed to `starlight-`; activation
    still deletes old `drift-away-*` caches so upgrading devices clean up.
  - **Docs**: README/ARCHITECTURE/DESIGN/ADDING-A-SOUND intros; the
    package is named `starlight`. Historical changelog entries keep the old
    name. Internal identifiers (localStorage keys, `__drift*` globals,
    `.drift-slider` classes, drift mode the feature) are deliberately
    unchanged — renaming storage keys would discard users' saved mixes.

### 9.5.4
- **Privacy page metadata.** The privacy page is listed in the sitemap but
  had no meta description or canonical URL; search results would improvise a
  snippet from whatever text they found. It now carries both, with a
  description that mirrors what the page actually promises (no accounts, no
  analytics, nothing leaves the device).

### 9.5.3
- **Documentation refresh + one honest number.** The docs pass, applied to
  the docs themselves:
  - The public sound count now tells the truth everywhere: **19** sounds are
    in the lineup (Stream and Shower are pulled — `HIDDEN_SOUND_IDS`), but
    the OG/Twitter descriptions, JSON-LD, `llms.txt`, the README, and the
    in-app library counter all said 21. All now say 19, and the in-app
    counter is computed from the visible library (so dev mode counts what it
    actually shows).
  - README: maintainer notes now cover the two new invariants (keep the
    discoverability surfaces in sync; UI changes must pass the axe gate), a
    **Discoverability** section documents the SEO/AI-reader surfaces in one
    place, developer tips document dev mode and the test commands, and the
    features list reflects the character-preset editor system.
  - DESIGN.md's accessibility section records the landmark structure and the
    axe-core gate added in 9.5.2.

### 9.5.2
- **Accessibility: an automated axe-core gate, and landmark fixes.**
  - New e2e spec (`tests/e2e/a11y.spec.ts`, via `@axe-core/playwright`):
    no serious or critical violations allowed on the main page, the
    now-playing sheet, an open sound editor, or the desktop split layout —
    so label/ARIA/contrast regressions can't creep in silently.
  - Landmarks: the app's content now sits in a real `<main>`; the footer is
    a `<footer>` element; the hidden site-verification text is
    `aria-hidden`. The page now scans clean at **every** axe impact level,
    not just the gated ones.

### 9.5.1
- **`llms.txt` for AI readers.** A plain-text, agent-oriented summary at the
  site root (per the emerging llms.txt convention): what the app is, the full
  feature list, the key facts (free, open source, offline, no tracking), and
  links to the in-repo docs. It notes explicitly that the app is a
  client-side React shell — fetching the HTML yields nothing — so this file
  and the JSON-LD are the reliable machine-readable descriptions.
- Fix: removed an older, second JSON-LD `WebApplication` block that predated
  9.5.0 — two entities describing the same app confuse structured-data
  parsers; the richer 9.5.0 block is the one that stays.

### 9.5.0
- **SEO fundamentals.** Start of a discoverability/accessibility pass:
  - **JSON-LD structured data** (`schema.org/WebApplication`) in the page
    head — name, rich description, category, price (free), feature list,
    card image and screenshot — the machine-readable summary search engines
    and AI readers prefer over scraping.
  - **`robots.txt`** (everyone welcome, AI crawlers included — the app is
    fully client-side, there's nothing to protect) pointing at a new
    **`sitemap.xml`** (the app + the privacy page).
  - Verified: JSON-LD parses in the built output; both files ship in `dist/`.

### 9.4.5
- **Train: the static layer is removed, not just turned down.** 9.1.6 halved
  the hiss bands; feedback says halving wasn't the point. The wheel-top
  (2.3–5.2 kHz) and aero (1.5–6.4 kHz) noise sources are now **deleted** — at
  sleep volumes they only ever read as static — and the surviving mid floor
  (rolling band, rail mid) is darker again and rides the carriage sway and
  roughness flutter, so nothing in the sound holds one frozen level. A
  sleeping carriage is rumble, sway, and joint clacks; any brightness left
  belongs to the clatter events. Measured: energy above 1.5 kHz falls to
  1.1–1.9% across all four scenes (Express was 8.3%).

### 9.4.4
- **Underwater: the laser guns are gone — full revert of the bubble
  experiment.** The 9.3.8 softening wasn't enough; the physics voicing was
  the problem itself. Its exponentially decaying bubbles ring as *pure tones*
  for up to ~0.9 s (a 150 Hz "glug" has a long ring time by design), and an
  exposed pure-tone burst against this dark muffled bed reads as weapon fire
  no matter how gently it starts. The bubbles are back to the pre-9.3.0
  voice that was right all along: short soft blips (8–30 ms, sine envelope,
  mild rise), glug trains deleted. The bubble-physics notes stay in
  `docs/research/` — the stream's babble keeps that model, where it works.

### 9.4.3
- **Deploy hardening, round two.** 9.4.2's Pages deploy was rejected twice —
  the 90 s retry wasn't enough, so the backend's bad mood can outlast a short
  backoff. The deploy job now makes a **third attempt after a 5-minute
  pause**, and the workflow gained a **`workflow_dispatch`** trigger so a
  rejected deploy can be re-run from the Actions tab without cutting a
  release (it always ships the latest main). This release's own push also
  redelivers 9.4.2's fixes (the click-dead side panel and the moon anchor)
  to the live site.

### 9.4.2
- **Two desktop bugs: the click-dead side panel, and the wandering moon.**
  - *Side panel sometimes unclickable (including play):* the `bg-layer`
    gradient wash — a fixed, viewport-covering, positioned element — was the
    one scenery layer without `pointer-events: none`, and the side panel's
    content was unpositioned, so the invisible background hit-tested **above
    the entire panel** and swallowed every click (reproduced:
    `elementFromPoint` over the panel's play button returned `bg-layer`).
    Fixed both ways: `bg-layer` is now pointer-transparent like the other
    scenery, and the panel joined the app shell's stacking layer so no
    scenery can ever sit over it again.
  - *Moon sliding down as the page grows:* the compositor scroll-parallax
    mapped progress over the **total scroll height**, so the same scroll
    offset put the moon lower on longer pages (the JS fallback was
    pixel-based and didn't drift — the two paths disagreed). The animation
    now runs over a fixed range (`animation-range: 0 100vh`, the same
    0.7px-per-px as the fallback) and the resting anchor is `top: 7vh` —
    viewport units, so nothing about page length can move it. Verified: at
    the same scroll offset the moon now sits at the identical pixel on a
    short and a lengthened page.

### 9.4.1
- **Windy Forest, round two: less harsh, and no longer static-like.** The
  static character was the constant grain spray — leaves fizzing at a steady
  base rate regardless of wind. Rustle is now gust-carried: the base rate
  drops ~60% so lulls genuinely rest, and the density lives in the gust term,
  arriving as waves of rustle with real pauses. The whole voice also sits
  lower: leaf grains at 700–2600 Hz (another notch down), the wind's body
  band leads while the mids and whistle recede, the master lowpass comes down
  to ~3.4 kHz, and the WAV fallback's bed and twigs are darkened to match.

### 9.4.0
- **A proper social-share card.** Sharing the link (WhatsApp, iMessage,
  Slack, X…) now previews a generated 1200×630 night scene — the app's
  textured starfield, the moon, and *drift away* in the Cormorant wordmark
  with the line "sleep sounds, generated in your browser" — instead of the
  square app icon in a small card. Built from the app's own visual
  ingredients by `scripts/og-card/render-og-card.mjs` (generated, not
  borrowed), shipped as a 46 KB progressive JPEG (well inside WhatsApp's
  preview size limit), with refreshed `og:` / `twitter:` meta:
  `summary_large_image`, absolute image URLs (WhatsApp requires them),
  proper dimensions/alt text, and a description that says what the app
  actually is — 21 sounds, generated in the browser, free, offline, no
  tracking. Note: WhatsApp caches link previews aggressively; a fresh image
  URL (`og-card.jpg`) sidesteps the stale cache.

### 9.3.11
- **Heartbeat: no more keyboard-click on the beat.** The blood-rush layer was
  fine; the beat itself ticked. Each thump mixed in **raw broadband white
  noise** ("tissue," at 0.22), which put a wideband transient spike up to
  ~2 kHz on top of every low beat — exactly a keyboard-key click on a
  spectrogram. Real heart sounds are low-frequency, so the murmur is now
  heavily lowpassed (~180 Hz) and much quieter (felt as body, not heard as a
  tick), and the thump onset is softened (15 ms → 24 ms rise). Measured: the
  beat's spectral centroid drops from 382 Hz to 128 Hz and its energy above
  800 Hz from 9% to 2.5% — the bright click collapses into the thump.

### 9.3.10
- **Windy Forest is softer.** The harshness was a bright, hissy top: leaf
  grains reached to 6 kHz, the whistle band was resonant (Q 4), and nothing
  tamed the top end. Leaf rustle now sits ~900–3200 Hz (the old top octave
  was the sizzle), each grain a touch quieter; the whistle band is eased
  (Q 4 → 3, gain 0.5 → 0.38); and a gentle master lowpass (~4.8 kHz) rolls off
  the canopy's top so it reads as soft, not brittle. The WAV fallback's twigs
  were darkened to match (top cut 5.4 → 3.8 kHz). *(This pass also added the
  missing `lowpass` method to the worklet's filter class — the master lowpass
  needs it; caught before shipping because the runtime sweep flagged the
  forest going silent.)*

### 9.3.9
- **Thunder: the static bed is gone, and the sliders are back.** The live
  worklet already falls to true silence between strikes (measured: 53% of the
  loop near-zero), so the "static white noise bed" was the **WAV fallback**
  (served when a device can't load the worklet): it ran a *continuous*
  brown-noise rumble the whole time. That bed is now gated by a per-strike
  bloom envelope — the roll swells with each strike and rolls away over
  several seconds (longer for far storms), fading to silence before the next,
  matching the worklet's "rolls, then quiet" shape (fallback now measures 54%
  near-silent, like the worklet). Removed the fallback's leftover pink-noise
  hiss band in the same pass. And the three sliders — **activity** / rumble /
  distance — are no longer hidden (`variantsOnly` is off), so you can shape a
  scene, not just pick one.

### 9.3.8
- **Underwater: no more laser guns.** Feedback nailed it — an exposed pure
  sine chirping 35% from a 2 ms edge reads as a weapon, not a bubble. The
  bubble voice keeps its physics but is now heard the way water actually
  delivers it: a ~12 ms eased onset (water blurs attacks), only a hint of
  up-chirp (8%), lower frequencies (300–900 Hz), roughly half the level,
  and a sparser population. The glug trains stay, at less than half their
  old weight.

### 9.3.7
- **Thunder's WAV fallback opens gently, like the real one.** The live
  worklet holds its first strike back 9–21 s and softens it — the sleep-safe
  opening from the 7.19 rework — but the fallback loop could land a full
  boom 1.5 s after you pressed play. It now opens with the same lull (8–15 s,
  loop-safe: on repeat it reads as a pause between strikes) and its first
  boom lands at 60% weight.

### 9.3.6
- **Windy Forest's WAV fallback comes off its rails.** The live worklet is
  already a proper gust-field model; the fallback loop (used when the worklet
  can't load) still swelled on a fixed-frequency |sin| (an audible ~15–30 s
  cycle) with twigs cracking on a metronome regardless of the wind. The
  canopy now breathes on a loop-closed random gust walk and the twigs ride
  it — mostly cracking when the canopy is actually moving, harder in strong
  gusts, mostly silent in lulls.

### 9.3.5
- **Brown Noise: a slow, loop-closed swell** (±10%, 5–11 s holds) so the deep
  floor rolls almost imperceptibly instead of holding one frozen level —
  brown is all low end, so it breathes in level where white/pink breathe in
  tilt.

### 9.3.4
- **Pink Noise: the same gentle spectral breathing as 9.3.3's white** — a
  loop-closed walk toward a darker copy of itself, so the fall stays
  uneventful without holding one frozen spectrum for hours.

### 9.3.3
- **White Noise: the spectrum breathes.** Auditory-texture work says realism
  lives in slowly varying subband statistics, and perfectly stationary noise
  reads as synthetic and fatiguing over hours. The body now crossfades very
  gently toward a darker copy of itself on a loop-closed random walk
  (spectral tilt breathing, never a level pump) on top of the existing
  drift/shimmer movement. Uneventful, but no longer frozen.

### 9.3.2
- **Shower: water strikes a surface now.** It was three noise bands — a vent,
  not a shower. Following the "sound atoms" split from the rain research
  (background bed + discrete impacts), a dense patter of individual drop
  impacts now sits under the spray, its rate riding the **pressure** slider,
  and the occasional heavier hit rings the tub with a fast-damped low
  resonance. Spray, steam and the room resonance are unchanged. Hidden from
  the lineup for now — audition it in dev mode.

### 9.3.1
- **Stream actually babbles.** The generator was two filtered noise bands —
  which is precisely the "indistinct murmur" failure the liquid-sound
  literature describes; a brook's voice is its individual bubble events. A
  babble layer now rides the flow: a population of damped-sinusoid bubbles
  with the rising Minnaert chirp (mid-band voices, with the **sparkle**
  slider governing the bright small-bubble end), each panned to its own spot,
  their rate surging with the flow. A quiet collective low band (the
  coupled-bubble hum of dense water) rides the **depth** slider. Hidden from
  the lineup for now — audition it in dev mode; it's a candidate to return.

### 9.3.0
- **Underwater: bubbles that obey bubble physics.** Start of a
  research-grounded pass over the less-worked sounds (notes + sources in
  `docs/research/water-family-synthesis.md`). Per the Minnaert / van den Doel
  liquid-sound model, a real bubble is a damped sinusoid with a near-instant
  onset, an exponential decay that lengthens with bubble size, and a pitch
  that **rises** through the decay — the old bubbles were symmetric
  sine-envelope "boops" with none of that, which is exactly the electronic
  blip the literature warns about. The population is Minnaert-spread too:
  mostly small distant bubbles heard darkly through the water, with
  occasional low **glug trains** (a large bubble breaking into 2–4 smaller,
  higher ones as it rises). The deep pressure bed and current swell are
  unchanged.

### 9.2.6
- **Pages deploys now retry a backend rejection.** 9.2.4's queue-don't-cancel
  fix wasn't enough: its own deploy run failed the same way ("Deployment
  failed, try again later" straight from the Pages API) even without any
  cancellation in play — the backend just intermittently rejects deployments
  when several land minutes apart. The deploy job now treats the first
  attempt as fallible, pauses 90 s, and deploys once more for real before
  the run is allowed to fail. Between queueing (9.2.4) and this retry, a
  burst of releases can no longer strand the site on an older build.

### 9.2.5
- **The library is ordered by build maturity.** The grid now leads with the
  most convincing synths — Rain and Fire (the flagship worklets), then the
  long-settled Fan / Birdsong / Night Insects, then Thunder, Windy Forest,
  Ocean, Wind, Underwater, the noise family, Train, Airplane, and the newest
  builds (Heartbeat, Cat Purr, Wind Chimes, Ticking Clock) last. The hidden
  sounds close the list, so dev mode appends them at the end.

### 9.2.4
- **Fixed the failing GitHub Pages deploys.** The 9.2.0 and 9.2.1 deploy runs
  died with "Deployment failed, try again later" while CI stayed green. Cause:
  the deploy workflow used `cancel-in-progress: true`, and cancelling a Pages
  run mid-deployment leaves its server-side deployment dangling — the next
  run then collides with it. With releases landing minutes apart, that
  happened back to back. Deploys now queue instead of cancelling
  (`cancel-in-progress: false`, per GitHub's own Pages guidance for
  production deployments). The site itself was never stale for long — each
  successful deploy publishes the latest main.

### 9.2.3
- **Category filters reordered.** The elemental families people reach for
  first lead: Water · Fire · Air · Wildlife, then the indoor/textural ones
  (Cozy · Earth · Noise · Urban).

### 9.2.2
- **Cat Purr moved to Wildlife.** It's an animal, not furniture — it now sits
  with Birdsong and Night Insects (and wears the moss accent), leaving Cozy
  to the hearth-side textures: Heartbeat, Wind Chimes, Ticking Clock.

### 9.2.1
- **Dev mode: spam-tap the moon.** Five quick taps on the moon (within 3 s)
  toggle dev mode; five more — or a refresh — turn it off (session-only by
  design, nothing persisted). While it's on, the moon **wanes to a crescent**
  (a night-sky disc slides across, the glow pulls in), the greeting reads
  "… · in dev mode", and the library reveals the hidden / pulled sounds
  (Stream, Shower today — anything in `HIDDEN_SOUND_IDS` plus experimental
  builds). Plumbing: the moon is a real (a11y-hidden, tab-unreachable)
  button now, and it needed its own z-index step above the app shell — real
  taps hit the shell, not the scenery, which is also why the old
  "moon can't swallow taps" rule still holds: only the 52 px disc itself
  catches anything.

### 9.2.0
- **Ticking Clock: the bare tick is the sound now — and the sliders vary the
  mechanism, not the mud.** Feedback was consistent: it only sounded right
  with every slider at zero. So that render — the naked escapement click,
  true silence between beats — is the generator's base voice, and the case
  knock / distance muffle / room tone controls are gone entirely. The new
  sliders edit real qualities of the mechanism: **pace** (a slow 2-second
  pendulum through the 1-second default to a quick ½-second pocket-watch
  tick, always snapped to an even beat count so the tick/tock alternation
  survives the loop seam), **tick–tock** (how differently the two escapement
  faces are voiced, from one even tick to strongly two-toned), and
  **brightness** (the click's tone). New chips with new marks: **Slow
  Pendulum** · **Bare Tick** (default) · **Even Beat** · **Pocket Watch**.
  Measured: default = 32 beats and 93% true silence; Slow Pendulum 18 beats;
  Pocket Watch 60.

### 9.1.7
- **Every variant that depicts something now has a drawn mark.** The crafted
  16px chip marks (previously only rain's roof/window/tin and fire's flames)
  now cover ten sounds — 39 new marks: ocean's ripples / horizon surf /
  cresting roller / storm spray; wind's starlit streamline / hillside / roof
  eaves / stacked gale; the four fans as their actual appliances; the woods
  (trembling leaves, tree crown, twin pines, a pine bent into the wind);
  train's receding rails / lit sleeper carriage / jointed rail / express
  nose; airplane's crescent-and-plane / level cruise / swept wing / bumpy
  flight line; heartbeat's drifting heart / heart / filled heart / heart held
  in a circle (Womb); the clock as pendulum / mantel arch / tall case /
  tick-through-a-doorway; the chime sets hanging still, long, leaning, and
  thrown wide; and three cat faces for the purr (eyes closed, settled, rumble
  radiating). All inherit the chip's category accent via `currentColor`; the
  noise family keeps position bars deliberately — a spectral tier *is* that
  family's honest character axis.

### 9.1.6
- **Train no longer sounds like overpowering static.** The continuous floor's
  broadband bands (rolling noise, rail mid, wheel top, aero hiss) sat on top
  of the rumble instead of under it. The rolling band is darker (lowpassed
  ~30% lower with a second pole so it can never read as open hiss), the rail
  mid / wheel top / aero weights are roughly halved, and the underfloor body
  leads. Measured on the default Sleeper Car: energy above 1.5 kHz drops from
  11% to 3.7%, the 0.3–1.5 kHz band from 16% to 10% — the carriage now reads
  as rumble and joint clacks, not static.

### 9.1.5
- **Windy Forest no longer slams in — and every sound now eases in.** Three
  layers to the harsh kick-off: the forest worklet *woke at full wind* (its
  wind-speed state initialised at the mean, its internal gate ramped in 80
  ms) — it now wakes in a lull (wind state starts low and climbs over a few
  seconds, the gust detector starts settled, the gate ramps over ~0.5 s) so
  the wind arrives instead of appearing. And the mixer's fades are now
  asymmetric: fade-in lengthened from 700 ms to a 1.6 s **quadratic ease**
  (the first moments swell rather than step — this is what also soothed
  Ocean's kick-off), while fade-out stays at 700 ms so stopping remains
  responsive. Measured onset at the master bus: a smooth build over ~3 s for
  both forest and ocean, no step.

### 9.1.4
- **Ocean calmed — the gentle shores are now actually gentle.** Every variant
  played at roughly the same loudness because the WAV encode is
  peak-normalised (a calm render just got boosted back up); the output gain
  now follows the scene's intensity, so Lapping Shore plays ~3 dB under Storm
  Surf instead of matching it. The break rides **foam squared** (at low foam
  the crest folds almost soundlessly), its attack eased from 120 ms to 200 ms
  (a fold-over, not a slap), its top darkened, the surf wash scales with wave
  size, and the backwash sits lower. Measured: calm scenes now carry 3–4% of
  their energy above 800 Hz vs the storm's 12% (previously all variants were
  equally bright and equally loud). Lapping Shore and Distant Surf variant
  params also ease their foam further.

### 9.1.3
- **Cat Purr breathes like a sleeping cat, not a panting one.** The breath
  cycle ran ~2.1 s (≈28 breaths/min) — a listener entrains to a breath rate,
  and that fast reads as anxious. The default is now ~3.4 s per breath
  (measured: ≈17/min across the loop, still varying breath to breath); the
  breathing slider keeps its range, just mapped slower end to end.

### 9.1.2
- **The runtime sound sweep is now a tool, not a one-off.**
  `scripts/sweep-sounds.mjs` drives the real app headless, toggles every
  library sound, and asserts signal reaches the master bus — the end-to-end
  check that caught 9.1.1's buried Birdsong while every unit test stayed
  green. Listen windows are sized per sound (Thunder's deliberate 9–21 s
  quiet opening gets 30 s).
- **`docs/ADDING-A-SOUND.md`** — the full checklist for adding a generated
  sound: the synthesis rules the library lives by (seeded determinism,
  loop-clean structure, no fixed-frequency LFOs, resonator recurrences over
  per-sample sin·exp, stereo-with-intent), the seven wiring points and what
  breaks if each is missed, the verification recipe (numeric probes →
  spectrograms → runtime sweep), and the variant/label conventions.
  Referenced from the README tree and ARCHITECTURE.md.
- **Variant chips: every mark is distinct now.** Position bars were capped at
  three, so 4-variant sounds drew their last two chips with identical marks;
  the bar set now sizes itself to the variant count (a 4-chip set draws four
  ascending bars).

### 9.1.1
- **Bug fix: live Birdsong was near-silent — for months.** A full-library
  runtime sweep (play every sound, assert signal at the master bus) caught it:
  the worklet's output "click smoother" (`prev += 0.03·(x−prev)` per sample)
  is mathematically a one-pole lowpass at ~210 Hz, applied to the whole
  signal — and birdsong lives at 2–6 kHz, so the live sound was buried ~20 dB
  (peak 0.017 where its own WAV fallback renders 0.93; an earlier "birdsong is
  quiet" ×1.5 lift had compensated the symptom without finding this). The fix
  smooths the run/stop **gate**, not the signal, and level-matches the worklet
  to its fallback (long-run RMS 0.084 vs 0.085 at identical default params) —
  so failing over is seamless and the 0.34 default volume means the same
  loudness on either route. In-app: first call now registers at ~5 s where the
  old build showed zero signal for 25 s. Also confirmed no other worklet
  shares the pattern (fire's one-pole is its intentional roar-brightness
  filter), and Thunder's silent opening is by design (first strike held back
  9–21 s).

### 9.1.0 — Cleanup, docs & cache-correctness milestone
A maintenance release closing out the 9.0.x sound pass.
- **Bug-class fix: in-place `public/` asset updates now reach installed
  clients.** The SW build id previously hashed only the precached file
  *names*, so any stable-named asset edited in place — a re-subset icon font,
  and notably **every audio worklet** (rain, fire, thunder, birdsong, windy
  forest all shipped in-place retunes over their history) — could leave
  installed clients running old bytes. The build id now hashes every
  precached file's **contents** (`scripts/inject-precache.mjs`), and the SW
  install precaches with `cache: 'reload'` requests so a new build can't
  re-cache stale bytes out of the HTTP cache (`public/sw.js`). Verified: a
  single flipped byte in the icon font changes the build id.
- **The icon-subset process is now documented** in three places: a full
  docstring in `scripts/subset-icons.py` (what a ligature font is, when to
  re-run, the failure mode — a missing glyph renders as its raw name in text —
  and the cache-safety story), a new **"Icons: the Material Symbols subset"**
  section in this README, and a **"Fonts & icons"** section in
  `ARCHITECTURE.md`.
- **Dead code removed.** `layeringTrim` (superseded by `layerShaping`, which
  the mixer actually uses — its invariant tests now target `layerShaping`
  directly) and the never-consumed `defaultWidth` field on every `LAYER_META`
  entry (stereo width has been baked into generation since v4).
- **Docs de-drifted.** The maintenance note at the top of this README no
  longer tells you to bump the saved-mixes key for generation changes (loops
  re-render every session; bumping would discard user mixes — it's only for
  incompatible param-*meaning* changes), `DESIGN.md` no longer references the
  removed `layeringTrim`, and `ARCHITECTURE.md` documents the PWA
  cache-correctness rules above.

### 9.0.13
- **Brown Noise: character chips.** Smooth / Rolling / Deep was a depth dial;
  the set is now **Velvet** (a featureless, fully smoothed floor) ·
  **Rolling** (default) · **Storm Floor** (heavy, grainy low end). Sliders
  were already honest (depth / rumble / smoothness) and stay.

### 9.0.12
- **Pink Noise: honest labels, real characters.** "focus" is labeled
  **presence** (it brings the midrange band forward — that's all it ever
  did). Chips: **Warm Blanket** (pulled over your head) · **Soft Fall**
  (default) · **Mountain Air** (thin and bright, mids stepping forward).

### 9.0.11
- **White Noise: the shimmer came off its rails, and the labels tell the
  truth.** The air band's movement was a fixed 0.065 Hz sine — an audible
  ~15-second cycle in a sound whose whole job is to be uneventful; it's now a
  loop-closed random walk. "depth" is labeled **body** (it sets the low
  floor), "texture" is **shimmer** (it sets how much the air band moves).
  Four characters: **Warm Hush** (dark masking veil) · **Even Veil**
  (default) · **Open Air** (living, airy) · **Crisp** (bright full-range
  static).

### 9.0.10
- **Airplane chips are seats and moments.** Cabin / Cruise / Turbulent was a
  dial; the set is now **Night Flight** (the hushed rear cabin, vents leading,
  almost no rough air) · **Cruise** (default) · **Over the Wing** (the
  boundary-layer roar and engines lead) · **Light Chop** (a stretch of gentle
  rough air). The "cabin" slider is labeled **cabin hush** — it always
  controlled the ventilation bed, not the engines.

### 9.0.9
- **Train chips are journeys.** Distant Rails / Steady Carriage / Fast Express
  read as a speed dial; the set is now **Distant Line** (a railway heard
  across the fields, hardly any joint noise) · **Sleeper Car** (the default
  overnight carriage) · **Old Local** (slow, heavy, riding jointed track — the
  clackety character) · **Express** (fast and smooth). The "clatter" slider is
  labeled **rail clatter**.

### 9.0.8
- **Windy Forest chips are kinds of woods.** Light Rustle / Breezy Canopy /
  Storm in the Trees was a wind-speed ramp; the set is now **Aspen Shimmer**
  (leaves trembling in barely any wind) · **Breezy Canopy** (default) ·
  **Deep Woods** (close old-growth, branch creak and twig detail leading) ·
  **Before the Storm** (the whole forest heaving). The presets drive the live
  AudioWorklet and the WAV fallback identically.

### 9.0.7
- **Fan chips are appliances now.** The synthesis already models fan acoustics
  properly (dual airflow bands, casing resonances, blade-amplitude drift from
  a research pass), so this release replaces the Low Hum / Steady / High Speed
  intensity tiers with machines you'd actually put in a room: **Air Purifier**
  (small, smooth, nearly toneless hiss) · **Bedroom Fan** (the default) ·
  **Box Fan** (fuller drone, more hum) · **Shop Fan** (big, slow-bladed,
  room-moving air). Sliders were already concrete (speed / hum / airflow /
  fan size) and stay.

### 9.0.6
- **Wind gusts no longer run on rails.** The gusting was three fixed sine
  waves multiplied together, so the same swell pattern repeated every ~26
  seconds — exactly the kind of cycle a half-asleep ear latches onto. Gusts
  now arrive on irregular, loop-closed random walks with fast micro-flutter
  inside them. The edge-tone whistles also behave physically now: they only
  sing when the wind is actually up (gated by the gust level) and their pitch
  follows the **brightness** slider (renamed from the vague "tone"). Variants
  are places, not levels: **Night Breeze** · **Open Hillside** · **Around the
  Eaves** (whistle-led, wind heard around a building) · **Winter Gale**. The
  Evening Porch scene's wind layer now matches the Night Breeze variant
  exactly, so its editor shows the name.

### 9.0.5
- **Ocean waves now break.** The old wave was one noise band swelling and
  fading — surf with no surf. Each wave now carries the full shoreline
  anatomy: the undertow swell builds, the crest **breaks** (a brighter burst
  that rises in ~120 ms of real time as the wave folds over, then dies across
  the wash), and a low granular **backwash** rakes back down the slope before
  the next wave. The break rides the *crash & foam* slider (renamed from
  "foam"); "depth" is now labeled **undertow**, which is what it always was.
  Variants become shore scenes, calm → wild: **Lapping Shore** (small quick
  laps), **Distant Surf** (big waves heard from far up the beach), **Rolling
  Waves** and **Storm Surf**.

### 9.0.4
- **Heartbeat rebuilt with real cardiac timing — and a womb.** The old beat
  was two fixed sine blips 200 ms apart. Now S1 ("lub") opens systole and a
  softer, higher S2 ("dub") lands about a third of the cycle later, leaving
  the long diastolic rest that makes a heart read as *slow* even at the same
  BPM; each sound is a pressure thump whose pitch falls as it decays (a valve
  closing into tissue, not a note), and beat timing/weight vary a little every
  cycle. A new **blood flow** slider gates a circulatory rush to the cycle —
  raised together with the muffle it becomes the classic womb sound. Sliders:
  pace · chest depth · muffle · blood flow. Variants are characters, not
  tiers: **Falling Asleep** · **Resting** · **Against the Chest** · **Womb**.

### 9.0.3
- **Ticking Clock rebuilt around the bare click.** The feedback was blunt: the
  only passable setting was every slider at zero — i.e. the naked click. The
  wooden case "thump" was a pure sine (a marimba note, not a clock case) and
  the distance filter muddied everything above it. The case is now a *knock* —
  a 4 ms noise burst ringing a fast-damped resonance, so it thuds like wood
  instead of singing — the distance range keeps zero genuinely crisp, the
  room-tone floor is darker and quieter, and defaults pull everything back
  toward the mechanism (wood 0.45, distance 0.45, room 0.25). The character
  the feedback liked is now a chip: **Bare Tick** (90% of its loop is true
  silence). The set: Bare Tick · Mantel · Grandfather · Distant Hall, and the
  "wood" slider is labeled **wood knock**.

### 9.0.2
- **Wind Chimes: the static bed is gone.** The faint pink-noise "breeze" that
  ran under the strikes read as hiss, so it's removed outright — between gusts
  the chimes now rest in true silence (~11% of the loop measures fully
  silent). The orphaned "air" slider became **ring**: it sweeps the tubes'
  sustain from damped to long-tolling. Variants replace the 3-step intensity
  ramp with four characters: **Still Evening** (a rare dark stir), **Deep
  Tubes** (long low tolls), **On a Breeze** (the porch default) and
  **Dancing** (bright and lively).

### 9.0.1
- **Cat Purr no longer sounds mechanical.** The first cut repeated one
  identical breath for the whole loop — same length, same pitch, same weight —
  which is exactly what a machine does and a cat doesn't. Now every breath is
  drawn individually (length ±8%, pitch ±0.8 Hz, weight ±8%, exhale share ±3%,
  all summing exactly to the loop), the pitch settles ~5% as each exhale runs
  out, pulse timing jitter is wider, and a slow unsynchronised sway sits under
  everything — the cat shifting its weight, not a machine holding a level.
  Verified: breath spacing now spreads 0.76–1.37 s across the loop (was
  constant), spectrum unchanged (~97% of energy below 200 Hz).

### 9.0.0
- **Fixed the missing icons for Cat Purr / Wind Chimes / Ticking Clock on
  already-installed clients.** The 8.3.0 icon-font re-subset kept the file name
  `material-7.woff2`, and the service worker's cache version hashes the asset
  *names*, not their bytes — so installed clients kept serving the old cached
  font and the three new glyphs (paw, bell, clock) rendered as placeholder
  text. The font now ships as `material-8.woff2`, which busts the SW precache
  and any HTTP cache in one move. Starting the 9.x line here; the sound-
  quality pass that follows ships one sound per patch release.

### 8.3.0
- **Three new generated sounds: Cat Purr, Wind Chimes, Ticking Clock.** The
  Cozy family grows from one sound to four, all procedural (nothing sampled):
  - **Cat Purr** — a ~25 Hz glottal pulse train that actually breathes: a
    louder, lower exhale phase, a turnaround pause, then a softer, higher
    inhale, with the breath period snapped to a whole number of cycles per
    loop. Grains ring chest/throat resonances with eased onsets (no rasp), a
    faint breath-noise band rides the envelope, and a double lowpass keeps
    ~97% of the energy below 200 Hz. Editors: breathing / rumble / softness;
    variants Dozing · Content · Deep Rumble.
  - **Wind Chimes** — five low pentatonic tubes (A3–F#4) struck in gust-driven
    clusters, each strike ringing the first four transverse modes of a free
    tube (1 : 2.76 : 5.40 : 8.93, higher modes decaying faster) via damped-
    resonator recurrences (~10× faster than sin·exp per sample; renders in
    line with rain/ocean). A strike often swings on into a neighbouring tube;
    lulls are bridged by a forced lone soft strike so the loop never goes dead
    for ten straight seconds, and a faint decorrelated breeze bed fills the
    air between. Stereo, each tube at its own place in the field. Editors:
    breeze strength / brightness / air; variants Still Evening · On a Breeze ·
    Singing.
  - **Ticking Clock** — a pendulum clock at one beat per second (an even 32
    per loop, so the tick/tock alternation survives the seam): tick and tock
    voiced apart, a wooden case thump under each click, the escapement's tiny
    secondary contact, and a whisper of room tone. Double lowpass keeps the
    default sleep-soft. Editors: wood / distance / room tone; variants Distant
    Hall · Mantel · Close Tick.
- **Two new scenes.** *Curled Up* (a warm purr breathing under the exact
  "Light Rain" variant) and *Evening Porch* (chimes over night insects and the
  "Breeze" wind), with their own gradient art.
- All three verified NaN-free, non-clipping, level-matched against
  heartbeat/night (waveform + spectrogram probes), covered by the existing
  generator validity / variant-distinctness / determinism tests plus the
  stereo width (chimes) and centred-mono (purr, clock) assertions. Icon font
  re-subset for the paw / bell / clock glyphs. 109 unit + 15 e2e, typecheck,
  lint, build green; console clean.

### 8.2.0
- **Design/a11y polish pass.** Three fixes from a full-surface browser audit:
  the moon no longer hangs over the desktop side panel's pause button (it now
  offsets past the panel column at ≥1000px) and is `pointer-events: none`, so
  scenery can never swallow a tap; the wordmark is now the page's `<h1>` (screen
  readers previously landed on "the scenes" with no page title); and the mini
  player's expand chevron gained a visible keyboard-focus style. Audit also
  confirmed: token contrast AA-clean, reduced-motion coverage, safe-area
  insets, and focus-visible styles across all other controls.

### 8.1.0
- **Impact site verification.** Added the impact.com site-ownership proof to
  `index.html` — both their `<head>` meta tag and the literal verification text
  segment in the body (visually hidden) — so it's served in the static HTML at
  the site root for their crawler.

### 8.0.0 — Maintenance milestone
A consolidation release closing out a cleanup / documentation / refactor /
bug-fix pass. No user-facing feature changes beyond the timer fix; the codebase
is leaner, better documented, and better tested.
- **Docs.** New [`ARCHITECTURE.md`](ARCHITECTURE.md) maps the runtime (audio
  sources, master bus, masking, backgrounding & interruption handling, storage
  migrations, the PWA self-update flow, and the testing strategy). README
  project-structure tree refreshed; stray research reports moved to
  `docs/research/`.
- **Refactor.** Sleep-timer logic extracted from `App.tsx` into a self-contained,
  documented `hooks/useSleepTimer.ts` (App.tsx ~66 lines lighter).
- **Bug fix.** Extending the sleep timer during the final-90s wind-down no longer
  leaves the mix stuck quiet — the fade now derives from time-remaining
  unconditionally (`windDownFade`), covered by a unit test.
- **Cleanup.** Removed dead exports (`generators.ts` re-export block, `dsp.ts`'s
  `panMonoInto` and `SECS` export).
- **Tests.** 100 unit tests + 15 e2e green; added the wind-down fade test.

### 7.30.1
- **Cleanup: removed dead code.** Dropped `generators.ts`'s unused
  individual-generator re-export block (only `regenerateSound` is the public
  API), and `dsp.ts`'s unused `panMonoInto` helper and `SECS` export. No
  behaviour change; typecheck/lint/tests/build all green.

### 7.30.0
- **Bug fix: extending the sleep timer mid-wind-down no longer leaves the mix
  quiet.** The wind-down fade only reset to full level when the timer was
  cleared, never when a running timer was extended back *out* of the final-90s
  window — so tapping "+30m" while the mix was fading would leave it stuck at the
  faded-down level for the rest of the (extended) timer. The fade is now derived
  from the time remaining unconditionally (`windDownFade`), so extending restores
  full level. Covered by a new unit test.

### 7.29.0
- **Refactor: extracted `useSleepTimer`.** The sleep-timer countdown, wind-down
  fade, expiry, and its handlers moved out of `App.tsx` into a self-contained,
  documented `hooks/useSleepTimer.ts` (App.tsx is ~66 lines lighter). Pure
  behaviour-preserving move — the timer e2e and full suite stay green.

### 7.28.0
- **Docs & housekeeping.** Added [`ARCHITECTURE.md`](ARCHITECTURE.md) — a runtime
  map of the audio engine, master bus, backgrounding/interruption handling,
  persistence, the PWA self-update flow, and the testing strategy. Refreshed the
  README's project-structure tree (it was missing `graph.ts`, `layerMeta.ts`,
  several components, and `tests/`). Moved the two stray background research
  reports out of the repo root into `docs/research/`.

### 7.27.0
- **No more faint static after turning every sound off.** Toggling a sound off
  (or pausing) used to re-prime the background keep-alive — the near-silent
  element that holds the media session — so emptying the mix could leave its
  faint noise-floor murmur playing with no player bar. Priming is now gated to
  playback actions only, so when the last layer goes the keep-alive stops with
  it. (Background audio while a mix *is* playing is unchanged.)

### 7.26.0
- **Android: another app (or the notification pause) now actually pauses the
  mix.** On Android the media notification and audio-focus are driven by the
  keep-alive `<audio>` element, not the Web Audio graph — so when YouTube took
  focus, or the notification's pause button was tapped, the element paused but
  the worklets kept playing. The keep-alive's pause is now the cross-platform
  interruption signal: an unsolicited pause pauses the whole mix, and only an
  explicit transport action (tap, notification play) resumes it. iOS keeps its
  AudioContext-`interrupted` path as well; the two are complementary.
- **Crackling is the default fire everywhere.** The fire's default character is
  now Crackling (dry, pop-and-crackle-led over a thin roar) — in the opened
  editor, a freshly tapped Fire, Reset, the WAV fallback, and presets that don't
  tune fire. The previous steady character is still available as the **Campfire**
  variant.

### 7.25.0
- **Audio interruptions now pause for good — no self-restart.** When another app
  takes audio focus (a phone call, a video, music), the mix pauses and *stays*
  paused; it only resumes on a deliberate tap. Previously iOS would mark the
  AudioContext `interrupted` and then auto-resume it when the other app finished
  (and the looping keep-alive element would restart itself), so the sound came
  back on its own — unwanted in a sleep app. The engine now treats an
  interruption exactly like a manual pause and pushes any OS auto-resume back
  down while paused.

### 7.24.0
- **Fire — roar pulled well back everywhere.** The continuous roar/body bed is
  much quieter by default and across every fire scene (Embers, Hearth, Campfire,
  Bonfire, Wood Stove, Crackling), so the crackle and pop character leads instead
  of a steady rush. Driven by lowering `bodyVol` (roar volume) on the default,
  all variants, and the worklet's own descriptor default; measured roar energy
  drops ~60%.
- **WAV fallbacks now honor every editor control.** The procedural fallback loops
  (used when the live AudioWorklet can't load) were swept so each one responds to
  its tuning. Two were silently ignoring their params entirely — **Fire** and
  **Birdsong** — so their variants did nothing in fallback mode; both now scale
  roar/crackle/pop/hiss (fire) and call/trill/peep density, pitch and balance
  (birdsong) the same way the live sounds do. Rain's `space` control now nudges
  the fallback too. A new test asserts every variant of every editable sound
  renders distinct fallback audio, so this can't silently regress again.

### 7.23.0
- **Thunder — cracks removed entirely, now chip-only.** Thunder is now pure
  rolling rumble: the crack synthesis (click/snap/boom/tear) is gone, leaving the
  staggered low-frequency roll and its long reverb tail — soft, distant and
  sleep-safe by design. The fine-tune sliders are removed too; thunder is now
  selected purely from its scene chips. The chip set was refreshed to four
  crack-free rumble scenes ordered far → near: **Distant Rumble**, **Rolling
  Storm** (default), **Gathering Storm** and **Heavy Storm**.

### 7.22.0
- **"Fan & Rain" scene: fan volume down to 6%.** The fan now sits as a faint
  hush under the rain rather than a prominent layer.

### 7.21.0
- **Thunder — killed the constant fizz, fixed the "taser zap".** Two issues: a
  faint band-limited noise *floor* ran the whole time on every variant (a
  persistent fizz), and an overhead strike read as a single electric zap. The
  always-on floor is **removed** — between strikes the sound now falls to true
  silence (the rolling tail decays naturally), which suits sleep. And the close
  crack was rebuilt: the click and snap are lower and broader (woody crack, not a
  piercing electric snap), the granular tear is sparser and lower (distinct pops,
  not a dense buzz), and an **immediate deep boom** lands right behind the crack
  and scales with proximity — so an overhead strike is CRACK-boom, not a lone
  zap. Measured: silent floor (RMS 0), boom 1.5-3× the high-frequency snap energy,
  NaN-free / non-clipping. 71 unit + 15 e2e, typecheck, lint, build green; console clean.

### 7.20.0
- **Thunder crack made convincing.** The close-strike crack was a smooth,
  buzzy noise burst; it is now built like a real lightning snap: a
  near-instantaneous broadband **click** (the percussive leading edge), a bright
  fast **snap** right behind it, a short low **thump** for body/punch, and a
  dense **granular tear** — a scatter of tiny clicks that thins out over ~150-300
  ms (the electric rip), replacing the old flutter. Measured: a sharp onset
  (crest ~3-4) and ~8-9 distinct micro-transients in the tear (was 1-4), NaN-free
  and non-clipping even at close/max-everything. Still procedural, distant storms
  still skip the crack entirely. 71 unit + 15 e2e, typecheck, lint, build green.

### 7.19.0
- **Thunder reworked for realism (and it no longer opens with a bang).** The
  generator was rebuilt around how real thunder actually sounds: a lightning
  channel is kilometres long, so its sound arrives over several seconds and
  *rolls*. A strike is now a swarm of overlapping low-frequency **surges** spread
  across the duration (the rumble climbs, dips and climbs again) rather than one
  fading hump; a sharp, *tearing* **crack** (rapid AM) fires only when the storm
  is close, so a distant storm is pure roll with no snap; and a long sub-bass
  swell underpins it. Timing is now two-level and irregular — a drifting storm
  "activity" plus clustering, so strikes come as a quick flurry then a long lull
  instead of on a metronome. Crucially for a sleep app, the **first strike is
  held back ~9–21s and softened, and the level eases in slowly** — no startle on
  start. All still fully procedural (no samples). Measured: silent onset (peak
  ~0.002 in the first 8s), undulating multi-surge envelope, low centroid (~300 Hz
  distant), NaN-free / non-clipping across every variant. 71 unit + 15 e2e,
  typecheck, lint, build green; in-browser console clean.

### 7.18.0
- **Thunder — rolling reverb + a crack control (from the thunder research
  report, kept fully procedural).** The report's biggest realism levers were a
  reverb/echo stage and a crack-sharpness control; both are now synthesised in
  the worklet, no sample or impulse-response files (the app stays "generated, not
  borrowed"). A **rolling reverb** (two damped feedback combs per channel into an
  allpass diffuser) makes a strike bounce and bloom away; its feedback, damping
  and wet level ride on **distance**, so a far storm rolls long and dark while an
  overhead strike stays tight. A new **crack** slider sets the high-frequency
  snap — low for a soft, rounded, distant rumble (the sleep default), high for a
  sharp close clap. New variants: a soothing **Distant Rumble** (deep, far, almost
  no crack, long bloom) alongside Far Off, Rolling Storm, Overhead. Verified
  NaN-free and non-clipping across every variant incl. max-everything (Node DSP
  probe); 71 unit + 15 e2e, typecheck, lint, build green; in-browser console clean.

### 7.17.0
- **Fine-tune toggle goes full-width, with a gentle reveal.** The "fine-tune
  sliders" disclosure now stretches the full panel width like the chips and
  sliders, with its caret pushed to the right edge. Opening it eases the slider
  groups in (a slight fade + downward settle, lightly staggered) instead of
  snapping, and the button has a small press response. All stilled under
  reduced-motion.

### 7.16.0
- **Variant chips line up as a two-column grid.** The justified (`flex: auto`)
  version grew chips by an equal *amount*, so rows with different label lengths
  didn't align. They now use a uniform two-column basis
  (`flex: 1 1 calc(50% - gap)`): every full row is a clean 50/50, columns line up
  across rows, and labels stay on one line (three-up squeezed long names like
  "Storm in the Trees" onto three lines). A lone trailing chip fills its row.

### 7.15.0
- **Variant chips are justified.** The preset chips in the sound editor now grow
  to fill each wrapped line (`flex: 1 1 auto`, centred content), so the rows read
  as justified blocks instead of a ragged right edge — every line spans the full
  width. The "custom" marker stays its natural size.

### 7.14.0
- **A batch of UI fixes.**
  - **"your mixes" no longer pops in empty.** The section (and its "save this
    mix" placeholder) only renders once you actually have a saved mix, so
    starting a single sound no longer shoves the library down. Saving still
    lives in the player.
  - **Save-name focus ring no longer clipped.** The "name this mix" field is
    full-width inside the sheet's scroll area, which clips overflow, so its focus
    outline was sliced off the sides. The save row is now inset a few px to give
    the ring room.
  - **Presets show the variant they actually play.** Loading a preset/scene now
    syncs each layer's editor values to what's playing, so opening rain's editor
    during **Fan & Rain** shows **At a Window** (not a stale "Steady"). The
    Fan & Rain preset was aligned to the exact At a Window variant so it reads as
    a named variant rather than "custom".
  - **Fine-tune toggle is one width.** Its label no longer swaps between
    "fine-tune sliders" and "hide sliders" (which changed the button size); it's
    a single static label, with the rotating caret + accent state carrying open
    vs closed.

### 7.13.0
- **Hide Stream and Shower for now.** Both are pulled from the library via a new
  explicit `HIDDEN_SOUND_IDS` set in `data.ts` (cleaner than marking finished
  sounds "experimental"; the flag never reveals them). Their generators and
  editors stay intact, so any saved mix or preset referencing them still plays —
  delete an id to bring a sound back. Updated the `releasableSounds` test.

### 7.12.0
- **Cleanup pass.** A comprehensive audit (worklet params, runtime console, dead
  exports, type escapes, both worklets' numerical safety) found the codebase
  healthy; fixed the genuine inconsistencies it surfaced:
  - **Fine-tune focus ring** no longer mismatches the button — removed a stale
    `border-radius: var(--r-xs)` (6px) override left over from when the control
    was a text link, so the keyboard outline follows the button's real corner.
  - **Now-playing sheet** radius used a *spacing* token (`--sp-20`) for its
    corners; it now uses `--radius-sheet`. `.sheet-action` and `.layer-toggle`
    moved to their semantic radius roles too (no visual change).
  - Removed dead tokens (`--radius-detail`, `--radius-round`, `--r-xs` — all
    unused) and a dead feature flag (`customMixEditor`, the editor ships
    unconditionally). Updated `DESIGN.md`.
  - Verified both rain and fire worklets are NaN-free and non-clipping across
    every variant (incl. hiss/metallic at max) via Node DSP probes.

### 7.11.0
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
