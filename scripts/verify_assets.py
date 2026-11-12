#!/usr/bin/env python3
"""Verify a capture_public.py snapshot without performing any network I/O.

Checks file size/SHA-256 from manifest, unsafe paths, SSR page references,
CSS url()/@import, and literal static JS asset paths. Never fetches missing
resources and never executes site JavaScript.

  python scripts/verify_assets.py --root ./reference/example
  python scripts/verify_assets.py --root ./reference/example --strict

Standard library only, Python 3.9+.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit

from capture_public import (  # executable from the same scripts/ directory
    canonical, decoded, discover_css, discover_html, discover_js, is_asset_url,
    is_sensitive, is_tracker, local_target, origin_of, safe_relative,
    utc_now,
)


def args_parser() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Verify captured assets, SHA-256/size, and local HTML/CSS/JS references (offline).")
    p.add_argument("--root", required=True, type=Path, help="Existing snapshot directory containing snapshot-manifest.json")
    p.add_argument("--report", type=Path, help="Optional JSON report path (default: <root>/integrity-report.json)")
    p.add_argument("--strict", action="store_true", help="Exit nonzero if any file integrity error or missing local asset reference")
    return p.parse_args()


def main() -> int:
    args = args_parser()
    root = args.root.resolve()
    manifest_path = root / "snapshot-manifest.json"
    if not manifest_path.is_file():
        print(f"Capture manifest not found: {manifest_path}", file=sys.stderr)
        return 2
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("schema_version") != 1 or not isinstance(manifest.get("files"), list):
            raise ValueError("Unsupported manifest schema")
        site_origin = origin_of(manifest["url"])
    except (KeyError, ValueError, UnicodeDecodeError, json.JSONDecodeError) as e:
        print(f"Invalid manifest: {e}", file=sys.stderr)
        return 2

    problems, missing_refs, incomplete_pages, external_refs, skipped_refs = [], [], [], set(), []
    valid_files, files_by_url, files_by_path = [], {}, {}
    for entry in manifest["files"]:
        try:
            raw_path = entry["path"]
            rel = Path(raw_path)
            if (rel.is_absolute() or ".." in rel.parts or "\\" in raw_path or ":" in raw_path or
                    raw_path.startswith("/") or not raw_path):
                raise ValueError("Unsafe manifest path")
            path = local_target(root, rel)
            if not path.is_file():
                raise FileNotFoundError("File missing")
            # Avoid reading extreme files from a forged manifest, with the same
            # upper bound accepted by the capture tool.
            if path.stat().st_size > 200_000_000:
                raise ValueError("File exceeds verification size limit")
            data = path.read_bytes()
            actual_size = len(data)
            actual_hash = hashlib.sha256(data).hexdigest()
            if actual_size != entry["size"]:
                raise ValueError(f"Size mismatch: expected {entry['size']}, got {actual_size}")
            if actual_hash != entry["sha256"]:
                raise ValueError(f"SHA-256 mismatch: expected {entry['sha256']}, got {actual_hash}")
            if entry.get("kind") not in ("page", "asset"):
                raise ValueError("Unknown file kind")
            # The expected local filename follows the original URL path. A
            # forged manifest cannot mask an unrelated file as an asset.
            expected = safe_relative(entry.get("resolved_url") or entry["url"], page=entry["kind"] == "page")
            if expected.as_posix().casefold() != rel.as_posix().casefold():
                raise ValueError("Path does not match original URL")
            valid_files.append((entry, data))
            files_by_url[canonical(entry["url"])] = entry
            if entry.get("resolved_url"):
                files_by_url[canonical(entry["resolved_url"])] = entry
            files_by_path[rel.as_posix().casefold()] = entry
        except (KeyError, TypeError, ValueError, OSError) as error:
            problems.append({"path": entry.get("path", "?"), "url": entry.get("url", "?"), "error": str(error)})

    seen_references = set()
    checked_refs = 0
    for entry, data in valid_files:
        file_url = entry.get("resolved_url") or entry["url"]
        suffix = Path(entry["path"]).suffix.lower()
        text = decoded(data, "utf-8") if entry["kind"] == "page" or suffix in (".css", ".js", ".mjs", ".cjs", ".json", ".svg", ".webmanifest") else ""
        if entry["kind"] == "page":
            refs = discover_html(text)
        elif suffix == ".css":
            refs = discover_css(text)
        elif suffix in (".js", ".mjs", ".cjs"):
            refs = discover_js(text)
        else:
            continue
        for literal, initial_kind in refs:
            if not literal or literal.startswith(("#", "data:", "blob:", "javascript:", "mailto:", "tel:")):
                continue
            url = canonical(literal, file_url)
            if not url:
                continue
            if origin_of(url) != site_origin:
                external_refs.add(origin_of(url))
                continue
            if is_tracker(url) or is_sensitive(url):
                if len(skipped_refs) < 100:
                    skipped_refs.append({"source": entry["path"], "url": url, "reason": "tracker or account/API route"})
                continue
            kind = "asset" if is_asset_url(url) else initial_kind
            key = (entry["path"], url, kind)
            if key in seen_references:
                continue
            seen_references.add(key)
            checked_refs += 1
            if kind == "page":
                if canonical(url) not in files_by_url and len(incomplete_pages) < 200:
                    incomplete_pages.append({"source": entry["path"], "url": url,
                                             "reason": "page link not captured (often --max-pages limit)"})
                continue
            try:
                relative = safe_relative(url, page=False).as_posix()
            except ValueError as e:
                if len(missing_refs) < 500:
                    missing_refs.append({"source": entry["path"], "url": url, "reason": str(e)})
                continue
            if canonical(url) not in files_by_url and relative.casefold() not in files_by_path:
                if len(missing_refs) < 500:
                    missing_refs.append({"source": entry["path"], "url": url, "expected_path": relative})

    report = {
        "schema_version": 1,
        "tool": "website-fidelity-cloner/verify_assets.py",
        "root": str(root),
        "source_url": manifest["url"],
        "checked_at": utc_now(),
        "files_declared": len(manifest["files"]),
        "files_verified": len(valid_files),
        "bytes_verified": sum(len(data) for _, data in valid_files),
        "reference_count": checked_refs,
        "integrity_errors": problems,
        "missing_local_asset_references": missing_refs,
        "uncaptured_page_links": incomplete_pages,
        "skipped_trackers_and_sensitive_routes": skipped_refs,
        "external_origins_not_checked": sorted(external_refs),
        "capture_failures": manifest.get("failed", []),
        "summary": {
            "integrity_errors": len(problems),
            "missing_asset_references": len(missing_refs),
            "uncaptured_page_links": len(incomplete_pages),
            "failed_downloads_in_capture": len(manifest.get("failed", [])),
            "passed": not problems and not missing_refs,
        },
        "notes": [
            "All checks are offline. Missing resources may reflect max-assets/depth limits, robots rules, or unavailable public files.",
            "Third-party URLs, account/API routes, and trackers are not downloaded or verified.",
            "SSR HTML was saved with script tags inert; a client-rendered app still requires authorized browser QA.",
        ],
    }
    report_path = args.report.resolve() if args.report else (root / "integrity-report.json")
    if report_path == manifest_path:
        print("Refusing to overwrite capture manifest", file=sys.stderr)
        return 2
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Verified {len(valid_files)}/{len(manifest['files'])} files; refs={checked_refs}; "
          f"integrity_errors={len(problems)}, missing_assets={len(missing_refs)}, "
          f"uncaptured_page_links={len(incomplete_pages)}, capture_failures={len(manifest.get('failed', []))}")
    print(f"Report: {report_path}")
    return 1 if args.strict and (problems or missing_refs) else 0


if __name__ == "__main__":
    raise SystemExit(main())
