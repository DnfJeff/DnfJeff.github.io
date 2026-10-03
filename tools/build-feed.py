#!/usr/bin/env python3
"""
Index everything under posts/ into data/feed.json.

Walks posts/ for .md posts, parses frontmatter and markdown body,
extracts author comments, resolves linked library notes, processes
Excalidraw drawings into scalable SVG, and compiles data/feed.json for the
Feed timeline page.

    python tools/build-feed.py
"""

import html
import json
import math
import re
import sys
from frontmatter import parse as parse_simple_frontmatter
from datetime import date, datetime
from pathlib import Path

try:
    import yaml
except ImportError:
    yaml = None

ROOT = Path(__file__).resolve().parent.parent
POSTS = ROOT / "posts"
DATA = ROOT / "data"
LIBRARY_JSON = DATA / "library.json"
OUT = DATA / "feed.json"

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


def strip_tags(s):
    return WS_RE.sub(" ", html.unescape(TAG_RE.sub(" ", s))).strip()


def parse_frontmatter(text):
    """Parse YAML or key-value frontmatter bounded by --- markers."""
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            raw_meta = parts[1].strip()
            body = parts[2].lstrip()
            if yaml:
                try:
                    meta = yaml.safe_load(raw_meta) or {}
                    return meta, body
                except Exception:
                    pass
            return parse_simple_frontmatter(text)
    return {}, text


def excalidraw_to_svg(excalidraw_data):
    """
    Convert Excalidraw JSON elements into clean, crisp SVG.
    Supports rectangle, ellipse, diamond, line, arrow, and text elements.
    """
    elements = excalidraw_data.get("elements", [])
    active = [e for e in elements if not e.get("isDeleted", False)]
    if not active:
        return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"></svg>'

    # Calculate bounding box
    min_x = float("inf")
    min_y = float("inf")
    max_x = float("-inf")
    max_y = float("-inf")

    for e in active:
        x = e.get("x", 0)
        y = e.get("y", 0)
        w = e.get("width", 0)
        h = e.get("height", 0)
        points = e.get("points")
        if points:
            for px, py in points:
                min_x = min(min_x, x + px)
                min_y = min(min_y, y + py)
                max_x = max(max_x, x + px)
                max_y = max(max_y, y + py)
        else:
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x + w)
            max_y = max(max_y, y + h)

    pad = 32
    min_x = min_x - pad
    min_y = min_y - pad
    width = max(1, (max_x - min_x) + pad * 2)
    height = max(1, (max_y - min_y) + pad * 2)

    svg_parts = [
        f'<svg viewBox="{min_x:.1f} {min_y:.1f} {width:.1f} {height:.1f}" '
        f'xmlns="http://www.w3.org/2000/svg" class="excalidraw-svg">'
    ]
    svg_parts.append(
        '<defs>'
        '<marker id="excal-arrow" viewBox="0 0 10 10" refX="7" refY="5" '
        'markerWidth="6" markerHeight="6" orient="auto-start-reverse">'
        '<path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="currentColor" />'
        '</marker>'
        '</defs>'
    )

    for e in active:
        etype = e.get("type")
        x = e.get("x", 0)
        y = e.get("y", 0)
        w = e.get("width", 0)
        h = e.get("height", 0)
        stroke = e.get("strokeColor", "#241d18")
        fill = e.get("backgroundColor", "none")
        sw = e.get("strokeWidth", 2)
        style = e.get("strokeStyle", "solid")
        dash = ' stroke-dasharray="6 4"' if style == "dashed" else (' stroke-dasharray="2 2"' if style == "dotted" else "")
        fill_attr = f'fill="{fill}"' if fill and fill != "transparent" else 'fill="none"'

        if etype == "rectangle":
            rx = 8 if e.get("roundness") else 0
            svg_parts.append(
                f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
                f'{fill_attr} stroke="{stroke}" stroke-width="{sw}"{dash} />'
            )
        elif etype == "ellipse":
            cx = x + w / 2
            cy = y + h / 2
            rx = abs(w / 2)
            ry = abs(h / 2)
            svg_parts.append(
                f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" '
                f'{fill_attr} stroke="{stroke}" stroke-width="{sw}"{dash} />'
            )
        elif etype == "diamond":
            p1 = f"{x + w / 2},{y}"
            p2 = f"{x + w},{y + h / 2}"
            p3 = f"{x + w / 2},{y + h}"
            p4 = f"{x},{y + h / 2}"
            svg_parts.append(
                f'<polygon points="{p1} {p2} {p3} {p4}" '
                f'{fill_attr} stroke="{stroke}" stroke-width="{sw}"{dash} />'
            )
        elif etype in ("line", "arrow"):
            points = e.get("points", [[0, 0], [w, h]])
            d_parts = [f"M {x + points[0][0]:.1f} {y + points[0][1]:.1f}"]
            for px, py in points[1:]:
                d_parts.append(f"L {x + px:.1f} {y + py:.1f}")
            d = " ".join(d_parts)
            marker = ' marker-end="url(#excal-arrow)"' if etype == "arrow" else ""
            svg_parts.append(
                f'<path d="{d}" fill="none" stroke="{stroke}" stroke-width="{sw}"{dash}{marker} style="color: {stroke}" />'
            )
        elif etype == "text":
            raw_text = e.get("text", "")
            fsize = e.get("fontSize", 16)
            font_family = "ui-monospace, monospace" if e.get("fontFamily") == 3 else "system-ui, sans-serif"
            text_lines = raw_text.splitlines()
            line_height = fsize * 1.3
            text_group = [f'<text x="{x}" y="{y + fsize}" font-size="{fsize}" font-family="{font_family}" fill="{stroke}">']
            for i, line in enumerate(text_lines):
                dy = 0 if i == 0 else line_height
                text_group.append(f'<tspan x="{x}" dy="{dy}">{html.escape(line)}</tspan>')
            text_group.append('</text>')
            svg_parts.append("".join(text_group))

    svg_parts.append('</svg>')
    return "\n".join(svg_parts)


def process_attachments(attachments):
    """Process attachment list, converting .excalidraw files to companion SVG if needed."""
    processed = []
    for att in attachments:
        file_path_str = att.get("file", "")
        file_path = ROOT / file_path_str
        item = dict(att)
        
        # If it's an excalidraw file, generate/ensure companion .svg exists
        if file_path.suffix.lower() == ".excalidraw" and file_path.exists():
            item["type"] = "drawing"
            try:
                draw_json = json.loads(file_path.read_text(encoding="utf-8"))
                svg_content = excalidraw_to_svg(draw_json)
                svg_path = file_path.with_suffix(".svg")
                svg_path.write_text(svg_content, encoding="utf-8")
                item["svg_file"] = svg_path.relative_to(ROOT).as_posix()
                item["svg_inline"] = svg_content
            except Exception as e:
                print(f"Warning: Failed to render {file_path_str} to SVG: {e}", file=sys.stderr)

        processed.append(item)
    return processed


def load_library_lookup():
    """Load notes metadata from data/library.json for instant interplay."""
    if not LIBRARY_JSON.exists():
        return {}
    try:
        data = json.loads(LIBRARY_JSON.read_text(encoding="utf-8"))
        return {e.get("path"): e for e in data.get("entries", [])}
    except Exception:
        return {}


def main():
    if not POSTS.is_dir():
        POSTS.mkdir(parents=True, exist_ok=True)

    lib_lookup = load_library_lookup()
    posts = []

    for path in sorted(POSTS.glob("*.md")):
        if not path.is_file():
            continue

        raw = path.read_text(encoding="utf-8", errors="replace")
        meta, body = parse_frontmatter(raw)

        title = meta.get("title")
        if not title:
            m = re.search(r"^#\s+(.+)$", body, re.M)
            title = m.group(1).strip() if m else path.stem.replace("-", " ").title()

        summary = meta.get("summary", "")
        if not summary:
            # take first paragraph
            for para in body.split("\n\n"):
                clean_p = strip_tags(para)
                if clean_p and not clean_p.startswith("#"):
                    summary = clean_p[:240] + ("…" if len(clean_p) > 240 else "")
                    break

        date_str = str(meta.get("date") or date.today().isoformat())
        tags = meta.get("tags") or []
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]

        project = meta.get("project") or (tags[0] if tags else "General")
        status = meta.get("status") or "in motion"
        
        # Attachments
        raw_attachments = meta.get("attachments") or []
        attachments = process_attachments(raw_attachments)

        # Author Addendums (Follow-up notes appended without mutating main text)
        comments = meta.get("comments") or meta.get("addendums") or []
        comments = [{"id": c.get("id", f"legacy-{i}"), "date": c.get("date", ""), "body": c.get("body", c.get("note", ""))} for i, c in enumerate(comments) if isinstance(c, dict)]

        # Related Library Notes Interplay
        rel_notes = meta.get("related_notes") or []
        linked_cards = []
        for n_path in rel_notes:
            note_info = lib_lookup.get(n_path)
            if note_info:
                linked_cards.append({
                    "path": note_info["path"],
                    "title": note_info["title"],
                    "section": note_info["section"],
                    "summary": note_info.get("summary", ""),
                    "words": note_info.get("words", 0),
                    "tags": note_info.get("tags", [])
                })
            else:
                linked_cards.append({
                    "path": n_path,
                    "title": Path(n_path).stem.replace("-", " ").title(),
                    "section": "Library",
                    "summary": "",
                    "words": 0,
                    "tags": []
                })

        post_id = path.stem

        posts.append({
            "id": post_id,
            "path": path.relative_to(ROOT).as_posix(),
            "title": title,
            "date": date_str,
            "project": project,
            "status": status,
            "tags": tags,
            "summary": summary,
            "body": body.strip(),
            "attachments": attachments,
            "comments": comments,
            "linked_notes": linked_cards,
        })

    # Sort newest first
    posts.sort(key=lambda p: (p["date"], p["id"]), reverse=True)

    # Gather available tags, projects, and dates for sidebar filters
    all_tags = sorted(list(set(t for p in posts for t in p["tags"])))
    options_file = DATA / "feed-options.json"
    options = json.loads(options_file.read_text(encoding="utf-8")) if options_file.exists() else {}
    all_projects = sorted(set(options.get("projects", [])) | set(p["project"] for p in posts if p["project"]))
    all_statuses = sorted(set(options.get("statuses", [])) | set(p["status"] for p in posts if p["status"]))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated": date.today().isoformat(),
        "count": len(posts),
        "tags": all_tags,
        "projects": all_projects,
        "statuses": all_statuses,
        "posts": posts
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"build-feed: {len(posts)} posts -> {OUT.relative_to(ROOT)}")
    for p in posts:
        att_summary = f"{len(p['attachments'])} atts" if p['attachments'] else "no atts"
        add_summary = f"{len(p['comments'])} comments" if p['comments'] else "no comments"
        print(f"  {p['date']} [{p['project']:<10}] {p['title'][:44]:<46} ({att_summary}, {add_summary})")


if __name__ == "__main__":
    main()
