"""Canonical real-image pack used by the one-click hackathon demo."""

from __future__ import annotations

from pathlib import Path


DEMO_DIR = Path(__file__).resolve().parents[1] / "assets" / "demo"

DEMO_FILES = {
    "profile": DEMO_DIR / "profile.jpg",
    "emerald": DEMO_DIR / "emerald-satin-slip-dress.jpg",
    "navy": DEMO_DIR / "navy-sleeveless-dress.jpg",
}


def _read(name: str) -> bytes:
    path = DEMO_FILES[name]
    if not path.is_file():
        raise FileNotFoundError(f"Missing canonical demo asset: {path}")
    return path.read_bytes()


def build_demo_selfie() -> bytes:
    return _read("profile")


def build_demo_garments() -> list[tuple[str, bytes]]:
    return [
        ("Emerald satin slip dress", _read("emerald")),
        ("Navy sleeveless dress", _read("navy")),
    ]


def write_demo_pack(out_dir: Path) -> dict[str, Path]:
    """Copy the canonical demo pack to a directory for local inspection."""
    out_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    for name, source in DEMO_FILES.items():
        destination = out_dir / source.name
        destination.write_bytes(_read(name))
        paths[name] = destination
    return paths
