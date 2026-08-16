#!/usr/bin/env python3
"""
Publish the Attack of the Show episode notes to data/aots.json.

Only the notes get synced. Transcripts, subtitle work, the sqlite catalog and
the video files all stay off the website — this reads the finished note JSON
and the canonical episode calendar, and writes the one file aots.html loads.

    python tools/sync-aots.py

Both sources are local working directories; if a machine doesn't have them the
script says so and leaves data/aots.json exactly as it was.
"""

import csv
import json
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "aots.json"

NOTES_DIR = Path(r"S:\Video\TV\G4\Attack of the Show Notes")
CALENDAR = Path(
    r"J:\Workspace\HermesSubtitleWork\CanonicalScheduleResearch\calendar.csv"
)

# The show ran daily from March 2005 to January 2013.
YEARS = [str(y) for y in range(2005, 2014)]

DATE_IN_NAME = re.compile(r"\((\d{2})[ ._-](\d{2})[ ._-](\d{4})\)")


def die(msg):
    print(f"sync-aots: {msg}", file=sys.stderr)
    sys.exit(1)


def load_calendar():
    """year -> canonical episode count, plus the title/number lookup by date."""
    if not CALENDAR.exists():
        die(f"canonical calendar not found at {CALENDAR}")
    per_year = defaultdict(int)
    undated = 0
    by_date = {}
    with CALENDAR.open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            air = (row.get("air_date") or "").strip()
            if not air:
                undated += 1
                continue
            per_year[air[:4]] += 1
            # First entry for a date wins; the calendar is already in order.
            by_date.setdefault(air, row)
    return per_year, by_date, undated


def air_date_for(payload, path):
    air = (payload.get("air_date") or "").strip()
    if air:
        return air
    m = DATE_IN_NAME.search(path.name)
    if m:
        mm, dd, yyyy = m.groups()
        return f"{yyyy}-{mm}-{dd}"
    return ""


def clean(seq):
    return [s.strip() for s in (seq or []) if isinstance(s, str) and s.strip()]


def load_notes(by_date):
    if not NOTES_DIR.exists():
        die(f"notes folder not found at {NOTES_DIR}")

    notes = []
    for path in sorted(NOTES_DIR.rglob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"  ! skipped {path.name}: {exc}")
            continue

        air = air_date_for(payload, path)
        if not air:
            print(f"  ! skipped {path.name}: no air date")
            continue

        canon = by_date.get(air, {})
        appearances = [
            {
                "name": (a.get("name") or "").strip(),
                "type": (a.get("type") or "mention").strip().lower(),
                "role": (a.get("role") or "").strip(),
                "topic": (a.get("topic") or "").strip(),
                "at": (a.get("timestamp") or "").strip().strip("[]"),
            }
            for a in payload.get("appearances") or []
            if (a.get("name") or "").strip()
        ]

        notes.append(
            {
                "date": air,
                "year": air[:4],
                # The canonical G4 title is the good one; fall back to the date.
                "title": (canon.get("title") or "").strip()
                or f"Episode — {air}",
                "epNo": (canon.get("g4_episode_no") or "").strip(),
                "hosts": clean(payload.get("hosts")),
                "summary": (payload.get("summary") or "").strip(),
                "notable": (payload.get("notable") or "").strip(),
                "appearances": appearances,
                "segments": clean(payload.get("segments")),
                "topics": clean(payload.get("topics")),
                "media": clean(payload.get("media_covered")),
                "reviewed": bool((payload.get("meta") or {}).get("reviewed")),
            }
        )

    notes.sort(key=lambda n: n["date"])
    return notes


def main():
    per_year, by_date, undated = load_calendar()
    notes = load_notes(by_date)
    noted_per_year = defaultdict(int)
    for n in notes:
        noted_per_year[n["year"]] += 1

    years = []
    for y in YEARS:
        total = per_year.get(y, 0)
        years.append(
            {
                "year": y,
                # 0 total means the canonical schedule for that year hasn't
                # been reconstructed yet — the page says so rather than
                # drawing a bar against a number nobody verified.
                "total": total,
                "noted": noted_per_year.get(y, 0),
            }
        )

    payload = {
        "generated": date.today().isoformat(),
        "source": "local episode notes + reconstructed G4 schedule",
        "totals": {
            "episodes": sum(per_year.values()),
            "undated": undated,
            "noted": len(notes),
            "people": len({a["name"] for n in notes for a in n["appearances"]}),
        },
        "years": years,
        "notes": notes,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(payload, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(
        f"sync-aots: {len(notes)} notes across "
        f"{sum(1 for y in years if y['noted'])} years "
        f"-> {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)"
    )


if __name__ == "__main__":
    main()
