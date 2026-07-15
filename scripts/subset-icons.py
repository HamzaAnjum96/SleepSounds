#!/usr/bin/env python3
"""Subset the Material Symbols icon font to just the icons the app uses.

Why: the full variable-instance woff2 from Google is ~510 KB; the app uses
~40 icons, so the subset is ~7 KB — and the app self-hosts it so no request
ever leaves the device for type or icons (see public/fonts.css).

How it works: Material Symbols is a *ligature* font — the markup contains the
icon's name as text (<span class="material-symbols-rounded">pets</span>) and
the font's GSUB ligature table maps that letter sequence to the glyph. This
script fetches the full font from Google Fonts, resolves each name in ICONS
through the ligature table, keeps only those glyphs (plus the letter glyphs
the ligatures need to trigger), and writes public/fonts/material-8.woff2.

When to run it — any time a new glyph name is referenced anywhere in src/:
the sound/category icon maps (src/lib/soundIcons.ts, src/lib/categoryIcons.ts)
or an inline material-symbols-rounded span. A glyph missing from the subset
renders as its raw ligature text (e.g. the word "pets"), not as tofu, so it's
easy to miss in a quick glance — check any new icon visually.

    pip install fonttools brotli
    python3 scripts/subset-icons.py

The script FAILS if any name in ICONS can't be resolved, so a typo'd glyph
name is caught here rather than shipping as text.

Cache-safety: the font keeps a stable filename, which is only safe because
the service-worker build id hashes every precached file's *bytes*
(scripts/inject-precache.mjs) and the SW installs with cache:'reload'
(public/sw.js) — so an in-place re-subset reaches installed clients on the
next deploy. (Before those two fixes, an in-place update kept serving the old
cached font — the 8.3.0 missing-icons bug; 9.0.0 shipped the rename to
material-8 as the immediate fix.) If you ever regress those, bump the
filename here and in public/fonts.css instead.
"""
import re
import urllib.request
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options

ICONS = [
    # category + sound icon maps
    "air", "apps", "cardiology", "equalizer", "flight", "forest", "graphic_eq",
    "grass", "landscape", "local_fire_department", "location_city", "mode_fan",
    "music_note", "noise_aware", "notifications", "pets", "rainy", "raven",
    "schedule", "scuba_diving", "self_care", "shower", "stream", "thunderstorm",
    "train", "water_drop", "waves",
    # inline UI glyphs
    "arrow_back", "auto_awesome", "bedtime", "bookmark_add", "close",
    "install_mobile", "ios_share", "keyboard_arrow_down", "keyboard_arrow_up",
    "drag_indicator", "play_arrow", "pause", "restart_alt", "stop", "tune",
    "volume_down",
]

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
CSS = "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20,200,1,0"


def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30).read()


def main():
    css = fetch(CSS).decode("utf-8")
    woff = re.search(r"src:\s*url\((https://[^)]+)\)", css).group(1)
    open("/tmp/material-full.woff2", "wb").write(fetch(woff))

    f = TTFont("/tmp/material-full.woff2")
    cmap = f.getBestCmap()

    # Map first-glyph -> ligature entries, to resolve each icon name -> glyph.
    lig = {}
    for lk in f["GSUB"].table.LookupList.Lookup:
        for st in lk.SubTable:
            sub = st.ExtSubTable if getattr(lk, "LookupType", 0) == 7 and hasattr(st, "ExtSubTable") else st
            if hasattr(sub, "ligatures"):
                for first, arr in sub.ligatures.items():
                    lig.setdefault(first, []).extend(arr)

    def resolve(name):
        seq = [cmap[ord(c)] for c in name]
        for lg in lig.get(seq[0], []):
            if list(lg.Component) == seq[1:]:
                return lg.LigGlyph
        return None

    keep, missing = set(), []
    for n in ICONS:
        g = resolve(n)
        keep.add(g) if g else missing.append(n)
    if missing:
        raise SystemExit(f"Could not resolve icons: {missing}")
    for n in ICONS:
        for c in n:
            keep.add(cmap[ord(c)])

    opt = Options()
    opt.flavor = "woff2"
    opt.layout_features = ["*"]
    opt.layout_closure = False
    opt.glyph_names = False
    ss = Subsetter(options=opt)
    ss.populate(glyphs=list(keep), text="".join(set("".join(ICONS))))
    ss.subset(f)
    f.save("public/fonts/material-8.woff2")
    print(f"Wrote public/fonts/material-8.woff2 with {len(ICONS)} icons")


if __name__ == "__main__":
    main()
