# Notes — how to add one

Everything under `notes/` is indexed at build time into `data/library.json`,
which is what the Writing page reads. There is no GitHub API call at runtime
and no rate limit to hit.

## Adding a note

1. Write it as `.html` or `.md` and drop it in a folder under `notes/`.
   The folder becomes the note's section:

   ```text
   notes/
   ├── sims-guides/   → "Sims"
   ├── tools/         → "Tools"
   ├── projects/      → "Projects"
   ├── writing/       → "Writing"
   └── anything-else/ → title-cased folder name
   ```

2. Give it a title and a summary. Both are optional — the builder will guess —
   but a written one always reads better than a guessed one.

   In HTML, put them in the `<head>`:

   ```html
   <title>The Sims 1 — Install Order & Setup</title>
   <meta name="summary" content="One or two sentences, shown on the card.">
   <meta name="tags" content="Sims 1, Install, Guide">
   ```

   In Markdown, use comments at the very top, then a `#` heading:

   ```markdown
   <!-- summary: One or two sentences, shown on the card. -->
   <!-- tags: Sims 1, Reverse engineering -->

   # Save Editor — Legacy vs. Original File Structures
   ```

3. Rebuild the index and commit both the note and the regenerated JSON:

   ```bash
   python tools/build-library.py
   ```

## Notes on note files

- Don't include a `<header>`, `<nav>`, `<footer>` or a stylesheet link. The
  reader supplies all of that; anything you add gets stripped.
- The "Updated" date comes from the file's last commit. Override it with
  `<meta name="date" content="2026-08-16">` if you need to.
- Word counts and tag pills are derived — nothing to maintain by hand.

## The other generated files

| File | Built by | From |
| --- | --- | --- |
| `data/library.json` | `tools/build-library.py` | this folder |
| `data/aots.json` | `tools/sync-aots.py` | the local episode-notes folder |
| `data/hod.json` | hand-edited | the Hod roadmap |
| `assets/web/*` | `tools/build-assets.py` | the full-size art in `assets/` |
