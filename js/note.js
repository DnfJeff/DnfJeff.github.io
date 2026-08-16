/* =========================================================================
   Note reader. Loads one file out of notes/ and renders it into the page.

   Notes ship with the site now, so this is a plain relative fetch — no
   GitHub API, no rate limit, works offline once the page is cached.
   ========================================================================= */

(function () {
  "use strict";

  const { $, esc, json, fail } = window.DNF;

  const bodyEl = $("#note-body");
  if (!bodyEl) return;

  const titleEl = $("#note-title");
  const metaEl = $("#note-meta");
  const tagsEl = $("#note-tags");
  const crumbEl = $("#note-crumb");
  const pagerEl = $("#note-pager");
  const tocEl = $("#note-toc");

  const params = new URLSearchParams(location.search);
  const path = params.get("n") || "";

  /* Only ever load something inside notes/ — no traversal, no absolute URLs. */
  function safe(p) {
    return (
      /^notes\/[\w \-./()]+\.(html|md)$/i.test(p) &&
      !p.includes("..") &&
      !p.includes("//")
    );
  }

  /* ------------------------------------------------------------ markdown */

  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, (_, c) => `<code>${esc(c)}</code>`)
      .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|\W)\*(?!\s)(.+?)(?<!\s)\*/g, "$1<em>$2</em>")
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
        const external = /^https?:/i.test(href);
        return `<a href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ""}>${text}</a>`;
      });
  }

  function markdown(md) {
    const out = [];
    const lines = md.replace(/\r\n?/g, "\n").split("\n");
    let i = 0;

    const listItem = (text) =>
      `<li>${inline(
        text.replace(/^\[([ xX])\]\s*/, (_, c) =>
          `<input type="checkbox" disabled${c.toLowerCase() === "x" ? " checked" : ""}> `
        )
      )}</li>`;

    while (i < lines.length) {
      const line = lines[i];

      if (/^\s*<!--/.test(line)) {
        while (i < lines.length && !/-->/.test(lines[i])) i++;
        i++;
        continue;
      }

      if (/^```/.test(line)) {
        const fence = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) fence.push(lines[i++]);
        i++;
        out.push(`<pre><code>${esc(fence.join("\n"))}</code></pre>`);
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        const level = Math.min(heading[1].length + 1, 6);
        out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
        i++;
        continue;
      }

      if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
        out.push("<hr>");
        i++;
        continue;
      }

      /* table: a header row, a |---| divider, then body rows */
      if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[-:\s|]+\|\s*$/.test(lines[i + 1] || "")) {
        const cells = (row) =>
          row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
        out.push(
          `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>` +
            `<tbody>${rows
              .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
              .join("")}</tbody></table>`
        );
        continue;
      }

      if (/^\s*>/.test(line)) {
        const quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          quote.push(lines[i++].replace(/^\s*>\s?/, ""));
        }
        out.push(`<blockquote>${markdown(quote.join("\n"))}</blockquote>`);
        continue;
      }

      const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
      const number = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (bullet || number) {
        const tag = bullet ? "ul" : "ol";
        const re = bullet ? /^\s*[-*+]\s+(.*)$/ : /^\s*\d+[.)]\s+(.*)$/;
        const items = [];
        while (i < lines.length) {
          const m = lines[i].match(re);
          if (m) {
            items.push(listItem(m[1]));
            i++;
          } else if (/^\s{2,}\S/.test(lines[i]) && items.length) {
            /* continuation line — fold it into the item above */
            items[items.length - 1] = items[items.length - 1].replace(
              /<\/li>$/,
              ` ${inline(lines[i].trim())}</li>`
            );
            i++;
          } else {
            break;
          }
        }
        out.push(`<${tag}>${items.join("")}</${tag}>`);
        continue;
      }

      if (!line.trim()) {
        i++;
        continue;
      }

      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(\s*[-*+>#]|\s*\d+[.)]|```|\s*\|)/.test(lines[i])) {
        para.push(lines[i++]);
      }
      if (para.length) out.push(`<p>${inline(para.join("\n")).replace(/\n/g, "<br>")}</p>`);
      else i++;
    }

    return out.join("\n");
  }

  /* ----------------------------------------------------------------- html */

  function fromHtml(text) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    doc
      .querySelectorAll("header, nav, footer, script, style, link, meta, title")
      .forEach((el) => el.remove());
    const main =
      doc.querySelector(".content") ||
      doc.querySelector(".main-content") ||
      doc.querySelector("main") ||
      doc.body;
    return main ? main.innerHTML : "";
  }

  /* ----------------------------------------------------------- checklists */

  /*
   * Half the library is completionist checklists written as "[ ] Max out all
   * skills". They were only ever text. Turn them into real checkboxes that
   * remember what you ticked, and put a progress bar at the top — a checklist
   * you can't tick is just a list.
   */
  function wireChecklist() {
    const boxes = [];
    bodyEl.querySelectorAll("li").forEach((li, i) => {
      const first = li.firstChild;
      if (!first || first.nodeType !== Node.TEXT_NODE) return;
      const m = first.nodeValue.match(/^\s*\[([ xX])\]\s*/);
      if (!m) return;

      first.nodeValue = first.nodeValue.slice(m[0].length);

      /* The row is a two-column flex, so everything that isn't the checkbox
         has to live inside one wrapper — otherwise inline <b>/<a> in the
         item each become their own flex item and break onto new lines. */
      const text = document.createElement("span");
      text.className = "checktext";
      while (li.firstChild) text.append(li.firstChild);

      const box = document.createElement("input");
      box.type = "checkbox";
      box.dataset.k = String(i);
      box.defaultChecked = m[1].toLowerCase() === "x";

      li.append(box, text);
      li.classList.add("checkitem");
      boxes.push(box);
    });

    if (boxes.length < 3) return;

    const key = `dnf-check:${path}`;
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(key) || "{}");
    } catch (e) {
      saved = {};
    }
    boxes.forEach((b) => {
      if (Object.prototype.hasOwnProperty.call(saved, b.dataset.k)) {
        b.checked = !!saved[b.dataset.k];
      }
    });

    const bar = document.createElement("div");
    bar.className = "card checkbar";
    bar.innerHTML = `
      <div class="meter-row">
        <span class="stamp" data-check-label></span>
        <button class="chip" type="button" data-check-reset>Reset</button>
        <span class="meter lit" style="--p:0"><i></i></span>
      </div>`;
    bodyEl.prepend(bar);

    const label = bar.querySelector("[data-check-label]");
    const meter = bar.querySelector(".meter");

    function sync(save) {
      const done = boxes.filter((b) => b.checked).length;
      label.textContent = `${done} of ${boxes.length} ticked off`;
      meter.style.setProperty("--p", String((done / boxes.length) * 100));
      meter.classList.toggle("done", done === boxes.length);
      if (!save) return;
      try {
        localStorage.setItem(
          key,
          JSON.stringify(
            boxes.reduce((acc, b) => ((acc[b.dataset.k] = b.checked), acc), {})
          )
        );
      } catch (e) {
        /* storage full or blocked — ticks just won't survive a reload */
      }
    }

    bodyEl.addEventListener("change", (e) => {
      if (e.target.matches('input[type="checkbox"]')) sync(true);
    });
    bar.querySelector("[data-check-reset]").addEventListener("click", () => {
      boxes.forEach((b) => (b.checked = false));
      sync(true);
    });
    sync(false);
  }

  /* -------------------------------------------------------- contents rail */

  function buildToc() {
    if (!tocEl) return;
    const heads = Array.from(bodyEl.querySelectorAll("h2, h3"));
    if (heads.length < 3) {
      tocEl.hidden = true;
      return;
    }
    tocEl.hidden = false;
    const used = new Set();
    tocEl.innerHTML =
      '<p class="eyebrow">On this page</p><ul>' +
      heads
        .map((h) => {
          let id =
            h.id ||
            h.textContent
              .trim()
              .toLowerCase()
              .replace(/[^\w]+/g, "-")
              .replace(/^-|-$/g, "") ||
            "section";
          let n = 2;
          while (used.has(id)) id = `${id}-${n++}`;
          used.add(id);
          h.id = id;
          return `<li${h.tagName === "H3" ? ' class="sub"' : ""}><a href="#${id}">${esc(
            h.textContent.trim()
          )}</a></li>`;
        })
        .join("") +
      "</ul>";
  }

  /* ----------------------------------------------------------------- init */

  (async function init() {
    if (!safe(path)) {
      fail(bodyEl, "That note reference doesn't look right.");
      if (titleEl) titleEl.textContent = "Note not found";
      return;
    }

    const index = await json("data/library.json");
    const entries = (index && index.entries) || [];
    const entry = entries.find((e) => e.path === path);
    const at = entries.indexOf(entry);

    if (entry) {
      document.title = `${entry.title} — DNF`;
      if (titleEl) titleEl.textContent = entry.title;
      if (crumbEl) crumbEl.textContent = entry.section;
      if (metaEl) {
        const mins = Math.max(1, Math.round(entry.words / 220));
        metaEl.textContent = `${entry.section} · updated ${entry.updated} · ${entry.words.toLocaleString()} words · ${mins} min read`;
      }
      if (tagsEl) {
        tagsEl.innerHTML = entry.tags
          .slice(1)
          .map((t) => `<span class="tag">${esc(t)}</span>`)
          .join("");
      }
    }

    let text;
    try {
      const res = await fetch(path, { cache: "no-cache" });
      if (!res.ok) throw new Error(String(res.status));
      text = await res.text();
    } catch (e) {
      fail(bodyEl, "Couldn't load that note. It may have moved.");
      return;
    }

    bodyEl.innerHTML = /\.md$/i.test(path) ? markdown(text) : fromHtml(text);

    /* Anything the note links relatively is relative to its own folder. */
    const base = path.slice(0, path.lastIndexOf("/") + 1);
    bodyEl.querySelectorAll("img[src], a[href]").forEach((el) => {
      const attr = el.tagName === "IMG" ? "src" : "href";
      const value = el.getAttribute(attr) || "";
      if (/^(https?:|mailto:|#|\/)/i.test(value) || !value) return;
      el.setAttribute(attr, base + value);
    });

    wireChecklist();
    buildToc();

    if (pagerEl && at > -1) {
      const link = (e, dir) =>
        e
          ? `<a class="card tile" href="note.html?n=${encodeURIComponent(e.path)}">
               <span class="eyebrow">${dir}</span>
               <h3 style="font-size:1.05rem;margin:0">${esc(e.title)}</h3>
             </a>`
          : "<div></div>";
      pagerEl.innerHTML = link(entries[at - 1], "Newer") + link(entries[at + 1], "Older");
    }
  })();
})();
