"""Build a portable Agent Skill ZIP with POSIX paths and no runtime artifacts.

Usage: python scripts/build_zip.py --output path/to/website-fidelity-cloner.zip
Output must not already exist; no input files are modified.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {"node_modules", "__pycache__", ".git", ".venv", "dist", "reference", "snapshots"}
SKIP_SUFFIXES = {".pyc", ".pyo", ".har", ".zip"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists():
        parser.error(f"Archive already exists; refusing overwrite: {output}")
    if ROOT in output.parents:
        parser.error("Archive must be created outside the skill folder")
    files = sorted(
        (p for p in ROOT.rglob("*")
         if p.is_file()
         and not any(segment in SKIP_DIRS for segment in p.relative_to(ROOT).parts)
         and p.suffix.lower() not in SKIP_SUFFIXES),
        key=lambda p: p.relative_to(ROOT).as_posix(),
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for file in files:
            archive.write(file, arcname=file.relative_to(ROOT).as_posix())
    with ZipFile(output) as archive:
        names = set(archive.namelist())
        for needed in ("SKILL.md", "README.md", "references/WORKFLOW.md",
                       "scripts/capture_public.py", "scripts/qa_playwright.mjs"):
            if needed not in names:
                raise RuntimeError(f"ZIP incomplete: missing {needed}")
        if any("\\" in name for name in names):
            raise RuntimeError("ZIP must use forward slashes for cross-platform portability")
    print(f"ZIP ready: {output}; files={len(files)}; size={output.stat().st_size} bytes")


if __name__ == "__main__":
    main()
