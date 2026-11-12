#!/usr/bin/env python3
"""Losslessly split a public SSR HTML document into direct-root child fragments.

No framework, package installation, asset downloads, HTML reserialization or
hard-coded section counts. Offsets refer to the *original decoded HTML string*;
all whitespace, SVG paths, entities and original attribute casing survive.

Examples:
  python scripts/split_ssr.py --html reference/index.html --inspect
  python scripts/split_ssr.py --html reference/index.html --out /tmp/ssr-parts --write
  python scripts/split_ssr.py --html reference/index.html --root '#app' --inspect

See --help for root-selection and overwrite constraints.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path


VOID_TAGS = frozenset(
    "area base br col embed hr img input link meta param source track wbr".split()
)
EXCLUDED_BODY_CHILDREN = frozenset(
    "script style noscript link meta iframe template".split()
)


def sha256(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


@dataclass(eq=False)
class Node:
    tag: str
    attrs: dict[str, str]
    start: int
    opening_end: int
    close_start: int = -1
    end: int = -1
    parent: "Node | None" = None
    children: list["Node"] = field(default_factory=list)


class OffsetParser(HTMLParser):
    """HTMLParser for structural discovery; original slices always win."""

    def __init__(self, source: str):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.line_starts = [0, *(match.end() for match in re.finditer(r"\n", source))]
        self.stack: list[Node] = []
        self.roots: list[Node] = []

    def at(self) -> int:
        line, column = self.getpos()
        return self.line_starts[line - 1] + column

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        start = self.at()
        raw = self.get_starttag_text()
        if not raw:
            raise ValueError(f"Cannot locate original opening tag near character {start}")
        node = Node(
            tag=tag,
            attrs={key.lower(): (value or "") for key, value in attrs},
            start=start,
            opening_end=start + len(raw),
            parent=self.stack[-1] if self.stack else None,
        )
        if node.parent:
            node.parent.children.append(node)
        else:
            self.roots.append(node)
        if tag in VOID_TAGS or raw.rstrip().endswith("/>"):
            node.close_start = node.opening_end
            node.end = node.opening_end
        else:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        location = self.at()
        if not self.stack:
            raise ValueError(f"Unexpected closing </{tag}> at character {location}")
        node = self.stack[-1]
        if node.tag != tag:
            raise ValueError(
                f"Unbalanced HTML near {location}: expected </{node.tag}>, "
                f"got </{tag}>. Use a well-formed SSR document, never guess offsets."
            )
        match = re.match(r"</\s*" + re.escape(tag) + r"\s*>", self.source[location:], re.I)
        if not match:
            raise ValueError(f"Cannot locate closing </{tag}> at character {location}")
        node.close_start = location
        node.end = location + len(match.group(0))
        self.stack.pop()


def all_nodes(nodes: list[Node]):
    for node in nodes:
        yield node
        yield from all_nodes(node.children)


def find_root(parser: OffsetParser, selector: str | None) -> tuple[Node, str]:
    nodes = list(all_nodes(parser.roots))
    if selector:
        if selector == "body":
            selected = [node for node in nodes if node.tag == "body"]
        elif selector.startswith("#"):
            selected = [node for node in nodes if node.attrs.get("id") == selector[1:]]
        elif selector.startswith("."):
            selected = [node for node in nodes if selector[1:] in node.attrs.get("class", "").split()]
        elif re.fullmatch(r"[A-Za-z][A-Za-z0-9-]*", selector):
            selected = [node for node in nodes if node.tag == selector.lower()]
        else:
            raise ValueError("--root supports only body, #id, .class, or tag (no CSS combinators)")
        if len(selected) != 1:
            raise ValueError(f"--root {selector!r} matches {len(selected)} nodes; expected exactly one")
        return selected[0], "explicit"

    body = next((node for node in nodes if node.tag == "body"), None)
    if body is None:
        if len(parser.roots) == 1:
            return parser.roots[0], "single fragment root"
        raise ValueError("No <body> and no unique fragment root; specify --root")

    candidates = [node for node in body.children if node.tag not in EXCLUDED_BODY_CHILDREN]
    for id_value in ("root", "app", "__next", "__nuxt", "svelte", "___gatsby"):
        matched = [node for node in candidates if node.attrs.get("id") == id_value]
        if len(matched) == 1:
            return matched[0], f"auto: #{id_value}"
    if len(candidates) == 1:
        return candidates[0], "auto: single non-script body child"
    # Multiple unrelated top-level nodes: split body itself rather than
    # guessing which one is the app and silently dropping its siblings.
    return body, "auto: body (multiple direct elements)"


def build_plan(source: str, root: Node, source_path: Path, selection: str):
    if root.close_start < root.opening_end or root.end < root.close_start:
        raise ValueError("Selected root is not a fully closed container element")

    inner = source[root.opening_end:root.close_start]
    cursor = root.opening_end
    parts: list[tuple[str, str, dict]] = []

    for index, child in enumerate(root.children, start=1):
        if child.start < cursor or child.end > root.close_start or child.end < child.start:
            raise ValueError(f"Invalid or overlapping child offsets at index {index}")
        slug = re.sub(r"[^a-z0-9_-]+", "-", child.attrs.get("id", "").lower())[:36].strip("-")
        filename = f"{index:03d}-{child.tag}{('-' + slug) if slug else ''}.html"
        fragment = source[cursor:child.end]
        parts.append((filename, fragment, {
            "index": index,
            "tag": child.tag,
            "id": child.attrs.get("id") or None,
            "prefix_characters": child.start - cursor,
            "element_start": child.start,
            "element_end": child.end,
            "fragment_start": cursor,
            "fragment_end": child.end,
        }))
        cursor = child.end

    # Attach the trailing whitespace/comments to the final child fragment.
    # Thus one output fragment always corresponds to one direct child.
    trailing = source[cursor:root.close_start]
    if parts:
        filename, content, record = parts[-1]
        parts[-1] = (
            filename, content + trailing,
            {**record, "trailing_characters": len(trailing), "fragment_end": root.close_start},
        )
    else:
        parts.append(("000-root-content.html", inner, {
            "index": 0, "tag": "#text", "id": None, "prefix_characters": 0,
            "element_start": None, "element_end": None,
            "fragment_start": root.opening_end, "fragment_end": root.close_start,
            "trailing_characters": len(inner),
        }))

    joined = "".join(content for _, content, _ in parts)
    if joined != inner or sha256(joined) != sha256(inner):
        raise ValueError("LOSSLESS VERIFICATION FAILED: fragment assembly differs from SSR root")

    records = []
    output_files = {}
    for filename, content, extra in parts:
        relative = f"fragments/{filename}"
        output_files[relative] = content
        records.append({"file": relative, **extra, "characters": len(content), "sha256": sha256(content)})

    manifest = {
        "schema": "website-fidelity-cloner.split-ssr/v1",
        "source": str(source_path.resolve()),
        "source_sha256": sha256(source),
        "selection": selection,
        "root": {
            "tag": root.tag,
            "id": root.attrs.get("id") or None,
            "opening_tag": source[root.start:root.opening_end],
            "closing_tag": source[root.close_start:root.end],
            "start": root.start,
            "end": root.end,
            "inner_characters": len(inner),
            "inner_sha256": sha256(inner),
        },
        "direct_child_count": len(root.children),
        "fragment_count": len(parts),
        "render_order": [rec["file"] for rec in records],
        "fragments": records,
        "integrity": {
            "reassembled_sha256": sha256(joined),
            "exact_original_inner": True,
            "serialized_html": False,
            "extra_wrappers": 0,
            "no_hardcoded_section_count": True,
        },
        "reconstruction": (
            "root.opening_tag + ''.join(read(file) for file in render_order) "
            "+ root.closing_tag reproduces the exact original root element"
        ),
    }
    output_files["manifest.json"] = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    return output_files, manifest


def safe_write(out: Path, files: dict[str, str], source: Path) -> tuple[int, int]:
    target_files = {out / relative: value for relative, value in files.items()}
    for target, value in target_files.items():
        if target.resolve() == source.resolve():
            raise FileExistsError("Output would overwrite the original SSR HTML")
        if target.exists():
            if not target.is_file():
                raise FileExistsError(f"Target is not a regular file: {target}")
            with target.open("r", encoding="utf-8", newline="") as stream:
                old = stream.read()
            if old != value:
                raise FileExistsError(
                    f"Refusing to overwrite modified output: {target}. "
                    "Use a fresh --out directory; no files have been modified."
                )

    created: list[Path] = []
    try:
        out.mkdir(parents=True, exist_ok=True)
        for target, value in target_files.items():
            if target.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("x", encoding="utf-8", newline="") as stream:
                created.append(target)
                stream.write(value)
    except BaseException:
        for target in reversed(created):
            target.unlink(missing_ok=True)
        raise
    return len(created), len(target_files) - len(created)


def main() -> int:
    p = argparse.ArgumentParser(
        description="Losslessly split SSR HTML into direct-root children, with a SHA-256 proof.",
        epilog=(
            "Constraints: UTF-8 HTML must have balanced explicit closing tags. "
            "The script never downloads assets, reserializes HTML, adds wrappers, "
            "overwrites changed files, or executes embedded scripts. "
            "Use --root body to split all direct <body> children."
        ),
    )
    p.add_argument("--html", type=Path, required=True, help="Source HTML file (read only)")
    p.add_argument("--out", type=Path, help="Directory for manifest.json and fragments/ (required for --write)")
    p.add_argument("--root", help="Optional simple selector: body, #id, .class or tag; otherwise auto")
    p.add_argument("--encoding", default="utf-8", help="Text encoding (default UTF-8)")
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument("--inspect", action="store_true", help="Show fragment plan and hashes without writing")
    mode.add_argument("--write", action="store_true", help="Verify every target before creating files")
    args = p.parse_args()

    if args.write and not args.out:
        p.error("--out is required with --write")
    try:
        with args.html.open("r", encoding=args.encoding, newline="") as stream:
            source = stream.read()
        parsed = OffsetParser(source)
        parsed.feed(source)
        parsed.close()
        if parsed.stack:
            raise ValueError("Unclosed elements: " + ", ".join(node.tag for node in parsed.stack[-6:]))
        root, selection = find_root(parsed, args.root)
        files, manifest = build_plan(source, root, args.html, selection)
        report = {
            "source": str(args.html), "root": root.tag,
            "root_id": root.attrs.get("id") or None,
            "selection": selection, "direct_children": manifest["direct_child_count"],
            "fragments": manifest["fragment_count"],
            "inner_chars": manifest["root"]["inner_characters"],
            "inner_sha256": manifest["root"]["inner_sha256"],
            "lossless": manifest["integrity"]["exact_original_inner"],
        }
        if args.write:
            created, reused = safe_write(args.out, files, args.html)
            report.update({"output": str(args.out), "created": created, "reused_identical": reused})
        print(json.dumps(report, ensure_ascii=False, indent=2))
        if args.inspect:
            for record in manifest["fragments"]:
                print(f"  {record['file']}  {record['characters']:>8} chars  sha256={record['sha256']}")
        return 0
    except (OSError, UnicodeError, ValueError, FileExistsError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
