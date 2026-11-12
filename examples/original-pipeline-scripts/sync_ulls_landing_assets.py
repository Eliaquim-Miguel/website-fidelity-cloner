"""Sync the immutable Kirvano benchmark's static art into Ulls editable source.

Usage: python scripts/sync_ulls_landing_assets.py

Only fonts, imagery, icons, and video are copied, never the old compiled React
runtime or the benchmark HTML. The editable app owns its own components/JS.
"""

from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "reference" / "kirvano"
APP = ROOT / "ulls-landing"
EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".svg", ".ico",
    ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".webm",
}


def main() -> None:
    destination = APP / "public"
    destination.mkdir(parents=True, exist_ok=True)
    count = 0
    for file in REFERENCE.rglob("*"):
        if not file.is_file() or file.suffix.lower() not in EXTENSIONS:
            continue
        relative = file.relative_to(REFERENCE)
        if relative.parts[0] in {"qa", "assets", "en", "es", "terms"}:
            continue
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, target)
        count += 1
    style_dir = APP / "src" / "styles"
    style_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(
        REFERENCE / "assets" / "styles-pjxMGTba.css",
        style_dir / "reference.css",
    )
    shutil.copy2(
        REFERENCE / "fonts" / "google-fonts.css",
        style_dir / "google-fonts.css",
    )
    print(f"Synced {count} media/font files and original CSS into {APP}")


if __name__ == "__main__":
    main()
