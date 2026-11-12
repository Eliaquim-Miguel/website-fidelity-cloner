"""Local structural validator for this Agent Skill (stdlib only).

Usage: python scripts/validate_package.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NEEDED = [
    "SKILL.md",
    "README.md",
    "INSTALL-CODEX-CLAUDE.md",
    "references/WORKFLOW.md",
    "references/TOOLSTACK.md",
    "references/COMPONENTS.md",
    "references/MOTION.md",
    "references/QA.md",
    "references/TROUBLESHOOTING.md",
    "references/SAFETY-AND-RIGHTS.md",
    "examples/ULLS-KIRVANO.md",
    "scripts/capture_public.py",
    "scripts/verify_assets.py",
    "scripts/split_ssr.py",
    "scripts/bootstrap_react.py",
    "scripts/qa_playwright.mjs",
    "templates/react-vite/package.json",
    "templates/react-vite/src/App.tsx",
]


def main() -> int:
    errors = []
    for rel in NEEDED:
        if not (ROOT / rel).is_file():
            errors.append(f"MISSING {rel}")
    skill = ROOT / "SKILL.md"
    if skill.exists():
        text = skill.read_text(encoding="utf-8-sig")
        if not text.startswith("---\n") or "\n---\n" not in text[4:]:
            errors.append("SKILL.md requires YAML frontmatter")
        name = re.search(r"(?m)^name:\s*(\S+)\s*$", text)
        desc = re.search(r"(?m)^description:\s*(.+)$", text)
        if not name or name.group(1) != "website-fidelity-cloner":
            errors.append("SKILL.md name must be website-fidelity-cloner")
        if not desc or not desc.group(1).strip():
            errors.append("SKILL.md description missing")
        for path in re.findall(r"\]\((references/[^)]+|examples/[^)]+)\)", text):
            if not (ROOT / path).is_file():
                errors.append(f"INVALID LINK {path}")
    forbidden = [
        ROOT / "reference",
        ROOT / "node_modules",
        ROOT / "snapshots",
        ROOT / ".env",
    ]
    for path in forbidden:
        if path.exists():
            errors.append(f"Do not include runtime/private files: {path.name}")
    files = [p for p in ROOT.rglob("*") if p.is_file()]
    total = sum(p.stat().st_size for p in files)
    print(f"Skill: {ROOT.name}; files={len(files)}; bytes={total}; errors={len(errors)}")
    for error in errors:
        print("ERROR", error)
    if not errors:
        print("PASS: Agent Skills package structure and relative references")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
