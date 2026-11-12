"""Capture a reproducible, read-only benchmark of public kirvano.com pages.

Does not touch the original Softriver benchmark, the Ulls landing or portal.
This is a visual/interaction reference, NOT an implementation of Kirvano's
private app, payment processing or external forms.
"""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

import requests

ORIGIN = "https://kirvano.com"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "reference" / "kirvano"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; UllsCreatorsVisualReference/1.0)"}
ASSET_EXT = {
    ".js", ".mjs", ".css", ".woff", ".woff2", ".ttf", ".otf", ".svg", ".png",
    ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".ico", ".mp4", ".webm",
    ".json", ".lottie", ".glb", ".pdf",
}
TEXT_EXT = {".js", ".mjs", ".css"}


def get(url: str) -> tuple[bytes, str]:
    response = requests.get(url, headers=HEADERS, timeout=35, allow_redirects=True)
    response.raise_for_status()
    return response.content, response.headers.get("content-type", "")


def same_origin(url: str) -> bool:
    parsed = urlsplit(url)
    return parsed.netloc in {"kirvano.com", "www.kirvano.com"}


def asset_path(url: str) -> Path | None:
    parsed = urlsplit(urljoin(ORIGIN, url))
    if not same_origin(parsed.geturl()):
        return None
    path = unquote(parsed.path).lstrip("/")
    if not path or ".." in Path(path).parts or "${" in path or len(path) > 240:
        return None
    if Path(path).suffix.lower() not in ASSET_EXT:
        return None
    return Path(path)


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.urls: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = dict(attrs)
        for name in ("src", "href", "poster", "data-src", "data-poster"):
            if data.get(name):
                self.urls.add(data[name])
        for name in ("srcset", "data-srcset", "imagesrcset"):
            if data.get(name):
                for part in data[name].split(","):
                    self.urls.add(part.strip().split(" ")[0])


def scan_assets(text: str, base: str) -> set[str]:
    candidates: set[str] = set()
    if text.lstrip().startswith("<"):
        parser = LinkParser()
        parser.feed(text)
        candidates.update(parser.urls)
    candidates.update(re.findall(r"""url\(\s*['"]?([^)'"]+)['"]?\s*\)""", text, re.I))
    # Bundled React and CSS can reference images and fonts only as string
    # literals, and dynamic imports can name hashed JS chunks.
    candidates.update(re.findall(
        r"""(?<![A-Za-z0-9])/((?:assets|media|fonts|cf-fonts|images|img)/[A-Za-z0-9%_./~@()+,\-]+)""",
        text,
    ))
    candidates.update(re.findall(
        r"""['"](\.\.?/[^"'\s<>]+\.(?:js|mjs|css|woff2?|svg|webp|png|jpg|jpeg|mp4|webm|avif))['"]""",
        text,
        re.I,
    ))
    found = set()
    for candidate in candidates:
        if not candidate or candidate.startswith(("data:", "javascript:", "mailto:", "tel:", "#")):
            continue
        if candidate.startswith(("assets/", "media/", "fonts/", "cf-fonts/", "images/", "img/")):
            candidate = "/" + candidate
        full = urljoin(base, candidate.strip())
        if asset_path(full):
            found.add(full)
    return found


def fetch_page(route: str) -> tuple[dict, set[str]]:
    target = OUT / route.lstrip("/") / "index.html" if route != "/" else OUT / "index.html"
    try:
        if target.exists() and target.stat().st_size > 100:
            data = target.read_bytes()
        else:
            data, content_type = get(ORIGIN + route)
            if "html" not in content_type:
                raise ValueError(f"not HTML: {content_type}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        refs = scan_assets(data.decode("utf-8", errors="replace"), ORIGIN + route)
        return {
            "route": route,
            "file": str(target.relative_to(OUT)).replace("\\", "/"),
            "bytes": len(data),
        }, refs
    except Exception as exc:
        return {"route": route, "error": str(exc)}, set()


def fetch_asset(url: str) -> tuple[dict, set[str]]:
    rel = asset_path(url)
    assert rel is not None
    target = OUT / rel
    try:
        if target.exists() and target.stat().st_size > 0:
            data = target.read_bytes()
            state = "cached"
        else:
            data, ctype = get(url)
            if "text/html" in ctype and target.suffix.lower() not in {".html", ".htm"}:
                raise ValueError(f"unexpected HTML response: {ctype}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            state = "saved"
        linked = scan_assets(data.decode("utf-8", errors="replace"), url) if target.suffix.lower() in TEXT_EXT else set()
        return {
            "url": url,
            "file": str(rel).replace("\\", "/"),
            "bytes": len(data),
            "status": state,
        }, linked
    except Exception as exc:
        return {"url": url, "file": str(rel).replace("\\", "/"), "status": "failed", "error": str(exc)}, set()


def sitemap_routes() -> list[str]:
    raw, _ = get(ORIGIN + "/sitemap.xml")
    root = ET.fromstring(raw)
    routes = set()
    for el in root.iter():
        if el.tag.endswith("loc") and el.text and same_origin(el.text):
            routes.add(urlsplit(el.text).path or "/")
    return sorted(routes, key=lambda value: (value != "/", value))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    routes = sitemap_routes()
    assets: set[str] = set()
    pages: list[dict] = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        for future in as_completed([pool.submit(fetch_page, route) for route in routes]):
            page, discovered = future.result()
            pages.append(page)
            assets.update(discovered)
    pages.sort(key=lambda entry: entry["route"])
    results: dict[str, dict] = {}
    # Discover CSS URL references, import() chunks and literal Vite image paths
    # up to 3 iterations; only same-origin, known static extensions are allowed.
    for _ in range(3):
        pending = sorted(url for url in assets if asset_path(url) and str(asset_path(url)) not in results)
        if not pending:
            break
        with ThreadPoolExecutor(max_workers=8) as pool:
            for future in as_completed([pool.submit(fetch_asset, url) for url in pending]):
                record, linked = future.result()
                results[record["file"]] = record
                assets.update(linked)
    manifest = {
        "source": ORIGIN,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "benchmark_only": True,
        "pages": pages,
        "assets": sorted(results.values(), key=lambda entry: entry["file"]),
        "counts": {
            "pages": sum("file" in p for p in pages),
            "pages_failed": sum("error" in p for p in pages),
            "assets": sum(r["status"] != "failed" for r in results.values()),
            "assets_failed": sum(r["status"] == "failed" for r in results.values()),
        },
    }
    (OUT / "snapshot-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest["counts"], ensure_ascii=False))
    for record in results.values():
        if record["status"] == "failed":
            print("ASSET FAILED", record["file"], record["error"])
    for record in pages:
        if "error" in record:
            print("PAGE FAILED", record["route"], record["error"])


if __name__ == "__main__":
    main()
