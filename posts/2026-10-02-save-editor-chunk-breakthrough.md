---
title: "Save Editor: IFF Chunk Offset Verification & Dual-Build Compatibility"
date: "2026-10-02"
project: "Hod"
status: "in motion"
tags: ["Sims 1", "Reverse engineering", "Hod"]
summary: "Mapped out the 64-byte IFF header and RSMP offset cascade between the 2000-era retail CD build and the modern Legacy Collection."
related_notes:
  - "notes/projects/SaveEditorPlans.md"
attachments:
  - type: "drawing"
    file: "posts/assets/sims1-iff-chunk-layout.excalidraw"
    title: "Sims 1 IFF Chunk & RSMP Pointer Cascade"
    caption: "Vector architecture map of the 64-byte header, resource offset map, and indexed chunk payloads."
  - type: "image"
    file: "assets/web/canvas-wide.webp"
    title: "Storage Engine Pipeline"
    caption: "The Hod storage engine proving bit-for-bit idempotency across save files."
comments:
  - id: "a69dbec65f1d47c4ae94967949e6f832"
    date: "2026-10-02 21:40"
    body: "Ran the parser across 40 user saves from the Livin' Large expansion. Zero chunk pointer drift detected."
  - id: "3c84fd74d9b947aea1c233751119e069"
    date: "2026-10-03 09:15"
    body: "Confirmed Mac PowerPC legacy releases store chunk sizes in big-endian notation while x86 PC builds use little-endian. Adding a dual-endian codec pass to the ingest pipeline."
---

Spent the last few days in hex editors comparing how the original Sims 1 executable reads save state IFF chunks versus how the newer Legacy Collection handles re-indexing. 

The core challenge with save editors is **byte-for-byte idempotency**: if you load a family file, inspect a Sim's personality stats, and write the file back out without changes, the MD5 checksum of the output file must match the original down to the last byte. Most community tools in the 2000s broke this guarantee by re-ordering chunks alphabetically or stripping padding bytes from the RSMP resource map table.

### What We Mapped

1. **The 64-byte Header**: Holds the master magic `IFF FILE 2.0` followed by reserved flags and a pointer straight to the RSMP chunk.
2. **The RSMP Map**: A lookup array storing 4-byte chunk types (`OBJD`, `BHAV`, `TMPL`, `STR#`), chunk IDs, and file offsets.
3. **Chunk Alignment**: Chunks are aligned on 4-byte boundaries. If a decompressed sprite or string table has an odd length, a single null byte padding is preserved.

The drawing attached below details the exact offset traversal and pointer cascade we've implemented in the Hod codec.
