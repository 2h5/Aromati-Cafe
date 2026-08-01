"""Optimize Aromati enhanced photos for web delivery.
Reads originals, writes web-ready JPEGs to assets/web/ with semantic names.
Never touches originals."""
from PIL import Image
from pathlib import Path

SRC = Path(r"Z:\cs lock\aromati cafe\assets")
OUT = SRC / "web"
OUT.mkdir(exist_ok=True)

# semantic name -> source file
MAP = {
    # interiors
    "hero-dining":      "o (18)-enhanced.png",
    "dining-wide":      "o (20)-enhanced.png",
    "dining-detail":    "91958238-1-enhanced.png",
    "dining-corner":    "o (5)-enhanced.png",
    "golden-hour":      "Screenshot 2026-07-30 165447-enhanced.png",
    "storefront":       "Screenshot 2026-07-30 165604-enhanced.png",
    "storefront-exterior": "aromati-storefront-exterior-enhanced.png",
    # dishes
    "adjaruli":         "o (17)-enhanced.png",
    "imeruli":          "o (8)-enhanced.png",
    "khinkali":         "o (13)-enhanced.png",
    "pkhali-board":     "o (7)-enhanced.png",
    "badrijani":        "o (9)-enhanced.png",
    "shoti-ajika":      "o (6)-enhanced.png",
    "tolma":            "o (16)-enhanced.png",
    "georgian-salad":   "o (14)-enhanced.png",
    "chirbuli":         "o (19)-enhanced.png",
    "strawberry-salad": "o (21)-enhanced.png",
    "honey-cake":       "o (4)-enhanced.png",
    "pistachio-toast":  "o (12)-enhanced.png",
    "dumplings":        "o (11)-enhanced.png",
    # coffee
    "maple-latte":      "Screenshot 2026-07-30 165313-enhanced.png",
    "tiramisu-latte":   "Screenshot 2026-07-30 165334-enhanced.png",
    "matcha-trio":      "Screenshot 2026-07-30 165350-enhanced.png",
    "latte-art":        "Screenshot 2026-07-30 165529-enhanced.png",
    "cappuccino":       "Screenshot 2026-07-30 165519-enhanced.png",
    "iced-latte-cup":   "o (10)-enhanced.png",
    # wine
    "saperavi-bag":     "Screenshot 2026-07-30 165259-enhanced.png",
    "wine-board":       "Screenshot 2026-07-30 165507-enhanced.png",
    "wine-cabinet":     "Screenshot 2026-07-30 165539-enhanced.png",
}

MAX_DIM = 2048
for name, src in MAP.items():
    p = SRC / src
    if not p.exists():
        print(f"MISSING {src}")
        continue
    im = Image.open(p).convert("RGB")
    w, h = im.size
    scale = min(1.0, MAX_DIM / max(w, h))
    if scale < 1.0:
        im = im.resize((round(w*scale), round(h*scale)), Image.LANCZOS)
    out = OUT / f"{name}.jpg"
    im.save(out, "JPEG", quality=86, optimize=True, progressive=True)
    print(f"{name}.jpg  {im.size[0]}x{im.size[1]}  {out.stat().st_size//1024} KB")
print("DONE")
