"""Static integrity check for the Kirvano and Softriver fidelity benchmarks.

Checks that every local image/script/font/static page referenced by exported
HTML resolves to an actual file in the built preview.
"""

from __future__ import annotations

import json
import argparse
import re
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]


class AssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.local_refs: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        for key in ("src", "poster"):
            if attributes.get(key):
                self.local_refs.append((tag, attributes[key]))
        if attributes.get("href") and tag in {"link", "a"}:
            self.local_refs.append((tag, attributes["href"]))
        if attributes.get("srcset"):
            for choice in attributes["srcset"].split(","):
                self.local_refs.append(("srcset", choice.strip().split(" ")[0]))


def local_path(url: str, tag: str, site: Path) -> Path | None:
    parsed = urlsplit(url)
    if parsed.scheme or parsed.netloc or not parsed.path.startswith("/"):
        return None
    path = unquote(parsed.path).lstrip("/")
    if not path or ".." in Path(path).parts:
        return None
    if path.startswith("cdn-cgi/l/email-protection"):
        # Cloudflare turns the obfuscated link into mailto: after page load.
        return None
    result = site / path
    if result.suffix or tag in {"img", "script", "srcset", "source", "link"}:
        return result
    return result / "index.html"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", choices=["softriver", "kirvano"], default="softriver")
    parser.add_argument(
        "--source",
        action="store_true",
        help="Check the immutable reference folder instead of dist/",
    )
    args = parser.parse_args()
    site = ROOT / "reference" / args.site if args.source else ROOT / "dist"
    if not (site / "index.html").exists():
        raise SystemExit(f"First run: python scripts/build_preview.py {args.site}")
    pages = sorted(site.rglob("*.html"))
    missing = Counter()
    references = 0
    for page in pages:
        html = page.read_text(encoding="utf-8", errors="replace")
        parser = AssetParser()
        parser.feed(html)
        refs = parser.local_refs
        refs.extend(("css", m) for m in re.findall(
            r'''url\(["']?(/(?:fonts|img|assets|media|cf-fonts)/[^)"']+)''', html
        ))
        for tag, url in refs:
            resolved = local_path(url, tag, site)
            if resolved is None:
                continue
            references += 1
            if not resolved.is_file():
                missing[(tag, urlsplit(url).path)] += 1

    result = {
        "site": args.site,
        "directory_checked": str(site),
        "pages_checked": len(pages),
        "local_references_checked": references,
        "missing_distinct": len(missing),
        "missing": [{"tag": tag, "path": path, "count": count} for ((tag, path), count) in missing.most_common(40)],
    }
    report_path = ROOT / "reference" / args.site / "integrity-report.json"
    report_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if missing:
        sys.exit(1)


if __name__ == "__main__":
    main()
