"""Self-host the public Google Fonts used by Kirvano's visual reference.

The original React bundle loads Inter, Inter Tight and Fustat at runtime.
Keep the exact font-family/weight/unicode-range CSS without depending on
Google Fonts being reachable during local preview.
"""

from __future__ import annotations

import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "reference" / "kirvano" / "fonts"
API = (
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700"
    "&family=Inter+Tight:wght@400;500;600;700"
    "&family=Fustat:wght@400;500;600;700&display=swap"
)
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36"
    )
}


def fetch_font(url: str) -> tuple[str, dict]:
    name = hashlib.sha256(url.encode("utf-8")).hexdigest()[:20] + ".woff2"
    dest = DEST / "vendor" / name
    try:
        if dest.exists() and dest.stat().st_size > 0:
            size = dest.stat().st_size
        else:
            response = requests.get(url, headers=HEADERS, timeout=30)
            response.raise_for_status()
            if "font" not in response.headers.get("content-type", "") and not response.content.startswith(b"wOF2"):
                raise ValueError("Not a font response")
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(response.content)
            size = len(response.content)
        return url, {"local": "/fonts/vendor/" + name, "bytes": size, "status": "ready"}
    except Exception as exc:
        return url, {"local": None, "status": "failed", "error": str(exc)}


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    response = requests.get(API, headers=HEADERS, timeout=30)
    response.raise_for_status()
    css = response.text
    urls = sorted(set(re.findall(r"https://fonts\.gstatic\.com/[^)'\"\s]+\.woff2", css)))
    records = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        for future in as_completed([pool.submit(fetch_font, url) for url in urls]):
            url, record = future.result()
            records[url] = record
    for url, record in records.items():
        if record["local"]:
            css = css.replace(url, record["local"])
    (DEST / "google-fonts.css").write_text(
        "/* Self-hosted copy of Kirvano's current public Google Fonts CSS */\n" + css,
        encoding="utf-8",
    )
    manifest = {
        "source": API,
        "fonts": records,
        "downloaded": sum(item["status"] == "ready" for item in records.values()),
        "failed": sum(item["status"] == "failed" for item in records.values()),
    }
    (DEST / "font-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Fonts: {manifest['downloaded']} ready, {manifest['failed']} failed")
    for url, result in records.items():
        if result["status"] == "failed":
            print("FAILED", url, result["error"])


if __name__ == "__main__":
    main()
