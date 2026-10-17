/* Attack of the Show archive browser. */
(function () {
  "use strict";

  const { $, $$, esc, json, fail } = window.DNF;
  const yearsEl = $("#years");
  const segmentsEl = $("#segments");
  const listEl = $("#episodes");
  const summaryEl = $("#aots-summary");
  const searchEl = $("#ep-search");
  const contextEl = $("#year-context");
  const previewEl = $("#episode-preview");
  const fullViewEl = $("#episode-full-view");
  const explorerEl = $("#aots-explorer");
  if (!yearsEl || !listEl) return;

  const PAGE_SIZE = 24;
  const SEGMENT_PREVIEW_SIZE = 8;
  const PEOPLE_PREVIEW_SIZE = 14;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const TYPE_LABELS = { person: "Person", segment: "Segment", topic: "Topic", media: "Media" };

  let data = null;
  let state = { query: "", year: "", segment: "", tags: [], selected: "", full: false };
  let visibleCount = PAGE_SIZE;
  let showAllSegments = false;
  let showAllPeople = false;
  let catalogueScrollTop = 0;

  const clean = (value) => String(value || "").trim();
  const key = (value) => clean(value).toLocaleLowerCase();
  const same = (left, right) => key(left) === key(right);
  const pct = (count, total) => (total ? Math.max(0, Math.min(100, (count / total) * 100)) : 0);
  const dateValue = (note) => {
    const parts = (note.date || "").split("-").map(Number);
    return parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : null;
  };
  const formatDate = (note, long) => {
    const date = dateValue(note);
    if (!date || Number.isNaN(date.getTime())) return "Date not confirmed";
    return long
      ? date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
      : `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };
  const timeText = (time) => clean(time).replace(/^\[|\]$/g, "");

  function readUrl() {
    const params = new URLSearchParams(location.search);
    state = {
      query: params.get("q") || "",
      year: params.get("y") || "",
      segment: params.get("s") || "",
      tags: params.getAll("tag").map((entry) => {
        const at = entry.indexOf(":");
        return at > 0 ? { type: entry.slice(0, at), value: entry.slice(at + 1) } : null;
      }).filter((tag) => tag && TYPE_LABELS[tag.type] && tag.value),
      selected: params.get("ep") || "",
      full: params.get("view") === "full",
    };
  }

  function writeUrl(method) {
    const url = new URL(location.href);
    ["q", "y", "s", "tag", "ep", "view"].forEach((name) => url.searchParams.delete(name));
    if (state.query) url.searchParams.set("q", state.query);
    if (state.year) url.searchParams.set("y", state.year);
    if (state.segment) url.searchParams.set("s", state.segment);
    state.tags.forEach((tag) => url.searchParams.append("tag", `${tag.type}:${tag.value}`));
    if (state.selected) url.searchParams.set("ep", state.selected);
    if (state.full && state.selected) url.searchParams.set("view", "full");
    history[method]({ aotsArchive: true }, "", url);
  }

  function noteMatchesQuery(note) {
    if (!state.query) return true;
    const haystack = [
      note.title, note.date, note.summary,
      ...(note.hosts || []),
      ...(note.appearances || []).flatMap((person) => [person.name, person.role, person.topic, person.type]),
      ...(note.segments || []).flatMap((segment) => [segment.label, segment.franchise]),
      ...(note.topics || []).map((topic) => topic.label),
      ...(note.media || []).map((media) => media.title),
      ...(note.notable || []).map((item) => item.text),
    ].join(" ").toLocaleLowerCase();
    return state.query.toLocaleLowerCase().split(/\s+/).filter(Boolean).every((part) => haystack.includes(part));
  }

  function noteMatchesTag(note, tag) {
    switch (tag.type) {
      case "person":
        return (note.hosts || []).some((name) => same(name, tag.value)) ||
          (note.appearances || []).some((person) => same(person.name, tag.value));
      case "segment":
        return (note.segments || []).some((segment) => same(segment.label, tag.value) || same(segment.franchise, tag.value));
      case "topic":
        return (note.topics || []).some((topic) => same(topic.label, tag.value));
      case "media":
        return (note.media || []).some((media) => same(media.title, tag.value));
      default:
        return true;
    }
  }

  function matches(note, ignoreFacet) {
    if (!noteMatchesQuery(note)) return false;
    if (state.tags.some((tag) => !noteMatchesTag(note, tag))) return false;
    if (ignoreFacet !== "year" && state.year && note.year !== state.year) return false;
    if (ignoreFacet !== "segment" && state.segment && !(note.segments || []).some((segment) => same(segment.franchise, state.segment))) return false;
    return true;
  }

  function filteredNotes(ignoreFacet) {
    return data.notes.filter((note) => matches(note, ignoreFacet));
  }

  function renderSummary() {
    const totals = data.totals;
    const coverage = pct(totals.noted, totals.episodes).toFixed(1);
    summaryEl.innerHTML = `
      <div class="stat aots-stat" data-domain="episode"><b>${totals.noted.toLocaleString()}</b><span>episode notes indexed</span></div>
      <div class="stat aots-stat" data-domain="person"><b>${totals.people.toLocaleString()}</b><span>people and hosts logged</span></div>
      <div class="stat aots-stat" data-domain="segment"><b>${totals.segments.toLocaleString()}</b><span>recurring segments mapped</span></div>
      <div class="stat aots-stat aots-stat-coverage" data-domain="schedule"><b>${coverage}%</b><span>of ${totals.episodes.toLocaleString()} reconstructed schedule entries indexed</span></div>`;
  }

  function facetCounts(notes, selector) {
    const counts = new Map();
    for (const note of notes) {
      const value = selector(note);
      if (!value) continue;
      const normalized = key(value);
      const current = counts.get(normalized) || { value, count: 0 };
      current.count += 1;
      counts.set(normalized, current);
    }
    return counts;
  }

  function renderYears() {
    const notes = filteredNotes("year");
    const counts = facetCounts(notes, (note) => note.year);
    const hasNarrowing = !!(state.query || state.segment || state.tags.length);
    const rows = data.years.filter((year) => !hasNarrowing || counts.has(key(year.year)) || state.year === year.year);
    yearsEl.innerHTML = rows.map((year) => {
      const noted = counts.get(key(year.year))?.count || 0;
      const unknown = year.total === 0 && noted > 0;
      const selected = state.year === year.year;
      return `<button class="year aots-year${selected ? " is-selected" : ""}${unknown ? " is-unknown" : ""}" type="button" data-year="${esc(year.year)}" aria-pressed="${selected}" ${noted ? "" : "disabled"}>
        <span class="aots-year-top"><b>${esc(year.year)}</b><span>${noted} ${noted === 1 ? "note" : "notes"}</span></span>
        <span class="aots-year-meter" aria-hidden="true"><i style="--meter:${unknown ? 100 : pct(noted, year.total)}%"></i></span>
        <small>${year.total ? `${noted} / ${year.total} scheduled` : `${noted} indexed · schedule unknown`}</small>
      </button>`;
    }).join("") || `<p class="aots-facet-empty">No years match these filters.</p>`;
  }

  function segmentMap(notes) {
    const counts = new Map();
    for (const note of notes) {
      const used = new Set();
      for (const segment of note.segments || []) {
        const name = clean(segment.franchise);
        if (!name || used.has(key(name))) continue;
        used.add(key(name));
        const normalized = key(name);
        const current = counts.get(normalized) || { value: name, count: 0 };
        current.count += 1;
        counts.set(normalized, current);
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }

  function renderSegments() {
    const rows = segmentMap(filteredNotes("segment"));
    const total = segmentMap(data.notes).length;
    $("#segment-count").textContent = `${rows.length} of ${total}`;
    const limit = showAllSegments ? rows.length : SEGMENT_PREVIEW_SIZE;
    segmentsEl.innerHTML = rows.slice(0, limit).map((segment) => {
      const selected = same(segment.value, state.segment);
      return `<button class="aots-segment-card${selected ? " is-selected" : ""}" type="button" data-segment="${esc(segment.value)}" aria-pressed="${selected}">
        <span class="aots-segment-count">${segment.count}</span>
        <span class="aots-segment-name">${esc(segment.value)}</span>
        <span class="aots-segment-arrow" aria-hidden="true">↗</span>
      </button>`;
    }).join("") || `<p class="aots-facet-empty">No recurring segments match these filters.</p>`;
    const more = $("#more-segments");
    more.hidden = rows.length <= SEGMENT_PREVIEW_SIZE;
    more.textContent = showAllSegments ? "Show featured segments" : `Show all ${rows.length} segments`;
  }

  function peopleMap(notes) {
    const counts = new Map();
    for (const note of notes) {
      const used = new Set();
      const names = [
        ...(note.hosts || []),
        ...(note.appearances || []).map((person) => person.name),
      ];
      for (const raw of names) {
        const name = clean(raw);
        if (!name || used.has(key(name))) continue;
        used.add(key(name));
        const normalized = key(name);
        const current = counts.get(normalized) || { value: name, count: 0 };
        current.count += 1;
        counts.set(normalized, current);
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }

  function renderPeopleFacets() {
    const peopleEl = $("#people-facets");
    if (!peopleEl) return;
    const rows = peopleMap(filteredNotes());
    const total = peopleMap(data.notes).length;
    const countEl = $("#people-count");
    if (countEl) countEl.textContent = `${rows.length.toLocaleString()} of ${total.toLocaleString()}`;
    const limit = showAllPeople ? Math.min(rows.length, 48) : PEOPLE_PREVIEW_SIZE;
    peopleEl.innerHTML = rows.slice(0, limit).map((person) => {
      const selected = state.tags.some((tag) => tag.type === "person" && same(tag.value, person.value));
      return `<button class="aots-person-chip${selected ? " is-selected" : ""}" type="button" data-tag-type="person" data-tag-value="${esc(person.value)}" aria-pressed="${selected}">
        <span>${esc(person.value)}</span>
        <b>${person.count}</b>
      </button>`;
    }).join("") || `<p class="aots-facet-empty">No people match these filters.</p>`;
    const more = $("#more-people");
    if (more) {
      more.hidden = rows.length <= PEOPLE_PREVIEW_SIZE;
      more.textContent = showAllPeople ? "Show top people" : `Show top ${Math.min(rows.length, 48)} people`;
    }
  }

  function token(type, value, label) {
    const text = clean(label || value);
    if (!text) return "";
    const selected = state.tags.some((tag) => tag.type === type && same(tag.value, value));
    return `<button class="aots-token" data-domain="${esc(type)}" data-tag-type="${esc(type)}" data-tag-value="${esc(value)}" type="button" aria-pressed="${selected}" title="Filter by ${esc(TYPE_LABELS[type] || type)}: ${esc(value)}">${esc(text)}</button>`;
  }

  function renderActiveFilters() {
    const chips = [];
    if (state.year) chips.push(`<button class="aots-filter-chip" type="button" data-remove-filter="year">Year ${esc(state.year)} <span aria-hidden="true">×</span></button>`);
    if (state.segment) chips.push(`<button class="aots-filter-chip" type="button" data-remove-filter="segment">Segment ${esc(state.segment)} <span aria-hidden="true">×</span></button>`);
    state.tags.forEach((tag, index) => chips.push(`<button class="aots-filter-chip" type="button" data-remove-filter="tag" data-filter-index="${index}">${esc(TYPE_LABELS[tag.type] || tag.type)} ${esc(tag.value)} <span aria-hidden="true">×</span></button>`));
    const target = $("#active-filters");
    target.innerHTML = chips.join("");
    target.hidden = !chips.length;
    $("#clear-filters").hidden = !(state.query || state.year || state.segment || state.tags.length);
  }

  function resultMessage(notes) {
    const count = notes.length;
    const base = `${count.toLocaleString()} ${count === 1 ? "episode" : "episodes"}`;
    const suffix = state.query ? ` matching “${esc(state.query)}”` : " in the catalogue";
    const facets = [state.year, state.segment].filter(Boolean);
    contextEl.innerHTML = `${base}${suffix}${facets.length ? ` · ${facets.map(esc).join(" · ")}` : ""}${state.tags.length ? ` · ${state.tags.length} tag${state.tags.length === 1 ? "" : "s"}` : ""}`;
  }

  function renderNoteCard(note) {
    const selected = state.selected === note.id;
    const date = dateValue(note);
    const stamp = date ? `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}` : "Date not confirmed";
    const firstTags = [
      ...(note.appearances || []).slice(0, 1).map((person) => ({ type: "person", value: person.name })),
      ...(note.segments || []).filter((segment) => segment.franchise).slice(0, 1).map((segment) => ({ type: "segment", value: segment.franchise })),
      ...(note.topics || []).slice(0, 2).map((topic) => ({ type: "topic", value: topic.label })),
    ].slice(0, 4);
    return `<article class="aots-episode-row${selected ? " is-selected" : ""}" role="listitem">
      <button class="aots-episode-select" type="button" data-episode="${esc(note.id)}" aria-pressed="${selected}">
        <span class="aots-episode-date">${esc(stamp)}${note.dateInferred ? '<span class="aots-inferred" title="Date inferred from the episode filename">inferred</span>' : ""}</span>
        <span class="aots-episode-title">${esc(note.title)}</span>
        <span class="aots-episode-hosts">${note.hosts.length ? esc(note.hosts.join(" · ")) : "Hosts not logged"}</span>
        <span class="aots-episode-summary">${esc(note.summary || "No summary has been added yet.")}</span>
      </button>
      <span class="aots-token-row">${firstTags.map((tag) => token(tag.type, tag.value)).join("")}</span>
    </article>`;
  }

  function renderList() {
    let notes = filteredNotes();
    const selectedIndex = notes.findIndex((note) => note.id === state.selected);
    if (state.selected && selectedIndex === -1) {
      state.selected = "";
      state.full = false;
    } else if (selectedIndex >= visibleCount) {
      visibleCount = Math.ceil((selectedIndex + 1) / PAGE_SIZE) * PAGE_SIZE;
    }
    resultMessage(notes);
    const visible = notes.slice(0, visibleCount);
    listEl.innerHTML = visible.length
      ? visible.map(renderNoteCard).join("")
      : `<div class="aots-empty"><p class="eyebrow">No matches</p><h3>Try another trail.</h3><p>Clear a filter or search for a person, topic, piece of media, or recurring segment.</p><button class="textbtn" type="button" data-action="clear-filters">Clear search and filters</button></div>`;
    const more = $("#load-more");
    more.hidden = notes.length <= visible.length;
    more.textContent = `Show ${Math.min(PAGE_SIZE, notes.length - visible.length)} more episodes`;
    more.setAttribute("aria-label", `Show more episodes, ${notes.length - visible.length} remaining`);
  }

  function renderPeople(note) {
    const people = (note.appearances || []).map((person) => `<li class="aots-detail-item">
      <div class="aots-detail-copy">${token("person", person.name)}${person.type ? `<span class="aots-type" data-kind="${esc(person.type)}">${esc(person.type)}</span>` : ""}${person.role ? `<p>${esc(person.role)}</p>` : ""}${person.topic ? `<p>${esc(person.topic)}</p>` : ""}</div>
      ${person.at ? `<span class="aots-time">${esc(timeText(person.at))}</span>` : ""}
    </li>`).join("");
    return people ? `<ul class="aots-detail-list">${people}</ul>` : `<p class="aots-muted">No appearances logged.</p>`;
  }

  function renderSegmentsList(note) {
    const segments = (note.segments || []).map((segment, index) => `<li class="aots-detail-item">
      <div class="aots-detail-copy"><span class="aots-sequence">${String(index + 1).padStart(2, "0")}</span>${token("segment", segment.franchise || segment.label, segment.label)}${segment.franchise && !same(segment.franchise, segment.label) ? token("segment", segment.franchise) : ""}</div>
      ${segment.at ? `<span class="aots-time">${esc(timeText(segment.at))}</span>` : ""}
    </li>`).join("");
    return segments ? `<ol class="aots-detail-list aots-run-list">${segments}</ol>` : `<p class="aots-muted">No run-of-show details logged.</p>`;
  }

  function renderTextItems(items, type, valueKey) {
    if (!items || !items.length) return `<p class="aots-muted">Nothing logged here yet.</p>`;
    return `<div class="aots-text-items">${items.map((item) => `<div class="aots-text-item">${token(type, item[valueKey])}${item.at ? `<span class="aots-time">${esc(timeText(item.at))}</span>` : ""}</div>`).join("")}</div>`;
  }

  function neighborControls(note) {
    const notes = filteredNotes();
    const index = notes.findIndex((item) => item.id === note.id);
    if (index === -1 || notes.length <= 1) return "";
    const prev = index > 0 ? notes[index - 1] : null;
    const next = index < notes.length - 1 ? notes[index + 1] : null;
    return `<div class="aots-step-nav" aria-label="Adjacent episodes in results">
      <button class="textbtn" type="button" data-episode="${prev ? esc(prev.id) : ""}" ${prev ? "" : "disabled"}>← Previous</button>
      <span class="mono">${index + 1} / ${notes.length}</span>
      <button class="textbtn" type="button" data-episode="${next ? esc(next.id) : ""}" ${next ? "" : "disabled"}>Next →</button>
    </div>`;
  }

  function detailsMarkup(note, full) {
    const notable = note.notable?.length
      ? `<section class="aots-detail-section"><h3>Worth remembering</h3><ul class="aots-notable-list">${note.notable.map((item) => `<li>${item.at ? `<span class="aots-time">${esc(timeText(item.at))}</span>` : ""}${esc(item.text)}</li>`).join("")}</ul></section>`
      : "";
    const hostTokens = (note.hosts || []).length
      ? `<div class="aots-detail-hosts"><span class="aots-hosts-label">Hosted by</span> ${note.hosts.map((host) => token("person", host)).join(" ")}</div>`
      : `<p class="aots-detail-hosts">Hosts not logged</p>`;
    return `<div class="aots-detail-content${full ? " is-full" : ""}">
      <div class="aots-detail-meta"><span>${esc(formatDate(note, true))}${note.dateInferred ? " · date inferred" : ""}</span>${note.epNo ? `<span>Episode ${esc(note.epNo)}</span>` : ""}</div>
      <h2>${esc(note.title)}</h2>
      ${hostTokens}
      <p class="aots-detail-summary">${esc(note.summary || "No summary has been added yet.")}</p>
      ${notable}
      <div class="aots-detail-grid">
        <section class="aots-detail-section"><h3>Who turned up</h3>${renderPeople(note)}</section>
        <section class="aots-detail-section"><h3>Run of show</h3>${renderSegmentsList(note)}</section>
        <section class="aots-detail-section"><h3>Topics</h3>${renderTextItems(note.topics, "topic", "label")}</section>
        <section class="aots-detail-section"><h3>Media covered</h3>${renderTextItems(note.media, "media", "title")}</section>
      </div>
      <p class="aots-detail-foot">Timestamps point into the episode. This archive publishes notes and indexing details, not transcripts or video.</p>
    </div>`;
  }

  function renderPreview() {
    const note = data.notes.find((item) => item.id === state.selected);
    explorerEl.classList.toggle("has-selection", !!note);
    if (!note) {
      previewEl.innerHTML = `<div class="aots-preview-empty"><span class="aots-preview-mark" aria-hidden="true">↗</span><p class="eyebrow">Episode preview</p><h3>Choose a story</h3><p>Select an episode from the catalogue to see its people, segments, and timestamps.</p></div>`;
      return;
    }
    previewEl.innerHTML = `<div class="aots-preview-top"><span class="eyebrow">Episode preview</span>${neighborControls(note)}<button class="textbtn aots-close-preview" type="button" data-action="close-preview" aria-label="Close episode preview">Close <span aria-hidden="true">×</span></button></div>
      ${detailsMarkup(note, false)}
      <button class="btn btn-quiet aots-open-full" type="button" data-action="open-full">Open full notes <span aria-hidden="true">↗</span></button>`;
  }

  function renderFullView() {
    const note = data.notes.find((item) => item.id === state.selected);
    if (!state.full || !note) {
      document.body.classList.remove("aots-full-open");
      fullViewEl.hidden = true;
      fullViewEl.innerHTML = "";
      return;
    }
    document.body.classList.add("aots-full-open");
    fullViewEl.hidden = false;
    fullViewEl.innerHTML = `<div class="aots-full-toolbar"><button class="aots-back-button" type="button" data-action="back-full"><span aria-hidden="true">←</span> Back to catalogue</button>${neighborControls(note)}<span>${esc(formatDate(note, true))}</span></div>${detailsMarkup(note, true)}`;
  }

  function renderAll() {
    if (searchEl) searchEl.value = state.query;
    renderSummary();
    renderYears();
    renderSegments();
    renderPeopleFacets();
    renderActiveFilters();
    renderList();
    renderPreview();
    renderFullView();
    if (state.full) {
      fullViewEl.querySelector("[data-action='back-full']")?.focus({ preventScroll: true });
    }
  }

  function resetPaging() {
    visibleCount = PAGE_SIZE;
    listEl.scrollTop = 0;
  }

  function clearFilters() {
    state.query = "";
    state.year = "";
    state.segment = "";
    state.tags = [];
    state.selected = "";
    state.full = false;
    resetPaging();
    writeUrl("pushState");
    renderAll();
  }

  function toggleTag(type, value) {
    const index = state.tags.findIndex((tag) => tag.type === type && same(tag.value, value));
    if (index >= 0) state.tags.splice(index, 1);
    else state.tags.push({ type, value });
    state.selected = "";
    state.full = false;
    resetPaging();
    writeUrl("pushState");
    renderAll();
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target || target.disabled) return;

    if (target.matches(".aots-year")) {
      state.year = state.year === target.dataset.year ? "" : target.dataset.year;
      state.selected = "";
      state.full = false;
      resetPaging();
      writeUrl("pushState");
      renderAll();
      return;
    }
    if (target.matches(".aots-segment-card")) {
      state.segment = same(state.segment, target.dataset.segment) ? "" : target.dataset.segment;
      state.selected = "";
      state.full = false;
      resetPaging();
      writeUrl("pushState");
      renderAll();
      return;
    }
    if (target.matches(".aots-token, .aots-person-chip")) {
      toggleTag(target.dataset.tagType, target.dataset.tagValue);
      return;
    }
    if (target.dataset.episode) {
      const keepFull = state.full && !target.matches(".aots-episode-select");
      state.selected = target.dataset.episode;
      state.full = keepFull;
      writeUrl("pushState");
      renderAll();
      if (!keepFull && matchMedia("(max-width: 760px)").matches) {
        previewEl.scrollIntoView({ block: "start", behavior: "smooth" });
      }
      return;
    }
    if (target.id === "load-more") {
      visibleCount += PAGE_SIZE;
      renderList();
      return;
    }
    if (target.id === "more-segments") {
      showAllSegments = !showAllSegments;
      renderSegments();
      return;
    }
    if (target.id === "more-people") {
      showAllPeople = !showAllPeople;
      renderPeopleFacets();
      return;
    }
    if (target.id === "clear-filters" || target.dataset.action === "clear-filters") {
      clearFilters();
      if (searchEl) searchEl.focus();
      return;
    }
    if (target.dataset.removeFilter) {
      if (target.dataset.removeFilter === "year") state.year = "";
      else if (target.dataset.removeFilter === "segment") state.segment = "";
      else if (target.dataset.removeFilter === "tag") state.tags.splice(Number(target.dataset.filterIndex), 1);
      state.selected = "";
      state.full = false;
      resetPaging();
      writeUrl("pushState");
      renderAll();
      return;
    }
    if (target.dataset.action === "open-full") {
      catalogueScrollTop = listEl.scrollTop;
      state.full = true;
      writeUrl("pushState");
      renderFullView();
      fullViewEl.scrollIntoView({ block: "start" });
      fullViewEl.querySelector("[data-action='back-full']")?.focus({ preventScroll: true });
      return;
    }
    if (target.dataset.action === "back-full") {
      state.full = false;
      writeUrl("replaceState");
      renderAll();
      listEl.scrollTop = catalogueScrollTop;
      previewEl.scrollIntoView({ block: "nearest" });
      return;
    }
    if (target.dataset.action === "close-preview") {
      state.selected = "";
      state.full = false;
      writeUrl("pushState");
      renderAll();
    }
  });

  if (searchEl) {
    let timer;
    searchEl.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.query = searchEl.value.trim();
        resetPaging();
        if (!filteredNotes().some((note) => note.id === state.selected)) {
          state.selected = "";
          state.full = false;
        }
        writeUrl("replaceState");
        renderAll();
      }, 100);
    });
  }

  function normalizeSelection() {
    if (!data) return;
    if (state.year && !data.years.some((year) => year.year === state.year)) state.year = "";
    if (state.selected) {
      const match = data.notes.find((note) => note.id === state.selected || note.date === state.selected);
      state.selected = match ? match.id : "";
    }
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.full) {
      state.full = false;
      writeUrl("replaceState");
      renderAll();
      listEl.scrollTop = catalogueScrollTop;
      previewEl.scrollIntoView({ block: "nearest" });
    }
  });

  window.addEventListener("popstate", () => {
    readUrl();
    normalizeSelection();
    resetPaging();
    renderAll();
  });

  (async function init() {
    data = await json("data/aots.json");
    if (!data) {
      fail(listEl, "Couldn't load the episode notes. Try a refresh.");
      return;
    }
    const stamp = $("#aots-stamp");
    if (stamp) stamp.textContent = `Updated ${new Date(`${data.generated}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`;
    readUrl();
    normalizeSelection();
    renderAll();
    if (state.selected && !state.full) {
      listEl.querySelector(".aots-episode-row.is-selected")?.scrollIntoView({ block: "nearest" });
    }
  })();
})();
