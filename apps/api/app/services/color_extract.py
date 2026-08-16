from __future__ import annotations

from collections import Counter
import colorsys
from pathlib import Path
from typing import Any

from PIL import Image


def _rgb_to_hex(r: int, g: int, b: int) -> str:
    return f"#{r:02x}{g:02x}{b:02x}"


def _hue_family(r: int, g: int, b: int) -> str:
    rf, gf, bf = r / 255, g / 255, b / 255
    hue, sat, value = colorsys.rgb_to_hsv(rf, gf, bf)
    if sat < 0.12:
        if value > 0.86:
            return "white"
        if value > 0.62:
            return "cream"
        if value > 0.34:
            return "gray"
        if value > 0.16:
            return "charcoal"
        return "black"
    degrees = hue * 360
    if degrees < 12 or degrees >= 348:
        return "red"
    if degrees < 42:
        return "orange"
    if degrees < 68:
        return "yellow"
    if degrees < 160:
        return "green"
    if degrees < 205:
        return "teal"
    if degrees < 255:
        return "navy" if value < 0.48 else "blue"
    if degrees < 300:
        return "purple"
    return "pink"


def _is_warm_family(family: str) -> bool:
    return family in {"red", "orange", "yellow", "cream", "pink", "olive"}


def _is_cool_family(family: str) -> bool:
    return family in {"blue", "navy", "purple", "teal", "gray", "charcoal", "pink"}


def extract_garment_colors(image_path: Path, max_colors: int = 5) -> dict[str, Any]:
    img = Image.open(image_path).convert("RGB")
    # Center-weighted sample with a conservative background rejection pass.
    # Product screenshots often have a white border/background that otherwise
    # overwhelms the actual garment color.
    w, h = img.size
    crop = img.crop((int(w * 0.12), int(h * 0.08), int(w * 0.88), int(h * 0.92)))
    small = crop.resize((64, 64), Image.Resampling.LANCZOS)
    pixels = list(small.getdata())

    edge = []
    for x in range(64):
        edge.extend([pixels[x], pixels[-64 + x]])
    for y in range(64):
        edge.extend([pixels[y * 64], pixels[y * 64 + 63]])
    bg_r = sum(p[0] for p in edge) / max(1, len(edge))
    bg_g = sum(p[1] for p in edge) / max(1, len(edge))
    bg_b = sum(p[2] for p in edge) / max(1, len(edge))
    edge_is_light = min(bg_r, bg_g, bg_b) > 195

    def keep(pixel: tuple[int, int, int]) -> bool:
        r, g, b = pixel
        if edge_is_light and min(r, g, b) > 205 and max(r, g, b) - min(r, g, b) < 35:
            return False
        distance = abs(r - bg_r) + abs(g - bg_g) + abs(b - bg_b)
        return distance > 24 or not edge_is_light

    garment_pixels = [p for p in pixels if keep(p)]
    if len(garment_pixels) < 96:
        garment_pixels = pixels

    # quantize lightly
    quantized = [((r // 24) * 24, (g // 24) * 24, (b // 24) * 24) for r, g, b in garment_pixels]
    counts = Counter(quantized)
    top = counts.most_common(max_colors)
    total = sum(c for _, c in top) or 1
    dominant = []
    for (r, g, b), c in top:
        dominant.append(
            {
                "hex": _rgb_to_hex(r, g, b),
                "rgb": [r, g, b],
                "share": round(c / total, 3),
                "family": _hue_family(r, g, b),
            }
        )
    primary = dominant[0] if dominant else {"hex": "#888888", "rgb": [136, 136, 136], "family": "gray", "share": 1.0}
    # A product page background is often the numerically dominant colour. When
    # a meaningful amount of a real coloured/dark garment is present, prefer
    # that garment signal over an off-white studio backdrop.
    background_families = {"white", "cream", "gray"}
    garment_like = [
        item
        for item in dominant
        if item["family"] not in background_families
        or max(item["rgb"]) < 95
    ]
    garment_coverage = sum(float(item["share"]) for item in garment_like)
    if primary["family"] in background_families and garment_like and garment_coverage >= 0.16:
        primary = max(garment_like, key=lambda item: item["share"])
    r, g, b = primary["rgb"]
    sat = (max(r, g, b) - min(r, g, b)) / (max(r, g, b) + 1e-6)
    value = max(r, g, b) / 255.0
    family = primary["family"]
    return {
        "dominant": dominant,
        "primary_hex": primary["hex"],
        "primary_family": family,
        "secondary_family": dominant[1]["family"] if len(dominant) > 1 else family,
        "color_confidence": round(min(1.0, max(0.0, max(primary["share"], garment_coverage) * (len(garment_pixels) / len(pixels)))), 3),
        "background_removed": len(garment_pixels) != len(pixels),
        "saturation": round(float(sat), 3),
        "value": round(float(value), 3),
        "warm_lean": _is_warm_family(family),
        "cool_lean": _is_cool_family(family),
    }
