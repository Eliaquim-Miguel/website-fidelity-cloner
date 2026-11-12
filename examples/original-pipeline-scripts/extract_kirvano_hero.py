"""Split the immutable Kirvano HeroShell markup into its four exact children.

This does not rewrite header.html, the manifest, or the outer wrapper.  Each
fragment retains the original DOM strings exactly, including SVGs and styles.

Usage:
    py -B scripts/extract_kirvano_hero.py --inspect
    py -B scripts/extract_kirvano_hero.py --write
"""

from __future__ import annotations

import argparse
from pathlib import Path

from extract_kirvano_sections import OffsetParser, OUTPUT, sha256


HEADER = OUTPUT / "header.html"
PARTS = (
    ("hero-announcement.html", "div"),
    ("hero-navigation.html", "header"),
    ("hero-main.html", "div"),
    ("hero-fade.html", "div"),
)


def split_header() -> tuple[list[tuple[str, str]], str, str, str]:
    source = HEADER.read_text(encoding="utf-8")
    parser = OffsetParser(source)
    parser.feed(source)
    parser.close()
    if parser.stack or len(parser.roots) != 1:
        raise ValueError("Expected exactly one complete HeroShell wrapper")
    root = parser.roots[0]
    if root.tag != "div" or root.attr("class") != "relative pt-[128px] md:pt-[136px]":
        raise ValueError("HeroShell wrapper changed since DOM audit")
    if len(root.children) != len(PARTS):
        raise ValueError(f"Expected four HeroShell children; found {len(root.children)}")
    fragments = []
    for (filename, expected_tag), child in zip(PARTS, root.children):
        if child.tag != expected_tag:
            raise ValueError(f"Unexpected <{child.tag}> for {filename}; expected <{expected_tag}>")
        value = source[child.start:child.end]
        if not value:
            raise ValueError(f"Empty HeroShell fragment: {filename}")
        fragments.append((filename, value))
    original_inner = source[root.open_end:root.close_start]
    reconstructed = "".join(part for _, part in fragments)
    if reconstructed != original_inner:
        raise ValueError("HeroShell children do not exactly reproduce the wrapper contents")
    return fragments, sha256(original_inner), source[root.start:root.open_end], source[root.close_start:root.end]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inspect", action="store_true", help="Show verified split without writing")
    ap.add_argument("--write", action="store_true", help="Save four exact child fragments")
    args = ap.parse_args()
    if not args.inspect and not args.write:
        ap.error("Choose --inspect or --write")
    fragments, digest, opening, closing = split_header()
    print(f"HeroShell opening: {opening}")
    print(f"HeroShell closing: {closing}")
    for filename, markup in fragments:
        print(f"{filename:29} {len(markup):>6} chars; sha256={sha256(markup)}")
    print(f"Exact four-piece concatenation SHA-256: {digest}")
    if args.write:
        for filename, value in fragments:
            path = OUTPUT / filename
            if path.exists() and path.read_text(encoding="utf-8") != value:
                raise FileExistsError(f"Refusing to overwrite modified fragment: {path}")
        for filename, value in fragments:
            path = OUTPUT / filename
            if not path.exists():
                with path.open("w", encoding="utf-8", newline="") as f:
                    f.write(value)
        print("Four original HeroShell children saved; header.html and manifest.json unchanged")


if __name__ == "__main__":
    main()
