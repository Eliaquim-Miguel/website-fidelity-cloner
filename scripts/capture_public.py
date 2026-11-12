#!/usr/bin/env python3
"""Capture public, same-origin SSR pages and static assets for an offline audit.

No browser execution, cookies, credentials, login, CAPTCHAs, tracking calls,
cross-origin fetching, or access-control workarounds. Third-party assets are
reported but never downloaded. HTML scripts are made inert for safe inspection.

Examples:
  python scripts/capture_public.py --url https://example.org --output ./reference/example
  python scripts/capture_public.py --url http://127.0.0.1:4319/ --output ./temp-snapshot --allow-localhost --max-pages 1

Requires Python 3.9+; uses only the standard library.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import html.parser
import ipaddress
import json
from pathlib import Path
import re
import socket
import sys
import threading
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.robotparser import RobotFileParser
from xml.etree import ElementTree


USER_AGENT = "WebsiteFidelityCloner/1.0 (public-static-audit; no tracking)"
ASSET_EXTENSIONS = frozenset({
    ".css", ".js", ".mjs", ".cjs", ".json", ".svg", ".png", ".apng",
    ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".bmp",
    ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp4", ".webm",
    ".mov", ".mp3", ".wav", ".ogg", ".pdf", ".txt", ".wasm", ".webmanifest",
})
TRACKER = re.compile(
    r"(?:^|[./_-])(?:analytics|gtm|googletagmanager|google-analytics|"
    r"doubleclick|pixel|fbevents|facebook\.net|clarity|hotjar|segment|"
    r"mixpanel|amplitude|funnelytics|newrelic|sentry|intercom|"
    r"tracker|tracking|beacon|hyros|stape|gtag)(?:[./_?=&-]|$)", re.I,
)
SENSITIVE_PATH = re.compile(r"(?:^|/)(?:admin|account|login|signin|signup|logout|"
                            r"checkout|cart|api|auth|oauth|wp-admin|private|"
                            r"customer|customers|user|users)(?:/|$)", re.I)
SENSITIVE_QUERY = re.compile(r"(?:^|[&;])(?:access_token|auth|authorization|api_key|"
                             r"client_secret|session|sessionid|jwt|password|"
                             r"token|secret|signature|sig|code)=", re.I)
CSS_URL = re.compile(r"url\(\s*(?:['\"])?([^'\")\s]+)(?:['\"])?\s*\)", re.I)
CSS_IMPORT = re.compile(r"@import\s+(?:url\()?\s*['\"]([^'\"]+)['\"]", re.I)
JS_LITERAL = re.compile(r"(?P<q>['\"`])(?P<url>(?:/|\.\.?/|https?://)[^'\"`\s{}<>]{1,300})(?P=q)")
HTML_SCRIPT = re.compile(r"<script\b([^>]*)>", re.I)
TRACKER_NOSCRIPT = re.compile(r"<noscript\b[^>]*>.*?</noscript>", re.I | re.S)
TRACKER_IFRAME = re.compile(r"<iframe\b[^>]*>", re.I)
MAX_REDIRECTS = 5


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def origin_of(url: str) -> str:
    p = urlsplit(url)
    if p.scheme not in ("http", "https") or not p.hostname or p.username or p.password:
        raise ValueError("Only unauthenticated absolute http(s) URLs are allowed")
    if p.port is not None and not (1 <= p.port <= 65535):
        raise ValueError("Invalid port")
    port = p.port or (443 if p.scheme == "https" else 80)
    return f"{p.scheme}://{p.hostname.lower()}:{port}"


def canonical(url: str, base: str | None = None) -> str | None:
    try:
        p = urlsplit(urljoin(base, url) if base else url)
        if p.scheme not in ("http", "https") or not p.hostname or p.username or p.password:
            return None
        if p.port is not None and not (1 <= p.port <= 65535):
            return None
        return urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path or "/", p.query, ""))
    except ValueError:
        return None


def safe_host(host: str, *, allow_localhost: bool = False) -> bool:
    if host.lower() in ("localhost", "127.0.0.1", "::1"):
        return allow_localhost
    try:
        addresses = [ipaddress.ip_address(x[4][0]) for x in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)]
    except (socket.gaierror, ValueError, OSError):
        return False
    # Do not follow private/internal/reserved endpoints, even if a public name
    # unexpectedly resolves there. Explicit localhost is for local QA only.
    return bool(addresses) and all(addr.is_global for addr in addresses)


def safe_relative(url: str, *, page: bool) -> Path:
    p = urlsplit(url)
    components = p.path.split("/")
    pieces = []
    for raw in components:
        if not raw:
            continue
        part = unquote(raw)
        if part in (".", "..") or not part or any(c in part for c in "\\/\x00:<>\"|?*"):
            raise ValueError("Unsafe URL path segment")
        if any(ord(c) < 32 for c in part) or part.endswith((".", " ")):
            raise ValueError("Unsupported filesystem path segment")
        # Windows reserved device names are rejected instead of being renamed.
        if re.match(r"^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)", part, re.I):
            raise ValueError("Reserved Windows path segment")
        pieces.append(part)
    if page:
        if not pieces:
            pieces = ["index.html"]
        elif not pieces[-1].lower().endswith((".html", ".htm")):
            pieces.append("index.html")
    elif not pieces:
        raise ValueError("Asset URL has no file path")
    return Path(*pieces)


def local_target(root: Path, relative: Path) -> Path:
    target = (root / relative).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError("URL escaped output directory")
    return target


def is_asset_url(url: str) -> bool:
    return Path(urlsplit(url).path.lower()).suffix in ASSET_EXTENSIONS


def is_tracker(url: str) -> bool:
    p = urlsplit(url)
    return bool(TRACKER.search((p.hostname or "") + p.path))


def is_sensitive(url: str) -> bool:
    p = urlsplit(url)
    return bool(SENSITIVE_PATH.search(p.path) or SENSITIVE_QUERY.search(p.query))


class StrictRedirect(HTTPRedirectHandler):
    def __init__(self, origin: str, allow_localhost: bool):
        self.origin, self.allow_localhost = origin, allow_localhost
        super().__init__()

    def redirect_request(self, request, fp, code, msg, headers, newurl):
        url = canonical(newurl)
        if not url or origin_of(url) != self.origin or is_tracker(url) or is_sensitive(url):
            raise ValueError("Blocked redirect outside allowed public scope")
        if not safe_host(urlsplit(url).hostname or "", allow_localhost=self.allow_localhost):
            raise ValueError("Redirect resolves to blocked network address")
        if len(getattr(request, "redirect_dict", {})) >= MAX_REDIRECTS:
            raise ValueError("Too many redirects")
        return super().redirect_request(request, fp, code, msg, headers, newurl)


class Fetcher:
    def __init__(self, origin: str, *, timeout: float, max_bytes: int, allow_localhost: bool):
        self.origin, self.timeout, self.max_bytes = origin, timeout, max_bytes
        self.allow_localhost = allow_localhost
        self.local = threading.local()

    def get(self, url: str) -> dict:
        try:
            if origin_of(url) != self.origin or is_tracker(url) or is_sensitive(url):
                raise ValueError("URL outside allowed public same-origin scope")
            if not safe_host(urlsplit(url).hostname or "", allow_localhost=self.allow_localhost):
                raise ValueError("Blocked private or invalid network address")
            if not hasattr(self.local, "opener"):
                self.local.opener = build_opener(StrictRedirect(self.origin, self.allow_localhost))
            req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html, text/css, application/javascript, image/*, */*;q=.7"})
            with self.local.opener.open(req, timeout=self.timeout) as response:
                final = canonical(response.geturl())
                if not final or origin_of(final) != self.origin:
                    raise ValueError("Redirect target escaped same origin")
                expected = response.headers.get("Content-Length")
                if expected and int(expected) > self.max_bytes:
                    raise ValueError(f"Resource larger than --max-bytes ({expected})")
                data = response.read(self.max_bytes + 1)
                if len(data) > self.max_bytes:
                    raise ValueError(f"Resource larger than --max-bytes ({len(data)})")
                return {"ok": True, "status": response.status, "url": final, "body": data,
                        "content_type": response.headers.get_content_type(),
                        "encoding": response.headers.get_content_charset() or "utf-8"}
        except HTTPError as e:
            return {"ok": False, "status": e.code, "url": url, "error": f"HTTP {e.code}; no bypass attempted"}
        except (URLError, OSError, ValueError, TimeoutError, OverflowError) as e:
            return {"ok": False, "status": None, "url": url, "error": str(e)[:240]}


def strip_active_scripts(html: str) -> str:
    # Preserve source text/SSR DOM geometry while preventing any bundled JS,
    # analytics or hydration from executing when HTML is opened locally.
    def disable(match: re.Match) -> str:
        return '<script type="application/x-fidelity-inert"' + match.group(1) + '>'
    html = HTML_SCRIPT.sub(disable, html)
    html = TRACKER_NOSCRIPT.sub(lambda m: "" if TRACKER.search(m.group(0)) else m.group(0), html)
    html = TRACKER_IFRAME.sub(lambda m: "" if TRACKER.search(m.group(0)) else m.group(0), html)
    return html


class HTMLLinks(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.references: list[tuple[str, str]] = []
        self.inline_css: list[str] = []
        self.inline_js: list[str] = []
        self.context = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        a = dict(attrs)
        if tag in ("style", "script"):
            self.context = tag
        for key in ("src", "href", "poster", "data-src"):
            if a.get(key):
                kind = "page" if tag == "a" and key == "href" else "asset"
                if tag == "link" and key == "href" and a.get("rel"):
                    # Canonical/alternate/prev/next document links are pages.
                    rel = a.get("rel") or ""
                    kind = "page" if re.search(r"\b(?:canonical|alternate|next|prev)\b", rel) else "asset"
                self.references.append((a[key], kind))
        for key in ("srcset", "data-srcset"):
            if a.get(key):
                for candidate in a[key].split(","):
                    u = candidate.strip().split(" ")[0]
                    if u:
                        self.references.append((u, "asset"))
        if a.get("style"):
            self.inline_css.append(a["style"])
        if tag == "meta" and a.get("content") and a.get("property", "").lower() in ("og:image", "og:video", "og:audio"):
            self.references.append((a["content"], "asset"))

    def handle_endtag(self, tag: str):
        if tag == self.context:
            self.context = None

    def handle_data(self, data: str):
        if self.context == "style":
            self.inline_css.append(data)
        elif self.context == "script":
            self.inline_js.append(data)


def discover_css(text: str) -> list[tuple[str, str]]:
    return [(m.group(1), "asset") for m in CSS_URL.finditer(text)] + [
        (m.group(1), "asset") for m in CSS_IMPORT.finditer(text)
    ]


def discover_js(text: str) -> list[tuple[str, str]]:
    return [(u, "asset") for m in JS_LITERAL.finditer(text)
            if (u := m.group("url")) and is_asset_url(u)]


def discover_html(text: str) -> list[tuple[str, str]]:
    parser = HTMLLinks()
    parser.feed(text)
    urls = list(parser.references)
    for style in parser.inline_css:
        urls.extend(discover_css(style))
    for js in parser.inline_js:
        urls.extend(discover_js(js))
    return urls


def decoded(data: bytes, encoding: str) -> str:
    try:
        return data.decode(encoding, errors="replace")
    except (LookupError, ValueError):
        return data.decode("utf-8", errors="replace")


def get_robots(fetcher: Fetcher, base_url: str) -> tuple[RobotFileParser | None, list[str]]:
    notes = []
    url = urljoin(base_url, "/robots.txt")
    result = fetcher.get(url)
    if not result["ok"]:
        notes.append(f"robots.txt unavailable ({result.get('status') or result.get('error')}); no restrictions could be read")
        return None, notes
    parser = RobotFileParser()
    parser.parse(decoded(result["body"], result["encoding"]).splitlines())
    return parser, notes


def read_sitemap(fetcher: Fetcher, site_url: str, robots: RobotFileParser | None,
                 *, max_pages: int) -> tuple[list[str], list[str]]:
    pages, notes = [], []
    queue = [urljoin(site_url, "/sitemap.xml")]
    seen = set()
    while queue and len(seen) < 6 and len(pages) < max_pages:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        if robots and not robots.can_fetch(USER_AGENT, url):
            notes.append(f"Sitemap disallowed by robots.txt: {url}")
            continue
        result = fetcher.get(url)
        if not result["ok"]:
            notes.append(f"Sitemap unavailable: {url} ({result.get('status') or result.get('error')})")
            continue
        try:
            xml = ElementTree.fromstring(result["body"])
        except ElementTree.ParseError as e:
            notes.append(f"Invalid sitemap XML: {url}: {e}")
            continue
        for loc in xml.iter():
            if loc.tag.rsplit("}", 1)[-1] != "loc" or not loc.text:
                continue
            candidate = canonical(loc.text.strip(), url)
            if not candidate:
                continue
            if origin_of(candidate) != fetcher.origin or is_tracker(candidate) or is_sensitive(candidate):
                continue
            if xml.tag.rsplit("}", 1)[-1] == "sitemapindex":
                if candidate not in seen:
                    queue.append(candidate)
            elif not is_asset_url(candidate) and candidate not in pages:
                pages.append(candidate)
                if len(pages) >= max_pages:
                    break
    return pages, notes


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Capture public same-origin SSR HTML and static assets; no login, trackers or browser execution.")
    p.add_argument("--url", required=True, help="Public http(s) website entry URL")
    p.add_argument("--output", required=True, type=Path, help="Empty destination directory, separate from the skill package")
    p.add_argument("--sitemap", action="store_true", help="Optionally discover extra pages via public /sitemap.xml")
    p.add_argument("--max-pages", type=int, default=10, help="Maximum HTML pages, including entry (default: 10)")
    p.add_argument("--max-assets", type=int, default=500, help="Maximum static resources (default: 500)")
    p.add_argument("--max-depth", type=int, default=4, help="Maximum iterative discovery levels (default: 4)")
    p.add_argument("--max-bytes", type=int, default=20_000_000, help="Per-resource download limit in bytes (default: 20000000)")
    p.add_argument("--max-total-bytes", type=int, default=250_000_000, help="Maximum combined saved bytes (default: 250000000)")
    p.add_argument("--timeout", type=float, default=12, help="Per-request timeout in seconds (default: 12)")
    p.add_argument("--workers", type=int, default=6, help="Concurrent requests 1-16 (default: 6)")
    p.add_argument("--allow-localhost", action="store_true", help="Permit localhost / 127.0.0.1 for authorized local preview testing only")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if not (1 <= args.max_pages <= 500 and 0 <= args.max_assets <= 10000 and
            0 <= args.max_depth <= 12 and 1 <= args.workers <= 16 and
            1024 <= args.max_bytes <= 200_000_000 and
            1024 <= args.max_total_bytes <= 2_000_000_000 and 0.5 <= args.timeout <= 120):
        print("Invalid limits; consult --help", file=sys.stderr)
        return 2
    url = canonical(args.url)
    if not url:
        print("Use an unauthenticated absolute http(s) URL", file=sys.stderr)
        return 2
    origin = origin_of(url)
    if is_tracker(url) or is_sensitive(url) or not safe_host(urlsplit(url).hostname or "", allow_localhost=args.allow_localhost):
        print("Blocked tracker, private/unsafe target, or sensitive account/API route", file=sys.stderr)
        return 2
    out = args.output.resolve()
    if out.exists() and any(out.iterdir()):
        print(f"Refusing to overwrite nonempty destination: {out}", file=sys.stderr)
        return 2
    # No test data or captured media ever gets placed in this reusable skill.
    skill_root = Path(__file__).resolve().parent.parent
    if out == skill_root or skill_root in out.parents:
        print("Output must be outside the reusable skill package", file=sys.stderr)
        return 2
    out.mkdir(parents=True, exist_ok=True)
    fetcher = Fetcher(origin, timeout=args.timeout, max_bytes=args.max_bytes, allow_localhost=args.allow_localhost)
    robots, notes = get_robots(fetcher, url)
    seed = [url]
    if args.sitemap:
        sitemap, extra = read_sitemap(fetcher, url, robots, max_pages=args.max_pages)
        notes.extend(extra)
        seed += [p for p in sitemap if p != url]

    from collections import deque
    pages = deque((u, 0, "entry" if i == 0 else "sitemap") for i, u in enumerate(seed))
    assets = deque()
    seen_pages, seen_assets, written_paths = set(), set(), {}
    records, failed, skipped, external = [], [], [], set()
    started = utc_now()
    total_bytes = 0
    budget_exhausted = False

    def enqueue(raw: str, kind: str, base: str, depth: int):
        if depth > args.max_depth or not raw or raw.startswith(("#", "data:", "blob:", "javascript:", "mailto:", "tel:")):
            return
        target = canonical(raw, base)
        if not target:
            return
        if origin_of(target) != origin:
            if len(external) < 300:
                external.add(origin_of(target))
            return
        if is_tracker(target) or is_sensitive(target):
            skipped.append({"url": target, "reason": "tracker or sensitive route"})
            return
        actual_kind = "asset" if is_asset_url(target) else kind
        if actual_kind == "asset":
            if len(seen_assets) >= args.max_assets * 4 + 32:
                return  # bounded discovery even for bundles with huge literal tables
            if target not in seen_assets:
                assets.append((target, depth, base))
                seen_assets.add(target)
        elif actual_kind == "page":
            if target not in seen_pages:
                pages.append((target, depth, base))

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        while (pages or assets) and not budget_exhausted:
            batch = []
            while pages and len(batch) < args.workers and sum(r["kind"] == "page" for r in records) + sum(x[1] == "page" for x in batch) < args.max_pages:
                item = pages.popleft()
                if item[0] not in seen_pages:
                    seen_pages.add(item[0])
                    batch.append((item[0], "page", item[1], item[2]))
            while assets and len(batch) < args.workers and sum(r["kind"] == "asset" for r in records) + sum(x[1] == "asset" for x in batch) < args.max_assets:
                item = assets.popleft()
                batch.append((item[0], "asset", item[1], item[2]))
            if not batch:
                break
            pending = []
            for candidate, kind, depth, source in batch:
                if robots and not robots.can_fetch(USER_AGENT, candidate):
                    skipped.append({"url": candidate, "reason": "disallowed by robots.txt"})
                else:
                    pending.append((candidate, kind, depth, source, pool.submit(fetcher.get, candidate)))
            for candidate, kind, depth, source, future in pending:
                result = future.result()
                if budget_exhausted:
                    continue
                if not result["ok"]:
                    failed.append({"url": candidate, "kind": kind, "status": result["status"], "error": result["error"]})
                    continue
                try:
                    rel = safe_relative(result["url"], page=kind == "page")
                    dest = local_target(out, rel)
                    if rel.as_posix().casefold() in written_paths:
                        skipped.append({"url": candidate, "reason": "path collision (possibly query variant)", "path": str(rel)})
                        continue
                    written_paths[rel.as_posix().casefold()] = candidate
                    content = result["body"]
                    mime = result["content_type"]
                    text = decoded(content, result["encoding"]) if kind == "page" or mime in (
                        "text/css", "text/javascript", "application/javascript", "application/x-javascript",
                        "application/json", "text/html") or rel.suffix.lower() in (".css", ".js", ".mjs") else ""
                    if kind == "page":
                        if mime not in ("text/html", "application/xhtml+xml") and "<html" not in text[:2048].lower():
                            raise ValueError(f"Not an SSR HTML document ({mime})")
                        discovered = discover_html(text)
                        content = strip_active_scripts(text).encode("utf-8")
                        for raw, found_kind in discovered:
                            enqueue(raw, found_kind, result["url"], depth + 1)
                    elif text:
                        discovered = discover_css(text) if rel.suffix.lower() == ".css" or mime == "text/css" else discover_js(text)
                        for raw, found_kind in discovered:
                            enqueue(raw, found_kind, result["url"], depth + 1)
                    if total_bytes + len(content) > args.max_total_bytes:
                        skipped.append({"url": candidate, "reason": "--max-total-bytes budget reached"})
                        budget_exhausted = True
                        notes.append(f"Stopped at cumulative limit --max-total-bytes={args.max_total_bytes}")
                        continue
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(content)
                    total_bytes += len(content)
                    record = {"url": candidate, "resolved_url": result["url"], "source": source,
                              "kind": kind, "depth": depth, "path": rel.as_posix(), "size": len(content),
                              "sha256": digest(content), "status": result["status"], "content_type": mime}
                    records.append(record)
                    print(f"[{kind:5}] {result['status']:3} {len(content):>9} B {rel.as_posix()}")
                except (ValueError, OSError, UnicodeError) as e:
                    failed.append({"url": candidate, "kind": kind, "status": result["status"], "error": str(e)[:240]})

    manifest = {
        "schema_version": 1,
        "tool": "website-fidelity-cloner/capture_public.py",
        "url": url,
        "origin": origin,
        "started_at": started,
        "finished_at": utc_now(),
        "mode": "same-origin SSR static capture; saved HTML scripts inert; no code executed",
        "options": {"max_pages": args.max_pages, "max_assets": args.max_assets, "max_depth": args.max_depth,
                    "workers": args.workers, "timeout": args.timeout, "max_bytes": args.max_bytes,
                    "max_total_bytes": args.max_total_bytes,
                    "sitemap": args.sitemap, "allow_localhost": args.allow_localhost},
        "files": records,
        "failed": failed,
        "skipped": skipped[:500],
        "external_origins_not_fetched": sorted(external),
        "notes": notes + ["HTML scripts made inert for safe offline preview; SSR visual DOM remains. A browser-rendered client app cannot be captured faithfully without additional authorized visual QA.",
                          "Only same-origin public resources are downloaded. External fonts/CDNs and dynamic data need separate explicit assessment."],
        "stats": {"pages": sum(x["kind"] == "page" for x in records),
                  "assets": sum(x["kind"] == "asset" for x in records),
                  "bytes": sum(x["size"] for x in records), "failed": len(failed),
                  "skipped": len(skipped), "external_origins": len(external)},
    }
    (out / "snapshot-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Snapshot: {out}\nSummary: {manifest['stats']}\nVerify: python scripts/verify_assets.py --root {out}")
    return 0 if manifest["stats"]["pages"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
