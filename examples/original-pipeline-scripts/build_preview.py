"""Prepare the project's static preview without changing its source files.

Usage:
  python scripts/build_preview.py softriver
  python scripts/build_preview.py kirvano
  python scripts/build_preview.py kirvano --editable
  python scripts/build_preview.py ulls-react
  python scripts/build_preview.py ulls
"""

from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "softriver": ROOT / "reference" / "softriver",
    "kirvano": ROOT / "reference" / "kirvano",
    "ulls-react": ROOT / "ulls-landing" / "dist",
    "ulls": ROOT / "landing",
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the static preview into dist/")
    parser.add_argument("site", choices=SOURCES)
    parser.add_argument(
        "--editable",
        action="store_true",
        help="Include optional Kirvano content/theme editing layer",
    )
    args = parser.parse_args()
    if args.editable and args.site != "kirvano":
        parser.error("The --editable mode currently supports Kirvano only")
    source = SOURCES[args.site]
    destination = ROOT / "dist"
    if not (source / "index.html").is_file():
        parser.error(f"Missing source index: {source}")

    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source, destination)

    if args.site == "softriver":
        # Keep the visual snapshot exact while excluding tracking pixels that
        # would otherwise attribute local preview visits to the original site.
        (destination / "tags.js").unlink(missing_ok=True)
        removed_scripts = 0
        for path in destination.rglob("*.html"):
            html = path.read_text(encoding="utf-8", errors="replace")
            html, count = re.subn(r'<script\s+src="/tags\.js(?:\?[^\"]*)?"\s+defer\s*>\s*</script>', "", html)
            if count:
                path.write_text(html, encoding="utf-8")
                removed_scripts += count
        print(f"Excluded {removed_scripts} tracking script includes from preview HTML")
    elif args.site == "kirvano":
        excluded = 0
        if args.editable:
            shutil.copytree(
                ROOT / "editing" / "kirvano",
                destination / "editing" / "kirvano",
            )
        # The shipped React bundle injects Google Fonts in a client-side head
        # update; replace that URL in the *preview copy only* with our
        # self-hosted stylesheet, without mutating the preserved source.
        remote_fonts = (
            "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700"
            "&family=Inter+Tight:wght@400;500;600;700"
            "&family=Fustat:wght@400;500;600;700&display=swap"
        )
        font_override_count = 0
        analytics_removed = 0
        if (destination / "fonts" / "google-fonts.css").is_file():
            for bundle in (destination / "assets").glob("*.js"):
                code = bundle.read_text(encoding="utf-8")
                if remote_fonts in code:
                    code = code.replace(remote_fonts, "/fonts/google-fonts.css")
                    font_override_count += 1
                    # TanStack's client head definition duplicates the GTM and
                    # attribution script tags from SSR. Remove it from the
                    # benchmark *bundle copy* so hydration cannot re-inject
                    # advertising pixels into local previews.
                    code, count = re.subn(
                        r'scripts:\[\{children:"\(function\(w,d,s,l,i\).*?\},\{src:"https://lib\.kirvano\.com/kvn-params\.min\.js",defer:!0\}\]',
                        "scripts:[]",
                        code,
                        count=1,
                        flags=re.DOTALL,
                    )
                    analytics_removed += count
                    # Clarity is only a session recorder. Neutralize the
                    # injection helper and preserve all interface components.
                    start = code.find("function C_(){")
                    end = code.find("function ix(){", start + 1)
                    if start >= 0 and end > start:
                        code = code[:start] + "function C_(){}" + code[end:]
                        analytics_removed += 1
                    bundle.write_text(code, encoding="utf-8")
        for path in destination.rglob("*.html"):
            html = path.read_text(encoding="utf-8", errors="replace")
            # Commercial visitors must not be reported to the reference site's
            # advertising/attribution stack from this LOCAL benchmark.
            html, removed = re.subn(
                r'<script\b[^>]*\bsrc=["\']https://lib\.kirvano\.com/kvn-params\.min\.js["\'][^>]*>\s*</script>',
                "",
                html,
                flags=re.IGNORECASE,
            )
            excluded += removed
            html, removed = re.subn(
                r'<iframe\b[^>]*\bsrc=["\']https://www\.googletagmanager\.com/ns\.html[^"\']*["\'][^>]*>\s*</iframe>',
                "",
                html,
                flags=re.IGNORECASE,
            )
            excluded += removed
            html, removed = re.subn(
                r'<script>\s*\(function\(w,d,s,l,i\).*?GTM-WCB4XXPW.*?</script>',
                "",
                html,
                flags=re.IGNORECASE | re.DOTALL,
            )
            excluded += removed
            if (destination / "fonts" / "google-fonts.css").is_file():
                html = html.replace(
                    "</head>",
                    '<link rel="stylesheet" href="/fonts/google-fonts.css" /></head>',
                    1,
                )
            if args.editable:
                html = html.replace(
                    "</head>",
                    '<link rel="stylesheet" href="/editing/kirvano/theme.css" /></head>',
                    1,
                )
                html = html.replace(
                    "</body>",
                    '<script src="/editing/kirvano/apply-edits.js" defer></script></body>',
                    1,
                )
            path.write_text(html, encoding="utf-8")
        print(f"Excluded {excluded} HTML embeds and {analytics_removed} JS tracking hooks; patched {font_override_count} font imports")

    mode = " + editable overlays" if args.editable else ""
    print(f"Preview ready: {destination} ({args.site}{mode})")


if __name__ == "__main__":
    main()
