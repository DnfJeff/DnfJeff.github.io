/* =========================================================================
   Writing & notes.

   One flat stream over data/library.json. The folder structure survives as
   filter chips instead of being a wall you have to click through first —
   land on the page and you're already looking at everything.
   ========================================================================= */

(function () {
  "use strict";

  const { $, $$, esc, json, observe, fail } = window.DNF;

  const listEl = $("#note-list");
  const filterEl = $("#note-filters");
  const searchEl = $("#note-search");
  const countEl = $("#note-count");
  if (!listEl) return;

  let entries = [];
  let section = "All";
  let query = "";

  const fmtDate = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  };

  const readTime = (words) => `${Math.max(1, Math.round(words / 220))} min read`;

  function visible() {
    return entries.filter((e) => {
      if (section !== "All" && e.section !== section) return false;
      if (!query) return true;
      const hay = `${e.title} ${e.summary} ${e.tags.join(" ")} ${e.section}`.toLowerCase();
      return query.split(/\s+/).every((w) => hay.includes(w));
    });
  }

  function render() {
    const rows = visible();
    if (countEl) {
      countEl.textContent = rows.length
        ? `${rows.length} ${rows.length === 1 ? "note" : "notes"}`
        : "nothing here";
    }

    if (!rows.length) {
      listEl.innerHTML = `<div class="empty"><p>Nothing matches that yet.${
        query ? ` <button class="chip" data-clear type="button">Clear the search</button>` : ""
      }</p></div>`;
      return;
    }

    listEl.innerHTML = rows
      .map(
        (e) => `<a class="card tile notecard" href="note.html?n=${encodeURIComponent(e.path)}" data-rise>
          <span class="notecard-top">
            <span class="dot"></span>${esc(e.section)}
            <span aria-hidden="true">·</span>${esc(fmtDate(e.updated))}
            <span aria-hidden="true">·</span>${readTime(e.words)}
          </span>
          <h3>${esc(e.title)}</h3>
          ${e.summary ? `<p>${esc(e.summary)}</p>` : ""}
          <span class="tagline-tags">${e.tags
            .slice(1)
            .map((t) => `<span class="tag">${esc(t)}</span>`)
            .join("")}</span>
          <span class="tile-go">Read</span>
        </a>`
      )
      .join("");
    observe(listEl);
  }

  function renderFilters(sections) {
    if (!filterEl) return;
    const all = [{ name: "All", count: entries.length }].concat(sections);
    filterEl.innerHTML = all
      .map(
        (s) =>
          `<button class="chip" type="button" data-section="${esc(s.name)}" aria-pressed="${s.name === section}">${esc(
            s.name
          )} <span class="mono">${s.count}</span></button>`
      )
      .join("");
  }

  if (filterEl) {
    filterEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-section]");
      if (!btn) return;
      section = btn.dataset.section;
      $$("[data-section]", filterEl).forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.section === section))
      );
      render();
    });
  }

  if (searchEl) {
    let timer;
    searchEl.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        query = searchEl.value.trim().toLowerCase();
        render();
      }, 110);
    });
  }

  listEl.addEventListener("click", (e) => {
    if (!e.target.closest("[data-clear]")) return;
    e.preventDefault();
    query = "";
    if (searchEl) searchEl.value = "";
    render();
  });

  (async function init() {
    const d = await json("data/library.json");
    if (!d) {
      fail(listEl, "Couldn't load the library index.");
      return;
    }
    entries = d.entries || [];
    renderFilters(d.sections || []);
    render();

    const stamp = $("#lib-stamp");
    if (stamp) {
      stamp.textContent = `${d.count} notes · ${d.words.toLocaleString()} words · indexed ${d.generated}`;
    }
  })();
})();
