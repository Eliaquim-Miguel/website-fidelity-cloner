"""Bootstrap a source-editable React/Vite app from the included template.

This does NOT claim full pixel fidelity on its own. Feed it sections previously
extracted from authorized SSR and CSS/assets captured by the user.

Example:
python scripts/bootstrap_react.py --output ./work/example-react \
    --sections ./work/example/sections \
    --css ./reference/example/assets/styles.css \
    --public ./reference/example
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = SKILL_ROOT / "templates" / "react-vite"
MEDIA_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".ico", ".svg",
    ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp4", ".webm", ".ogg",
}


def ensure_file(path: Path, what: str) -> Path:
    if not path.exists():
        raise SystemExit(f"{what} not found: {path}")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="New app directory; must not exist")
    parser.add_argument("--sections", type=Path, help="SSR section HTML files and manifest.json")
    parser.add_argument("--css", type=Path, help="Captured public reference CSS to use as baseline")
    parser.add_argument("--public", type=Path, help="Optional reference root with authorized images/fonts/media (scripts and HTML excluded)")
    args = parser.parse_args()

    destination = args.output.resolve()
    if destination.exists():
        parser.error(f"Output exists, will not overwrite: {destination}")
    ensure_file(TEMPLATE / "package.json", "React/Vite template")
    if args.sections:
        ensure_file(args.sections / "manifest.json", "Sections manifest")
    if args.css:
        ensure_file(args.css, "Reference CSS")
    if args.public:
        ensure_file(args.public, "Public media directory")
    # Copy ONLY after verifying inputs to avoid half-created destinations.
    shutil.copytree(TEMPLATE, destination)
    if args.sections:
        target = destination / "src" / "sections"
        shutil.rmtree(target)
        shutil.copytree(args.sections, target)
    if args.css:
        shutil.copy2(args.css, destination / "src" / "styles" / "reference.css")
    if args.public:
        public = destination / "public"
        public.mkdir(parents=True, exist_ok=True)
        copied = 0
        for item in args.public.rglob("*"):
            if not item.is_file() or item.suffix.lower() not in MEDIA_EXTENSIONS:
                continue
            relative = item.relative_to(args.public)
            target = public / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)
            copied += 1
        print(f"Copied {copied} media/font resources; excluded JS, HTML, and runtime files.")
    print(f"Editable source created: {destination}")
    print("Next steps:")
    print(f"  cd {destination}")
    print("  npm install")
    print("  npm run check && npm run build")
    print("  npm run dev")
    print("Then reconstruct interactions in src/behavior and QA the clone.")


if __name__ == "__main__":
    main()
