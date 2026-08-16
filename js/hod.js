/* =========================================================================
   Hod — the project panel. Renders data/hod.json: stats, the track, the
   early-dev gallery. Less is more here, so it's mostly one screen of
   numbers and one screen of pictures.
   ========================================================================= */

(function () {
  "use strict";

  const { $, esc, json, observe, fail } = window.DNF;

  const statsEl = $("#hod-stats");
  const trackEl = $("#hod-track");
  const shotsEl = $("#hod-shots");
  const recentEl = $("#hod-recent");
  const pillarsEl = $("#hod-pillars");
  if (!statsEl && !trackEl && !shotsEl) return;

  const LABEL = { done: "done", here: "in motion", ahead: "ahead", shelf: "shelved" };

  (async function init() {
    const d = await json("data/hod.json");
    if (!d) {
      fail(trackEl || statsEl, "Couldn't load the Hod snapshot.");
      return;
    }

    if (statsEl) {
      statsEl.innerHTML = d.stats
        .map((s) => `<div class="stat"><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`)
        .join("");
    }

    if (pillarsEl) {
      pillarsEl.innerHTML = d.pillars
        .map(
          (p) => `<article class="card">
            <p class="eyebrow">${esc(p.eyebrow)}</p>
            <p style="margin:0">${esc(p.body)}</p>
          </article>`
        )
        .join("");
    }

    if (trackEl) {
      trackEl.innerHTML = d.track
        .map((t) => {
          const p = t.total ? Math.round((t.done / t.total) * 100) : 0;
          return `<div class="track-item" data-state="${esc(t.state)}">
            <div class="track-head">
              <h4>${esc(t.phase)}</h4>
              <span class="pill ${esc(t.state)}">${LABEL[t.state] || esc(t.state)}</span>
            </div>
            <p class="track-note">${esc(t.note)}</p>
            <div class="meter-row">
              <span class="stamp">${t.done} of ${t.total}</span>
              <span class="stamp">${p}%</span>
              <span class="meter${t.state === "done" ? " done" : ""}" style="--p:${p}"><i></i></span>
            </div>
          </div>`;
        })
        .join("");
      observe(trackEl);
    }

    if (recentEl) {
      recentEl.innerHTML = d.recent
        .map((line) => `<li>${esc(line)}</li>`)
        .join("");
    }

    if (shotsEl) {
      shotsEl.innerHTML = d.gallery
        .map(
          (g) => `<button class="shot" type="button" data-shot
              data-full="assets/web/hod/${esc(g.file)}.webp"
              data-title="${esc(g.title)}"
              data-caption="${esc(g.caption)}">
            <span class="shot-img">
              <img src="assets/web/hod/${esc(g.file)}-thumb.webp" alt="${esc(g.title)} — screenshot" loading="lazy" width="560" height="420">
            </span>
            <span class="shot-cap">
              <strong>${esc(g.title)}</strong>
              <span>${esc(g.caption)}</span>
            </span>
          </button>`
        )
        .join("");
      observe(shotsEl);
    }

    const stamp = $("#hod-stamp");
    if (stamp) stamp.textContent = `Snapshot ${d.snapshot} · ${d.status}`;
  })();
})();
