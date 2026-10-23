# Contributing

How to make a change to starlight without breaking something quiet. These
rules apply to everyone — human or AI. For how the app works, read
[ARCHITECTURE.md](ARCHITECTURE.md); for how it should look and feel,
[DESIGN.md](DESIGN.md) and [PRODUCT.md](PRODUCT.md).

## The rules, in short

1. **Every change bumps the version** in `package.json` and adds an entry to
   [CHANGELOG.md](CHANGELOG.md) saying what changed and *why*.
2. **Don't touch the saved-mixes storage key** unless a kept parameter changes
   meaning — see [Saved mixes and storage](#saved-mixes-and-storage).
3. **A new icon glyph must be added to the icon subset**, or it renders as a
   word — see [Icons](#icons-the-material-symbols-subset).
4. **A new sound or headline feature must reach the discoverability
   surfaces** — see [Discoverability](#discoverability-seo-social-cards-and-ai-readers).
5. **UI changes must pass the accessibility gate** (`tests/e2e/a11y.spec.ts`
   fails on any serious or critical axe-core violation).
6. **Prove a fix by reproducing the failure first**, and leave a test behind
   that fails without it. Most bugs in this app are silent — a sound that
   plays when it shouldn't, a save that didn't happen — so "it looks fine" is
   not evidence.

## Before you push

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

`test:e2e` builds the app and serves the production output, so the service
worker and offline paths are exercised. In environments with a pre-installed
Chromium under `/opt/pw-browsers` (and blocked browser downloads), the
Playwright config and the scripts fall back to it automatically.

Sound changes also deserve `node scripts/sweep-sounds.mjs` against a running
dev server — the only check that drives every sound end to end through
worklet loading and the media-element routing. Adding a sound has its own
checklist: [docs/ADDING-A-SOUND.md](docs/ADDING-A-SOUND.md).

## Versioning and the changelog

`package.json` is the single source of the version; it renders in the app's
footer and is compared against the service worker's to detect an update. The
working convention: a patch bump for each push to a working branch, a minor
bump for each push to `main`, a major bump for milestones.

Changelog entries go at the top of the **starlight** section of
CHANGELOG.md. Say what changed, why it mattered to someone using the app, and
how you know it works (what you measured, which test now guards it). Below
the starlight section is the legacy *drift away* history: its version numbers
overlap the current ones, so name the era when you refer to an old release.

## Saved mixes and storage

Saved mixes store only *parameter state* — never audio, since loops re-render
fresh every session — and `src/storage/migrations.ts` drops unknown sound ids
and unknown-shaped data safely. So retuning a sound, renaming a parameter or
adding one never needs a storage change.

Bump the saved-mixes key in `src/storage/keys.ts` (`STORAGE_KEYS.savedMixes`,
e.g. `-v2` → `-v3`) **only** if a kept parameter key changes *meaning*
incompatibly (same key, different effect). Bumping discards every user's saved
mixes, so prefer a migration.

Every storage write is best-effort (private browsing, an exhausted quota), and
a write the user is told about must report failure rather than swallow it —
see `saveSavedMixes`.

## Icons: the Material Symbols subset

The UI's icons are Google's **Material Symbols Rounded**, self-hosted as a
~7 KB subset (`public/fonts/material-8.woff2`) of the ~510 KB full font, so
icons work offline and no request leaves the device. It's a *ligature* font:
markup contains the icon's name as text (`<span
class="material-symbols-rounded">pets</span>`) and the font maps that letter
sequence to the glyph.

**Whenever you reference a new glyph name anywhere in `src/`** — the icon maps
in `src/lib/soundIcons.ts` / `src/lib/categoryIcons.ts`, or an inline
`material-symbols-rounded` span — add it to the `ICONS` list in
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
which must be kept in sync by hand when the sound count or a headline feature
changes:

- **`index.html`** — the meta description, the Open Graph / Twitter card tags
  (absolute URLs; WhatsApp requires them), and one JSON-LD
  `schema.org/WebApplication` block (keep it to exactly one entity).
- **`public/og-starlight.jpg`** — the 1200×630 social preview, generated from
  the app's own ingredients (starfield, moon, Cormorant wordmark) by
  `scripts/og-card/render-og-card.mjs`; re-run it rather than editing the JPEG.
- **`public/robots.txt` + `public/sitemap.xml`** — everyone welcome, AI
  crawlers included; the sitemap lists the app and the privacy page.
- **`public/llms.txt`** — a plain-text summary for AI agents (per the llms.txt
  convention): what the app is, the feature list, key facts, doc links.
- **`README.md`** — the feature list and the sound count.

## Privacy

starlight makes no network requests of its own after install, has no
analytics, and keeps everything on the device. Keep it that way: no
third-party scripts, fonts or APIs. If what the app stores changes, update
both `public/privacy.html` (the in-app page) and its mirror `PRIVACY.md`.
