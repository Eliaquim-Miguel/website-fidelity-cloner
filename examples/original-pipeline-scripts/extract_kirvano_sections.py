"""Inspect and split the preserved Kirvano SSR landing without rewriting its tags.

The source is treated as immutable.  HTML fragments are copied from original
character offsets, so SVG paths, React-style attribute casing, whitespace,
entities, classes and inline styles survive byte-for-byte.

Usage:
    py scripts/extract_kirvano_sections.py --inspect
    py scripts/extract_kirvano_sections.py --write
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "reference" / "kirvano" / "index.html"
OUTPUT = ROOT / "ulls-landing" / "src" / "sections"
VOID_TAGS = frozenset("area base br col embed hr img input link meta param source track wbr".split())


@dataclass(eq=False)
class Element:
    tag: str
    attrs: list[tuple[str, str | None]]
    start: int
    open_end: int
    end: int = -1
    close_start: int = -1
    parent: Element | None = None
    children: list[Element] = field(default_factory=list)

    def attr(self, key: str) -> str:
        return next((v or "" for k, v in self.attrs if k.lower() == key.lower()), "")

    def walk(self):
        yield self
        for child in self.children:
            yield from child.walk()


class OffsetParser(HTMLParser):
    def __init__(self, source: str):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.lines = [0] + [m.end() for m in re.finditer("\n", source)]
        self.stack: list[Element] = []
        self.roots: list[Element] = []

    def here(self) -> int:
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag, attrs):
        start = self.here()
        head = self.get_starttag_text()
        node = Element(tag=tag, attrs=attrs, start=start, open_end=start + len(head))
        if self.stack:
            node.parent = self.stack[-1]
            node.parent.children.append(node)
        else:
            self.roots.append(node)
        if tag in VOID_TAGS or head.rstrip().endswith("/>"):
            node.close_start = node.open_end
            node.end = node.open_end
        else:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        end_start = self.here()
        end = self.source.find(">", end_start) + 1
        if end <= end_start:
            raise ValueError(f"Unterminated closing {tag} at {end_start}")
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i].tag == tag:
                node = self.stack[i]
                node.close_start = end_start
                node.end = end
                del self.stack[i:]
                return
        raise ValueError(f"Unpaired </{tag}> at {end_start}")


def parse(source: str) -> Element:
    p = OffsetParser(source)
    p.feed(source)
    p.close()
    if p.stack:
        raise ValueError("Open elements: " + ", ".join(x.tag for x in p.stack))
    return next(x for x in p.roots if x.tag == "html")


def preview(source: str, n: Element) -> str:
    tag = source[n.start:n.open_end]
    return tag[:210] + ("..." if len(tag) > 210 else "")


def inspect(source: str, doc: Element):
    body = next(x for x in doc.children if x.tag == "body")
    print(f"HTML characters: {len(source)}, document elements: {sum(1 for _ in doc.walk())}")
    print("BODY CHILDREN")
    for i, n in enumerate(body.children):
        print(f"  {i:02d} {n.tag:9} {n.start:7}-{n.end:7} {preview(source, n)}")
    sections = [n for n in body.walk() if n.tag == "section"]
    print(f"SECTION TAGS: {len(sections)}")
    for i, n in enumerate(sections, 1):
        headings = [x for x in n.walk() if x.tag in {"h1", "h2", "h3"}]
        h = re.sub(r"<[^>]*>", " ", source[headings[0].open_end:headings[0].close_start]) if headings else ""
        h = re.sub(r"\s+", " ", h).strip()[:100]
        print(f"  {i:02d} id={n.attr('id')!r} {n.start:7}-{n.end:7} bytes={n.end-n.start:6} class={n.attr('class')[:95]!r} heading={h!r}")
        for p in [n.parent, n.parent.parent if n.parent else None]:
            if p:
                print(f"     parent {p.tag} id={p.attr('id')!r} class={p.attr('class')[:110]!r} children={len(p.children)}")
    print("STRUCTURAL NODES")
    root = next((x for x in body.children if x.tag == "div"), None)
    if root:
        for i, n in enumerate(root.children):
            print(f"  root {i:02d} {n.tag} {n.start}-{n.end} class={n.attr('class')[:130]!r} children={len(n.children)}")
            for j, ch in enumerate(n.children):
                print(f"    {j:02d} {ch.tag:7} {ch.start:7}-{ch.end:7} id={ch.attr('id')!r} class={ch.attr('class')[:95]!r} children={len(ch.children)}")
                if ch.tag == "div" and ch.children and j < 5:
                    for k, gc in enumerate(ch.children[:12]):
                        print(f"        {k:02d} {gc.tag:7} {gc.start:7}-{gc.end:7} id={gc.attr('id')!r} class={gc.attr('class')[:95]!r}")


# These names describe the order of the 13 actual <section> elements.  They
# correspond one-to-one with the original DOM rather than invented wrappers.
SECTION_NAMES = (
    ("01-parceiro.html", "parceiro-da-marca"),
    ("02-escalar.html", "plataforma-para-escalar"),
    ("03-pagamentos.html", "meios-de-pagamento"),
    ("04-recursos.html", "recursos-gratuitos"),
    ("05-integracoes.html", "integracoes-marquee"),
    ("06-checkout.html", "checkout"),
    ("07-planos.html", "planos-e-taxas"),
    ("08-contato.html", "condicoes-personalizadas"),
    ("09-depoimentos.html", "historias-de-clientes"),
    ("10-manifesto.html", "manifesto-da-marca"),
    ("11-imprensa.html", "kirvano-na-midia"),
    ("12-summit.html", "influent-summit"),
    ("13-faq.html", "perguntas-frequentes"),
)


def sha256(fragment: str) -> str:
    return hashlib.sha256(fragment.encode("utf-8")).hexdigest()


def heading(source: str, node: Element) -> str:
    first = next((el for el in node.walk() if el.tag in {"h1", "h2", "h3"}), None)
    if not first:
        return ""
    inner = source[first.open_end:first.close_start]
    value = html.unescape(re.sub(r"<[^>]*>", " ", inner))
    return re.sub(r"\s+", " ", value).strip()


def metadata(source: str, node: Element, *, filename: str, name: str, role: str,
             original_indices: list[int], prefix_dividers: int = 0) -> dict:
    """Keep source offsets for audit; no new markup attributes are injected."""
    return {
        "filename": filename,
        "section_name": name,
        "id": node.attr("id"),
        "original_class": node.attr("class"),
        "element_tag": node.tag,
        "role": role,
        "heading": heading(source, node),
        "root_child_indices": original_indices,
        "preceding_separator_elements": prefix_dividers,
        "original_element_start": node.start,
        "original_element_end": node.end,
    }


def extraction(source: str, doc: Element):
    body = next(x for x in doc.children if x.tag == "body")
    root_candidates = [x for x in body.children if x.tag == "div"]
    if len(root_candidates) != 1:
        raise ValueError("Expected exactly one SSR app root in <body>")
    root = root_candidates[0]
    children = root.children
    sections = [x for x in root.walk() if x.tag == "section"]
    if len(sections) != 13 or len(children) != 20:
        raise ValueError(f"Reference drift: expected 13 sections / 20 children; got {len(sections)} / {len(children)}")
    if not (children[0].tag == "div" and children[1].tag == "div" and children[-1].tag == "footer"):
        raise ValueError("SSR app root no longer matches the inspected widget/hero/footer sequence")
    if any(x.tag in {"script", "noscript"} for x in root.walk()):
        raise ValueError("App markup includes a script or noscript; inspect before exporting")
    if not root.attr("class").startswith("relative w-full bg-[#111111]"):
        raise ValueError("Source wrapper changed; inspect geometry before exporting")

    rendered_parts: list[str] = []
    records: list[dict] = []
    section_records: list[dict] = []

    def append(filename: str, markup: str, record: dict):
        if re.search(r"<\s*(?:script|noscript)\b|\$_TSR|\$tsr-stream-barrier", markup, re.I):
            raise ValueError(f"Unexpected injected analytics/TSR markup inside {filename}")
        record.update({
            "characters": len(markup),
            "bytes": len(markup.encode("utf-8")),
            "sha256": sha256(markup),
        })
        rendered_parts.append(markup)
        records.append(record)
        if record["role"] == "section":
            section_records.append(record.copy())
        return filename, markup

    files: list[tuple[str, str]] = []
    files.append(append(
        "overlays.html", source[children[0].start:children[0].end],
        metadata(source, children[0], filename="overlays.html", name="ajuda-e-overlay",
                 role="overlays", original_indices=[0]),
    ))
    # Exact HeroShell contains ribbon, <header>, full hero and its fade.
    files.append(append(
        "header.html", source[children[1].start:children[1].end],
        metadata(source, children[1], filename="header.html", name="hero-shell-e-navegacao",
                 role="hero-shell", original_indices=[1]),
    ))

    pending: list[tuple[int, Element]] = []
    position = 0
    for index, child in enumerate(children[2:-1], start=2):
        if child.tag == "div":
            pending.append((index, child))
            continue
        if child.tag != "section":
            raise ValueError(f"Unexpected element {child.tag} at root child {index}")
        if position >= len(SECTION_NAMES) or child is not sections[position]:
            raise ValueError(f"Section ordering changed at root child {index}")
        filename, name = SECTION_NAMES[position]
        included = [x[0] for x in pending] + [index]
        start = pending[0][1].start if pending else child.start
        # Section 6/9/10/11 each include their exact preceding separator div.
        markup = source[start:child.end]
        files.append(append(
            filename, markup,
            metadata(source, child, filename=filename, name=name, role="section",
                     original_indices=included, prefix_dividers=len(pending)),
        ))
        pending = []
        position += 1

    if position != 13 or pending:
        raise ValueError(f"Unconsumed section markup: {position} sections, {len(pending)} separators")
    files.append(append(
        "footer.html", source[children[-1].start:children[-1].end],
        metadata(source, children[-1], filename="footer.html", name="rodape",
                 role="footer", original_indices=[len(children) - 1]),
    ))

    # Strict proof of coverage: every character of all 20 root children is
    # consumed once, including four visual divider nodes, with no wrappers.
    root_inner = source[root.open_end:root.close_start]
    joined = "".join(rendered_parts)
    if root_inner != joined:
        mismatch = next((i for i, (a, b) in enumerate(zip(root_inner, joined)) if a != b), None)
        raise ValueError(f"Markup coverage failed at char {mismatch}; original={len(root_inner)} output={len(joined)}")
    if sum(r["preceding_separator_elements"] for r in section_records) != 4:
        raise ValueError("Expected exactly four unwrapped section separator divs")

    manifest = {
        "source": "reference/kirvano/index.html",
        "source_sha256": sha256(source),
        "root": {
            "tag": root.tag,
            "original_class": root.attr("class"),
            "id": root.attr("id"),
            "opening_tag": source[root.start:root.open_end],
            "closing_tag": source[root.close_start:root.end],
        },
        # App.tsx imports manifest.entries and passes entry.file to Markup.
        # Keep complete section metadata in components/sections below for QA.
        "entries": [
            {
                "file": r["filename"],
                "name": r["section_name"],
                "id": r["id"] or None,
                "original_class": r["original_class"],
                "tag": r["element_tag"],
                "role": r["role"],
                "root_child_indices": r["root_child_indices"],
            }
            for r in records
        ],
        "render_order": [r["filename"] for r in records],
        "components": records,
        "sections": section_records,
        "integrity": {
            "section_count": len(section_records),
            "root_child_count": len(children),
            "separator_count": 4,
            "fragment_count": len(files),
            "source_root_inner_characters": len(root_inner),
            "assembled_root_inner_sha256": sha256(joined),
            "source_root_inner_sha256": sha256(root_inner),
            "markup_identical_to_source": True,
            "scripts_or_analytics_exported": False,
            "note": "Place files inside root.opening_tag / root.closing_tag in render_order. header.html is full HeroShell including ribbon, nav and hero. Section files 06/09/10/11 include their preceding sibling dividers, preserving DOM order without adding wrappers.",
        },
    }
    return files, manifest


def write_markup(source: str, doc: Element) -> None:
    files, manifest = extraction(source, doc)
    files.append(("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    # Do not overwrite a file another agent has touched. Re-running is safe
    # when bytes already agree with this immutable source snapshot.
    for name, value in files:
        target = OUTPUT / name
        if target.exists() and target.read_text(encoding="utf-8") != value:
            # Permit the one-time migration from our previous manifest format
            # (same content, except it had no App.tsx-compatible entries list).
            if name == "manifest.json":
                old = json.loads(target.read_text(encoding="utf-8"))
                before_entries = dict(manifest)
                before_entries.pop("entries")
                if old == before_entries:
                    continue
            raise FileExistsError(f"Refusing to overwrite changed file: {target}")
    for name, value in files:
        target = OUTPUT / name
        if not target.exists() or (name == "manifest.json" and target.read_text(encoding="utf-8") != value):
            with target.open("w", encoding="utf-8", newline="") as handle:
                handle.write(value)
        print(f"{name:27} {len(value.encode('utf-8')):>7} bytes")
    print(f"Verified {len(manifest['sections'])} exact SSR sections, {manifest['integrity']['separator_count']} separators, root sha256={manifest['integrity']['source_root_inner_sha256']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inspect", action="store_true", help="Print structural inventory; no writes")
    ap.add_argument("--write", action="store_true", help="Extract verified markup/manifest")
    args = ap.parse_args()
    if not args.inspect and not args.write:
        ap.error("Choose --inspect or --write")
    source = SOURCE.read_text(encoding="utf-8")
    doc = parse(source)
    if args.inspect:
        inspect(source, doc)
    if args.write:
        write_markup(source, doc)


if __name__ == "__main__":
    main()
