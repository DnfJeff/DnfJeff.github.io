# Attack of the Show Archive Browse Experience

## Status

Approved design, 2026-10-16.

## Goal

Turn the Attack of the Show project page into an inviting, useful archive browser. Visitors should be able to understand the project’s coverage, browse by year and recurring segment, and find episodes through people, topics, and media while staying within the personal site’s existing visual language.

## Source data and publishing boundary

- Generate the site dataset from the current local episode-note catalog and reconstructed broadcast schedule.
- Read the schema v2 note shapes, including timestamped objects for appearances, segments, topics, media, and notable moments. Continue tolerating legacy values when encountered.
- Resolve missing or placeholder air dates from episode filenames when possible. Keep unresolved records identifiable instead of inventing dates.
- Publish only authored summaries and structured index information. Never copy transcripts, raw subtitle text, video, or private pipeline data into the site dataset.
- Keep counts honest: distinguish authored notes from schedule totals, and explain years whose schedule denominator has not been reconstructed.

## Page structure

1. **Project introduction and coverage summary.** Keep the current title and short archival purpose statement. Present current note count, people indexed, and coverage against the known schedule in compact, responsive cards.
2. **Browse bento.** Provide year cards with notes-versus-schedule progress and segment cards with episode counts. Cards act as filters. A search or active filter should update the visible year and segment cards as well as the catalogue, so every part of the browse surface reflects the current result set. Include a clear reset action and a useful empty state.
3. **Episode catalogue.** Place search and active filters immediately above a scrollable, date-ordered catalogue. Episode rows show date, title, host names, a short summary, and a small set of typed tags. Use a bounded initial result batch with an explicit way to reveal more so a large catalog remains easy to scan.
4. **Episode preview.** Selecting a catalogue row opens a detail preview to the right on wide screens while retaining the scrollable catalogue. The preview includes the full summary, appearances, run of show, topics, media, and notable moments. Each timestamp is visible and associated with its item.
5. **Full episode reading view.** A clear action expands the selected preview into a focused full view. Provide a prominent back arrow that returns to the prior catalogue state, including search, filters, scroll position, and selected result when possible. On narrow screens, use the same forward/back flow as a single-column view rather than squeezing the split layout.

## Search, filters, and tags

- Search matches episode title, summary, hosts, appearance names and roles, segment labels and franchises, topics, media, and notable text.
- Search terms combine as AND conditions; matching is case-insensitive and updates without a submit step.
- Year, segment/franchise, person, topic, and media tags are available as filters. Clicking a tag applies its matching filter. Active filters appear as removable chips, with a one-action clear-all control.
- Search and filter results drive the episode catalogue and the bento cards together. Counts shown on cards reflect the current result set; global collection totals remain clearly identified as totals.
- Use restrained semantic colors for data domains (people, recurring segments, topics, and media), paired with text labels and existing site colors. Color is never the only way to distinguish a category.
- Preserve useful episode selection and filter state in the URL so an archive view can be shared or restored through browser back/forward navigation.

## Visual and interaction direction

- Reuse the shared header, footer, typography, spacing, color tokens, cards, and responsive breakpoints from the current site.
- Make the bento layout feel like part of DNF’s site rather than a separate application; use varied card sizes only where they create useful hierarchy.
- Keep keyboard access, visible focus, semantic controls, accessible names, and reduced-motion behavior consistent with the existing site.
- On small screens, stack overview cards, keep catalogue rows readable, and allow the selected episode detail to open as a dedicated view with a back arrow.

## Scope

Update the AOTS page, its page-specific JavaScript and styles as needed, the dataset synchronization script, and the generated public dataset. Do not redesign the site-wide navigation or change the local transcription/mining application.

## Acceptance criteria

- The generated site data reflects the current note catalog and has a fresh generated date.
- Schema v2 details appear in the site, including timestamped segments, topics, media, appearances, and notable entries.
- Year and segment bento cards are browsable, filterable, and synchronized with search results.
- Search and tags find the same records across all supported metadata domains.
- Catalogue selection opens a right-side preview on wide screens and a back-navigable detail view on narrow screens.
- Opening a full episode view and returning preserves the user's browse context.
- Existing shared site styling remains intact, and the page works without exposing transcripts or media files.
