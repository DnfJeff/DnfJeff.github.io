#!/usr/bin/env python3
"""
Index everything under notes/ into data/library.json.

The old library made you pick a "workspace" before you could see anything, and
it hit the GitHub API on every page load. This walks the folder once at build
time and writes a flat list; the page filters it client-side. Folders survive
as tags, so the filing system still exists — it just isn't the front door.

    python tools/build-library.py

A note can override anything by declaring it in the file:
  HTML:  <meta name="summary" content="...">   <meta name="tags" content="a, b">
         <meta name="date" content="2026-02-14">
  MD:    a `<!-- summary: ... -->` / `<!-- tags: ... -->` comment near the top
"""

import html
import json
import re
import subprocess
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NOTES = ROOT / "notes"
OUT = ROOT / "data" / "library.json"

# Folder name -> the tag and one-line framing shown on the library page.
FOLDERS = {
    "sims-guides": ("Sims", "Completionist checklists and install guides."),
    "tools": ("Tools", "Readmes and documentation for things I've released."),
    "projects": ("Projects", "Plans, design docs and research notes."),
    "writing": ("Writing", "Essays and longer pieces."),
}

# Files that are scaffolding for me, not reading material for anyone else.
SKIP = {"ADDING-NOTES.md"}

TAG_HINTS = [
    (re.compile(r"sims\s*1|the sims 1", re.I), "Sims 1"),
    (re.compile(r"sims\s*2", re.I), "Sims 2"),
    (re.compile(r"sims\s*3", re.I), "Sims 3"),
    (re.compile(r"sims\s*4", re.I), "Sims 4"),
    (re.compile(r"castaway|ps2|playstation", re.I), "Console"),
    (re.compile(r"checklist|completionist", re.I), "Checklist"),
    (re.compile(r"install|setup guide", re.I), "Install"),
    (re.compile(r"csv|readme", re.I), "Reference"),
    (re.compile(r"save\s*editor|file structure|checksum|offsets", re.I), "Reverse engineering"),
    (re.compile(r"career|creator", re.I), "Modding"),
]

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


def strip_tags(s):
    return WS_RE.sub(" ", html.unescape(TAG_RE.sub(" ", s))).strip()


def git_date(path):
    """Last commit date for a file — a truer 'updated' than the filesystem."""
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", str(path.relative_to(ROOT))],
            cwd=ROOT, capture_output=True, text=True, timeout=15,
        )
        stamp = out.stdout.strip()
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", stamp):
            return stamp
    except (OSError, subprocess.SubprocessError):
        pass
    return datetime.fromtimestamp(path.stat().st_mtime).date().isoformat()


def read_html(text):
    meta = {}
    for m in re.finditer(
        r'<meta\s+name=["\'](summary|tags|date)["\']\s+content=["\']([^"\']*)["\']',
        text, re.I,
    ):
        meta[m.group(1).lower()] = m.group(2).strip()

    title = ""
    m = re.search(r"<title[^>]*>(.*?)</title>", text, re.I | re.S)
    if m:
        title = strip_tags(m.group(1))
    if not title:
        m = re.search(r"<h1[^>]*>(.*?)</h1>", text, re.I | re.S)
        if m:
            title = strip_tags(m.group(1))

    body = text
    m = re.search(r"<body[^>]*>(.*?)</body>", text, re.I | re.S)
    if m:
        body = m.group(1)
    # Drop the note's own chrome before hunting for a summary paragraph.
    body = re.sub(r"<(header|nav|footer|script|style)\b.*?</\1>", " ", body, flags=re.I | re.S)

    summary = meta.get("summary", "")
    if not summary:
        for m in re.finditer(r"<p[^>]*>(.*?)</p>", body, re.I | re.S):
            candidate = strip_tags(m.group(1))
            if len(candidate) > 40:
                summary = candidate
                break
    return title, summary, strip_tags(body), meta


def read_md(text):
    meta = {}
    for key in ("summary", "tags", "date"):
        m = re.search(rf"<!--\s*{key}:\s*(.*?)\s*-->", text, re.I)
        if m:
            meta[key] = m.group(1).strip()

    title = ""
    m = re.search(r"^#\s+(.+)$", text, re.M)
    if m:
        title = m.group(1).strip()
    if not title:
        m = re.search(r"^\*\*(.+?)\*\*", text, re.M)
        if m:
            title = m.group(1).strip()

    plain = re.sub(r"```.*?```", " ", text, flags=re.S)
    plain = re.sub(r"^[#>\-*\d.]+\s*", "", plain, flags=re.M)
    plain = re.sub(r"[*_`\[\]()]", "", plain)

    summary = meta.get("summary", "")
    if not summary:
        for block in plain.split("\n\n"):
            candidate = WS_RE.sub(" ", block).strip()
            if len(candidate) > 60 and candidate != title:
                summary = candidate
                break
    return title, summary, WS_RE.sub(" ", plain), meta


def prettify(stem):
    return WS_RE.sub(" ", re.sub(r"[-_]+", " ", stem)).strip().title()


def truncate(s, limit=220):
    s = s.strip()
    if len(s) <= limit:
        return s
    cut = s[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(" ,.;:") + "…"


def main():
    if not NOTES.is_dir():
        raise SystemExit("build-library: notes/ not found")

    entries = []
    for path in sorted(NOTES.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in (".html", ".md"):
            continue
        if path.name in SKIP:
            continue

        text = path.read_text(encoding="utf-8", errors="replace")
        if path.suffix.lower() == ".html":
            title, summary, plain, meta = read_html(text)
        else:
            title, summary, plain, meta = read_md(text)

        rel = path.relative_to(ROOT).as_posix()
        folder = path.parent.name if path.parent != NOTES else ""
        section, _ = FOLDERS.get(folder, (prettify(folder) if folder else "Notes", ""))

        tags = [t.strip() for t in meta.get("tags", "").split(",") if t.strip()]
        if not tags:
            haystack = f"{title} {path.name} {plain[:1500]}"
            tags = [tag for rx, tag in TAG_HINTS if rx.search(haystack)]
        # Section always leads, and never duplicates a hint tag.
        tags = [section] + [t for t in tags if t != section]

        entries.append({
            "id": rel.replace("/", "__").rsplit(".", 1)[0],
            "path": rel,
            "kind": path.suffix.lower().lstrip("."),
            "title": title or prettify(path.stem),
            "section": section,
            "tags": tags[:5],
            "summary": truncate(summary) if summary else "",
            "words": len(plain.split()),
            "updated": meta.get("date") or git_date(path),
        })

    entries.sort(key=lambda e: (e["updated"], e["title"]), reverse=True)

    sections = []
    for name, blurb in ((v[0], v[1]) for v in FOLDERS.values()):
        count = sum(1 for e in entries if e["section"] == name)
        if count:
            sections.append({"name": name, "blurb": blurb, "count": count})
    for name in dict.fromkeys(e["section"] for e in entries):
        if not any(s["name"] == name for s in sections):
            sections.append({
                "name": name, "blurb": "",
                "count": sum(1 for e in entries if e["section"] == name),
            })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "generated": date.today().isoformat(),
                "count": len(entries),
                "words": sum(e["words"] for e in entries),
                "sections": sections,
                "entries": entries,
            },
            indent=1, ensure_ascii=False,
        ) + "\n",
        encoding="utf-8",
    )
    print(f"build-library: {len(entries)} notes -> {OUT.relative_to(ROOT)}")
    for e in entries:
        print(f"  {e['section']:<9} {e['title'][:52]:<54} {e['words']:>5}w  {', '.join(e['tags'][1:])}")


if __name__ == "__main__":
    main()
