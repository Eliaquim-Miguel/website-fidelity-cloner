"""Create a reproducible local reference snapshot of the public Softriver site.

The reference is kept separate from the Ulls Creators application so that the
existing landing and portal remain available during visual comparison.
"""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

import requests


ORIGIN = "https://www.softriver.co"
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "reference" / "softriver"
USER_AGENT = "Mozilla/5.0 (compatible; UllsCreatorsReferenceSnapshot/1.0)"


def get_url(url: str) -> tuple[bytes, str]:
    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=35)
    response.raise_for_status()
    return response.content, response.headers.get("content-type", "")


def local_asset_path(url: str) -> Path | None:
    parsed = urlsplit(urljoin(ORIGIN, url))
    if parsed.netloc not in {"www.softriver.co", "softriver.co"}:
        return None
    path = unquote(parsed.path).lstrip("/")
    if not path or ".." in Path(path).parts or "${" in path or path.endswith(")"):
        return None
    allowed_suffixes = {".js", ".css", ".svg", ".png", ".jpeg", ".jpg", ".webp", ".woff", ".woff2", ".ico", ".mp4", ".webm", ".avif"}
    if path.startswith("cdn-cgi/l/email-protection"):
        return None
    if Path(path).suffix.lower() in allowed_suffixes:
        return Path(path)
    return None


def scan_urls(text: str) -> set[str]:
    values = set()
    values.update(re.findall(r'''(?:src|href|poster|data-src|content)=["']([^"']+)["']''', text, re.I))
    values.update(re.findall(r'''url\(\s*["']?([^\)'"\s]+)["']?\s*\)''', text, re.I))
    values.update(re.findall(r'''(?:/img/|/fonts/|/media/|/assets/)[A-Za-z0-9_./%+@~\-]+''', text))
    for srcset in re.findall(r'''(?:srcset|data-srcset)=["']([^"']+)["']''', text, re.I):
        for part in srcset.split(","):
            values.add(part.strip().split(" ")[0])
    return {urljoin(ORIGIN, value) for value in values if value and not value.startswith(("data:", "#", "javascript:", "mailto:", "tel:"))}


def download_asset(url: str) -> dict:
    relative = local_asset_path(url)
    if relative is None:
        return {"url": url, "status": "skipped"}
    path = OUTPUT / relative
    try:
        if path.exists() and path.stat().st_size > 0:
            return {"url": url, "file": str(relative).replace("\\", "/"), "bytes": path.stat().st_size, "status": "cached"}
        data, content_type = get_url(url)
        if "text/html" in content_type and path.suffix.lower() not in {".html", ".htm"}:
            raise ValueError("unexpected HTML response")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return {"url": url, "file": str(relative).replace("\\", "/"), "bytes": len(data), "status": "saved"}
    except Exception as exc:
        return {"url": url, "file": str(relative).replace("\\", "/"), "status": "failed", "error": str(exc)}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    home, _ = get_url(ORIGIN + "/")
    home_text = home.decode("utf-8", errors="replace")
    (OUTPUT / "index.html").write_bytes(home)

    discovered = scan_urls(home_text)
    # The published sitemap includes the complete archive of articles, case
    # studies and institutional pages, including pages not linked on the home.
    sitemap, _ = get_url(ORIGIN + "/sitemap.xml")
    sitemap_root = ET.fromstring(sitemap)
    sitemap_routes = {
        urlsplit(el.text).path for el in sitemap_root.iter()
        if el.tag.endswith("loc") and el.text
        and urlsplit(el.text).netloc in {"www.softriver.co", "softriver.co"}
    }
    # White-label funnels link to this valid extra route, omitted from sitemap.
    internal_pages = sorted((sitemap_routes | {"/book-a-call-or-email"}) - {"", "/"})
    pages = [{"path": "/", "file": "index.html", "bytes": len(home)}]
    def download_page(route: str) -> tuple[dict, set[str]]:
        try:
            target = OUTPUT / route.lstrip("/") / "index.html"
            if target.exists() and target.stat().st_size > 0:
                data = target.read_bytes()
                content_type = "text/html"
            else:
                data, content_type = get_url(ORIGIN + route)
            if "text/html" not in content_type:
                return {"path": route, "error": "not HTML"}, set()
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                target.write_bytes(data)
            return {"path": route, "file": str(target.relative_to(OUTPUT)).replace("\\", "/"), "bytes": len(data)}, scan_urls(data.decode("utf-8", errors="replace"))
        except Exception as exc:
            return {"path": route, "error": str(exc)}, set()

    with ThreadPoolExecutor(max_workers=10) as pool:
        for future in as_completed([pool.submit(download_page, route) for route in internal_pages]):
            page, links = future.result()
            pages.append(page)
            discovered.update(links)
    pages.sort(key=lambda item: item["path"])

    static_urls = {url for url in discovered if local_asset_path(url)}
    # Load external-JS dependency literals, too; the scripts carry image names
    # used by galleries after the first click/scroll.
    javascript_urls = {url for url in static_urls if urlsplit(url).path.endswith(".js")}
    for url in sorted(javascript_urls):
        try:
            data, _ = get_url(url)
            discovered.update(scan_urls(data.decode("utf-8", errors="replace")))
        except requests.RequestException:
            pass
    # Image URLs composed at runtime have no literal extension in the HTML:
    # featured projects append -s.webp/.webp, while category tabs use slugs.
    showcase_match = re.search(r'id="showcase-data">(.*?)</script>', home_text, re.S)
    if showcase_match:
        for project in json.loads(showcase_match.group(1)):
            for base in project.get("img", []):
                discovered.add(urljoin(ORIGIN, base + ".webp"))
                discovered.add(urljoin(ORIGIN, base + "-s.webp"))
    site_script = OUTPUT / "site.js"
    if site_script.exists():
        script = site_script.read_text(encoding="utf-8")
        work_match = re.search(r'const WORK\s*=\s*\{(.*?)\n\s*\};', script, re.S)
        if work_match:
            for slug in re.findall(r"\[['\"]([^'\"]+)['\"]\s*,\s*['\"]", work_match.group(1)):
                discovered.add(ORIGIN + "/img/work/" + slug + ".webp")
                discovered.add(ORIGIN + "/img/work/" + slug + "-s.webp")
    static_urls = {url for url in discovered if local_asset_path(url)}
    assets = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        for future in as_completed([pool.submit(download_asset, url) for url in sorted(static_urls)]):
            assets.append(future.result())
    assets.sort(key=lambda item: item.get("file", item["url"]))

    manifest = {
        "source": ORIGIN,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "description": "Exact public HTML, CSS, scripts, images and fonts used only as a fidelity benchmark",
        "pages": pages,
        "assets": assets,
        "counts": {
            "pages": len([item for item in pages if "file" in item]),
            "assets_saved": len([item for item in assets if item["status"] in {"saved", "cached"}]),
            "assets_failed": len([item for item in assets if item["status"] == "failed"]),
        },
    }
    (OUTPUT / "snapshot-manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(manifest["counts"], ensure_ascii=False))
    for item in assets:
        if item["status"] == "failed":
            print("FAILED", item["url"], item["error"])


if __name__ == "__main__":
    main()
