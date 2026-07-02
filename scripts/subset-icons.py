#!/usr/bin/env python3
"""Subset the Material Symbols icon font to just the icons the app uses.

The full variable-instance woff2 from Google is ~510 KB; the app uses ~40
icons, so the subset is ~7 KB. Run this whenever the ICONS list below changes
(i.e. you reference a new `material-symbols-rounded` glyph in the UI):

    pip install fonttools brotli
    python3 scripts/subset-icons.py

It fetches the full font from Google Fonts, keeps only the named icons (and the
letters their ligatures need), and writes public/fonts/material-7.woff2.
Keep ICONS in sync with the glyph names used across src/ (the icon maps in
src/lib/*Icons.ts and the inline material-symbols-rounded spans).
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
    "play_arrow", "pause", "restart_alt", "stop", "tune", "volume_down",
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
    f.save("public/fonts/material-7.woff2")
    print(f"Wrote public/fonts/material-7.woff2 with {len(ICONS)} icons")


if __name__ == "__main__":
    main()
