/* =========================================================================
   Attack of the Show — the notes panel.

   Reads data/aots.json (written by tools/sync-aots.py). Only the notes I've
   actually written are in that file; the year bars measure them against the
   reconstructed broadcast schedule, so an empty year looks empty.
   ========================================================================= */

(function () {
  "use strict";

  const { $, $$, esc, json, observe, fail } = window.DNF;

  const yearsEl = $("#years");
  const listEl = $("#episodes");
  const summaryEl = $("#aots-summary");
  const searchEl = $("#ep-search");
  const contextEl = $("#year-context");
  if (!yearsEl || !listEl) return;

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let data = null;
  let year = null;
  let query = "";

  function pct(noted, total) {
    if (!total) return 0;
    return Math.max(1.5, Math.min(100, (noted / total) * 100));
  }

  function renderSummary() {
    const t = data.totals;
    summaryEl.innerHTML = `
      <div class="stat"><b>${t.noted}</b><span>episodes written up</span></div>
      <div class="stat"><b>${t.episodes.toLocaleString()}</b><span>episodes in the reconstructed schedule</span></div>
      <div class="stat"><b>${t.people}</b><span>guests, hosts and acts logged</span></div>
      <div class="stat"><b>${((t.noted / t.episodes) * 100).toFixed(1)}%</b><span>of the run covered so far</span></div>`;
  }

  function renderYears() {
    yearsEl.innerHTML = "";
    data.years.forEach((y) => {
      const btn = document.createElement("button");
      btn.className = "year";
      btn.type = "button";
      btn.dataset.year = y.year;
      btn.setAttribute("aria-pressed", String(y.year === year));
      btn.disabled = y.noted === 0;
      /* A year with notes but no verified episode count has no denominator
         to draw against — hatch the trough rather than show a bar at zero,
         which would read as "nothing done here". */
      const unknown = y.total === 0 && y.noted > 0;
      const state = unknown ? " unknown" : y.noted === 0 ? " empty" : "";
      btn.innerHTML = `
        <b>${y.year}</b>
        <small>${y.noted} / ${y.total || "?"}</small>
        <span class="meter${state}" style="--p:${unknown ? 100 : pct(y.noted, y.total)}"><i></i></span>`;
      btn.title = y.total
        ? `${y.noted} of ${y.total} episodes written up`
        : `${y.noted} written up — the ${y.year} schedule hasn't been reconstructed yet`;
      yearsEl.append(btn);
    });
    observe(yearsEl);
  }

  function matches(note) {
    if (!query) return true;
    const hay = [
      note.title,
      note.date,
      note.summary,
      note.notable,
      note.hosts.join(" "),
      note.topics.join(" "),
      note.segments.join(" "),
      note.media.join(" "),
      note.appearances.map((a) => `${a.name} ${a.role} ${a.topic}`).join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return query.split(/\s+/).every((word) => hay.includes(word));
  }

  function block(label, items) {
    if (!items.length) return "";
    return `<div><p class="ep-sub">${label}</p>${items}</div>`;
  }

  function renderNote(note) {
    const d = new Date(note.date + "T00:00:00");
    const people = note.appearances.length
      ? `<ul class="ep-list">${note.appearances
          .map(
            (a) => `<li>
              ${a.at ? `<span class="at">${esc(a.at)}</span>` : ""}
              <span class="kind" data-k="${esc(a.type)}">${esc(a.type)}</span>
              <span class="who">${esc(a.name)}</span>
              ${a.role ? `<span class="role"> — ${esc(a.role)}</span>` : ""}
              ${a.topic ? `<div class="role">${esc(a.topic)}</div>` : ""}
            </li>`
          )
          .join("")}</ul>`
      : "";

    const segs = note.segments.length
      ? `<ul class="ep-list ep-seg">${note.segments
          .map((s) => `<li><span>${esc(s)}</span></li>`)
          .join("")}</ul>`
      : "";

    const chips = (arr) =>
      arr.length
        ? `<div class="chiprow">${arr.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>`
        : "";

    return `
      <article class="ep" id="ep-${note.date}" data-date="${note.date}">
        <button class="ep-head" type="button" aria-expanded="false">
          <span class="ep-date"><b>${d.getDate()}</b>${MONTHS[d.getMonth()]} ${note.year}</span>
          <span class="ep-title">
            <h3>${esc(note.title)}</h3>
            <p class="ep-hosts">${note.hosts.length ? esc(note.hosts.join(" · ")) : "Hosts not logged"}</p>
          </span>
          <span class="ep-open">${note.epNo ? `#${esc(note.epNo)}` : "Notes"}</span>
        </button>
        <div class="ep-body">
          <p>${esc(note.summary)}</p>
          ${note.notable ? `<p class="ep-note"><strong>Worth remembering.</strong> ${esc(note.notable)}</p>` : ""}
          <div class="ep-grid">
            ${block("Who turned up", people)}
            ${block("Run of show", segs)}
          </div>
          <div class="ep-grid">
            ${block("Topics", chips(note.topics))}
            ${block("Media covered", chips(note.media))}
          </div>
        </div>
      </article>`;
  }

  function renderList() {
    const notes = data.notes.filter((n) => n.year === year && matches(n));
    const yearRow = data.years.find((y) => y.year === year) || { noted: 0, total: 0 };

    if (contextEl) {
      contextEl.innerHTML = yearRow.total
        ? `<span class="mono">${yearRow.noted}</span> of <span class="mono">${yearRow.total}</span> ${year} episodes written up${query ? ` — <span class="mono">${notes.length}</span> match “${esc(query)}”` : ""}.`
        : `<span class="mono">${yearRow.noted}</span> written up. The canonical ${year} schedule hasn't been reconstructed yet, so there's no total to measure against.`;
    }

    if (!notes.length) {
      listEl.innerHTML = query
        ? `<div class="empty"><p>Nothing in ${esc(year)} matches “${esc(query)}”.</p></div>`
        : `<div class="empty"><p>No notes for ${esc(year)} yet.</p></div>`;
      return;
    }

    listEl.innerHTML = notes.map(renderNote).join("");
  }

  function selectYear(next, push) {
    year = next;
    $$(".year", yearsEl).forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.year === year))
    );
    renderList();
    if (push) {
      const url = new URL(location.href);
      url.searchParams.set("y", year);
      url.searchParams.delete("ep");
      history.replaceState(null, "", url);
    }
  }

  function openEpisode(date) {
    const el = $(`#ep-${date}`);
    if (!el) return;
    el.classList.add("open");
    $(".ep-head", el).setAttribute("aria-expanded", "true");
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  yearsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".year");
    if (btn && !btn.disabled) selectYear(btn.dataset.year, true);
  });

  listEl.addEventListener("click", (e) => {
    const head = e.target.closest(".ep-head");
    if (!head) return;
    const ep = head.closest(".ep");
    const open = ep.classList.toggle("open");
    head.setAttribute("aria-expanded", String(open));
  });

  if (searchEl) {
    let timer;
    searchEl.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        query = searchEl.value.trim().toLowerCase();
        renderList();
      }, 120);
    });
  }

  (async function init() {
    data = await json("data/aots.json");
    if (!data) {
      fail(listEl, "Couldn't load the episode notes. Try a refresh.");
      return;
    }

    renderSummary();

    const params = new URLSearchParams(location.search);
    const wanted = params.get("ep");
    const withNotes = data.years.filter((y) => y.noted > 0);
    year =
      (wanted && wanted.slice(0, 4)) ||
      params.get("y") ||
      (withNotes.length ? withNotes[0].year : data.years[0].year);
    if (!data.years.some((y) => y.year === year && y.noted)) {
      year = withNotes.length ? withNotes[0].year : data.years[0].year;
    }

    renderYears();
    renderList();
    /* renderList is synchronous, so the episode is already in the DOM. Don't
       defer this on rAF — that never fires in a background tab, and a shared
       ?ep= link would land collapsed. */
    if (wanted) openEpisode(wanted);

    const stamp = $("#aots-stamp");
    if (stamp) stamp.textContent = `Synced ${data.generated}`;
  })();
})();
