/* =========================================================================
   Home page. Every number on this page comes out of the same data files the
   project pages read, so the front door can't quietly go stale.
   ========================================================================= */

(function () {
  "use strict";

  const { $, esc, json, observe } = window.DNF;

  function setMeter(panel, pctValue) {
    const meter = $(".meter", panel);
    if (!meter) return;
    meter.style.setProperty("--p", String(pctValue));
    observe(panel);
  }

  function facts(el, rows) {
    if (!el) return;
    el.innerHTML = rows
      .map((r) => `<div><b>${esc(r[0])}</b><span>${esc(r[1])}</span></div>`)
      .join("");
  }

  (async function init() {
    const [hod, aots, lib] = await Promise.all([
      json("data/hod.json"),
      json("data/aots.json"),
      json("data/library.json"),
    ]);

    const lines = [];

    /* ------------------------------------------------------------ Hod */
    if (hod) {
      const panel = $("#panel-hod");
      const done = hod.track.reduce((n, t) => n + t.done, 0);
      const total = hod.track.reduce((n, t) => n + t.total, 0);
      const p = Math.round((done / total) * 100);

      $("[data-hod-label]").textContent = `${done} of ${total} jobs accepted`;
      $("[data-hod-pct]").textContent = `${p}%`;
      setMeter(panel, p);
      facts(
        $("[data-hod-facts]"),
        hod.stats.slice(0, 3).map((s) => [s.value, s.label])
      );
      lines.push(...hod.stats.slice(0, 4).map((s) => `${s.value} ${s.label}`));
    }

    /* ----------------------------------------------------------- AOTS -*/
    if (aots) {
      const panel = $("#panel-aots");
      const t = aots.totals;
      const p = (t.noted / t.episodes) * 100;

      $("[data-aots-label]").textContent = `${t.noted} of ${t.episodes.toLocaleString()} episodes written up`;
      $("[data-aots-pct]").textContent = `${p.toFixed(1)}%`;
      /* A true 2% bar is invisible, so give it a visible floor and say the
         real figure in the label right next to it. */
      setMeter(panel, Math.max(1.5, p));
      facts($("[data-aots-facts]"), [
        [String(t.noted), "episodes written up"],
        [String(t.people), "people logged"],
        [
          String(aots.years.filter((y) => y.noted).length),
          "years started",
        ],
      ]);
      lines.push(
        `${t.noted} Attack of the Show episodes written up`,
        `${t.people} guests, hosts and acts logged`,
        `${t.episodes.toLocaleString()} episodes in the reconstructed schedule`
      );
    }

    /* -------------------------------------------------------- library -*/
    if (lib) {
      const grid = $("#latest-notes");
      const latest = (lib.entries || []).slice(0, 3);
      grid.innerHTML = latest.length
        ? latest
            .map(
              (e) => `<a class="card tile" href="note.html?n=${encodeURIComponent(e.path)}" data-rise>
                <p class="eyebrow">${esc(e.section)}</p>
                <h3>${esc(e.title)}</h3>
                <p>${esc(e.summary || "")}</p>
                <span class="tile-go">Read</span>
              </a>`
            )
            .join("")
        : `<div class="empty"><p>Nothing published yet.</p></div>`;
      observe(grid);
      lines.push(
        `${lib.count} notes published · ${lib.words.toLocaleString()} words`
      );
    }

    /* ---------------------------------------------------------- ticker */
    const ticker = $("#ticker");
    if (ticker && lines.length) {
      ticker.innerHTML = lines.map((l) => `<span>${esc(l)}</span>`).join("");
      /* site.js already ran, so duplicate the content here for the loop. */
      ticker.append(...Array.from(ticker.children).map((n) => n.cloneNode(true)));
    }
  })();
})();
