#!/usr/bin/env python3
"""Publish finished Attack of the Show episode notes to data/aots.json.

Only authored episode notes and the reconstructed broadcast calendar are
published. Transcripts, subtitle files, video, and the private work catalog
stay local.

    python tools/sync-aots.py
"""

import csv
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "aots.json"
NOTES_DIR = Path(r"S:\Video\TV\G4\Attack of the Show Notes")
CALENDAR = Path(r"J:\Workspace\HermesSubtitleWork\CanonicalScheduleResearch\calendar.csv")
YEARS = [str(year) for year in range(2005, 2014)]
DATE_IN_NAME = re.compile(r"\((\d{1,2})[ ._-](\d{1,2})[ ._-](\d{4})\)")
TIME_RE = re.compile(r"^\[?(\d{1,2}:\d{2}:\d{2})\]?$")


def die(message):
    print(f"sync-aots: {message}", file=sys.stderr)
    raise SystemExit(1)


def load_calendar():
    """Return annual schedule counts, undated count, and first row per date."""
    if not CALENDAR.exists():
        die(f"canonical calendar not found at {CALENDAR}")
    per_year = Counter()
    undated = 0
    by_date = {}
    with CALENDAR.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            air = (row.get("air_date") or "").strip()
            if not valid_date(air):
                undated += 1
                continue
            per_year[air[:4]] += 1
            by_date.setdefault(air, row)
    return per_year, undated, by_date


def valid_date(value):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date().isoformat() == value
    except (TypeError, ValueError):
        return False


def air_date_for(payload, path):
    air = (payload.get("air_date") or "").strip()
    if valid_date(air):
        return air, False
    match = DATE_IN_NAME.search(path.name)
    if not match:
        return "", False
    month, day, year = match.groups()
    try:
        return date(int(year), int(month), int(day)).isoformat(), True
    except ValueError:
        return "", False


def timestamp(value):
    if not isinstance(value, str):
        return ""
    match = TIME_RE.fullmatch(value.strip())
    return match.group(1) if match else ""


def strings(values):
    if not isinstance(values, list):
        return []
    return [value.strip() for value in values if isinstance(value, str) and value.strip()]


def timed_objects(values, label_key, extra_keys=()):
    """Normalize schema-v2 objects and legacy strings to a public shape."""
    if not isinstance(values, list):
        return []
    normalized = []
    for value in values:
        if isinstance(value, str):
            label = value.strip()
            item = {label_key: label, "at": ""}
        elif isinstance(value, dict):
            label = str(value.get(label_key) or "").strip()
            item = {label_key: label, "at": timestamp(value.get("timestamp") or value.get("at"))}
            for key in extra_keys:
                extra = value.get(key)
                item[key] = str(extra).strip() if extra is not None else ""
        else:
            continue
        if label:
            normalized.append(item)
    return normalized


def normalize_appearances(values):
    if not isinstance(values, list):
        return []
    result = []
    for value in values:
        if not isinstance(value, dict):
            continue
        name = str(value.get("name") or "").strip()
        if not name:
            continue
        result.append(
            {
                "name": name,
                "type": str(value.get("type") or "mention").strip().lower(),
                "role": str(value.get("role") or "").strip(),
                "topic": str(value.get("topic") or "").strip(),
                "at": timestamp(value.get("timestamp") or value.get("at")),
            }
        )
    return result


def normalize_notable(values):
    if isinstance(values, str):
        values = [values]
    if not isinstance(values, list):
        return []
    result = []
    for value in values:
        if isinstance(value, str):
            text, at = value.strip(), ""
        elif isinstance(value, dict):
            text = str(value.get("text") or value.get("label") or "").strip()
            at = timestamp(value.get("timestamp") or value.get("at"))
        else:
            continue
        if text:
            result.append({"text": text, "at": at})
    return result


def stable_id(path, air):
    # A short hash keeps IDs stable and unique without publishing local paths.
    relative = path.relative_to(NOTES_DIR).as_posix().casefold().encode("utf-8")
    suffix = hashlib.sha1(relative).hexdigest()[:8]
    return f"{air}-{suffix}"


def load_notes(by_date):
    if not NOTES_DIR.exists():
        die(f"notes folder not found at {NOTES_DIR}")
    notes = []
    for path in sorted(NOTES_DIR.rglob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"  ! skipped {path.name}: {exc}", file=sys.stderr)
            continue
        if not isinstance(payload, dict) or payload.get("error"):
            continue

        air, inferred = air_date_for(payload, path)
        if not air:
            print(f"  ! skipped {path.name}: no usable air date", file=sys.stderr)
            continue
        canonical = by_date.get(air, {})
        appearances = normalize_appearances(payload.get("appearances"))
        segments = timed_objects(payload.get("segments"), "label", ("franchise",))
        topics = timed_objects(payload.get("topics"), "label")
        media = timed_objects(payload.get("media_covered") or payload.get("media"), "title")
        notable = normalize_notable(payload.get("notable"))
        title = (canonical.get("title") or "").strip() or f"Attack of the Show — {air}"

        notes.append(
            {
                "id": stable_id(path, air),
                "date": air,
                "year": air[:4],
                "dateInferred": inferred,
                "title": title,
                "epNo": (canonical.get("g4_episode_no") or "").strip(),
                "hosts": strings(payload.get("hosts")),
                "summary": str(payload.get("summary") or "").strip(),
                "notable": notable,
                "appearances": appearances,
                "segments": segments,
                "topics": topics,
                "media": media,
                "reviewed": bool((payload.get("meta") or {}).get("reviewed")),
            }
        )

    notes.sort(key=lambda note: (note["date"], note["title"].casefold(), note["id"]))
    return notes


def main():
    per_year, calendar_undated, by_date = load_calendar()
    notes = load_notes(by_date)
    noted_per_year = Counter(note["year"] for note in notes)
    people = {
        name.casefold()
        for note in notes
        for name in [*note["hosts"], *(appearance["name"] for appearance in note["appearances"])]
        if name
    }
    franchises = {
        segment["franchise"]
        for note in notes
        for segment in note["segments"]
        if segment["franchise"]
    }
    years = [
        {"year": year, "total": per_year.get(year, 0), "noted": noted_per_year.get(year, 0)}
        for year in YEARS
    ]
    payload = {
        "generated": date.today().isoformat(),
        "source": "finished local episode notes + reconstructed G4 schedule",
        "totals": {
            "episodes": sum(per_year.values()),
            "calendarUndated": calendar_undated,
            "noted": len(notes),
            "people": len(people),
            "segments": len(franchises),
            "inferredDates": sum(note["dateInferred"] for note in notes),
        },
        "years": years,
        "notes": notes,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        f"sync-aots: {len(notes)} notes, {len(people)} people, {len(franchises)} recurring segments "
        f"-> {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)"
    )


if __name__ == "__main__":
    main()
