#!/usr/bin/env python3
"""
Turn the big source art in assets/ into web-sized files in assets/web/.

Sources stay untouched; everything the site actually loads is generated here.
Re-run after dropping a new source in:  python tools/build-assets.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets"
OUT = SRC / "web"
GALLERY_SRC = Path(r"C:\Users\jeffe\Desktop\TempCopying")


def save(im, name, width=None, quality=82, fmt="webp"):
    im = im.copy()
    if width and im.width > width:
        h = round(im.height * width / im.width)
        im = im.resize((width, h), Image.LANCZOS)
    path = OUT / f"{name}.{fmt}"
    path.parent.mkdir(parents=True, exist_ok=True)
    if fmt == "png":
        im.save(path, optimize=True)
    else:
        im.convert("RGB").save(path, quality=quality, method=6)
    kb = path.stat().st_size / 1024
    print(f"  {path.relative_to(ROOT)}  {im.width}x{im.height}  {kb:.0f} KB")
    return path


def flatten(im, bg=(232, 85, 29)):
    """Composite RGBA onto a solid colour so WebP stays small and predictable."""
    if im.mode != "RGBA":
        return im.convert("RGB")
    plate = Image.new("RGB", im.size, bg)
    plate.paste(im, mask=im.split()[3])
    return plate


print("canvas art")
# The ultrawide is the hub panel's backdrop: sparse left, dense skyline right.
save(flatten(Image.open(SRC / "ultrawideNoLogo45.png")), "canvas-wide", 2400)
save(flatten(Image.open(SRC / "ultrawideNoLogo45.png")), "canvas-wide-sm", 1200)
# The mega + 16:9 crops back the section dividers and the about page.
save(flatten(Image.open(SRC / "MegaNOlogo.png")), "canvas-mega", 1800)
save(flatten(Image.open(SRC / "Big 16-9 nologo.png")), "canvas-169", 1800)

print("brand")
logo = Image.open(SRC / "DNFLogoTransparent.png")
save(logo, "logo", 512, fmt="png")
save(logo, "logo-sm", 128, fmt="png")
# Favicon: the logo squared down, transparent kept.
ico = logo.copy()
ico.thumbnail((180, 180), Image.LANCZOS)
sq = Image.new("RGBA", (180, 180), (0, 0, 0, 0))
sq.paste(ico, ((180 - ico.width) // 2, (180 - ico.height) // 2))
sq.save(OUT / "icon.png", optimize=True)
sq.resize((32, 32), Image.LANCZOS).save(ROOT / "favicon.ico", sizes=[(32, 32)])
print("  favicon.ico")

print("sims portraits")
# 3314070_312: the loading card sits inset in a navy field — crop to the card.
loading = Image.open(SRC / "3314070_312.jpg").convert("RGB")
save(loading.crop((654, 252, 1907, 1190)), "sims-loading", 1000, quality=86)
# IMG_9551: Jeff + Jones, photographed off a screen. Trim the soft edges.
jones = Image.open(SRC / "IMG_9551.jpg").convert("RGB")
w, h = jones.size
save(jones.crop((int(w * 0.02), int(h * 0.03), int(w * 0.98), int(h * 0.97))),
     "jones", 900, quality=86)

print("hod gallery")
GALLERY = [
    ("browse", "Example7.png"),
    ("inspect", "Example9.png"),
    ("graph", "Example1.png"),
    ("characters", "Example2.png"),
    ("household", "Example3.png"),
    ("sim", "Example4.png"),
    ("sim-stats", "Example5.png"),
    ("object", "Example6.png"),
    ("lot", "Example8.png"),
]
for name, fname in GALLERY:
    src = GALLERY_SRC / fname
    if not src.exists():
        print(f"  ! missing {src} — skipped")
        continue
    im = Image.open(src).convert("RGB")
    save(im, f"hod/{name}", 1400, quality=80)
    save(im, f"hod/{name}-thumb", 560, quality=74)

print("done")
