/* =========================================================================
   DNF — Dedicated Post Reader
   Loads one dispatch from data/feed.json, renders the full-bleed prose,
   attached drawings and media gallery, author addendums rail, and pager.
   ========================================================================= */

(function () {
  "use strict";

  const { $, $$, esc, json, observe, fail } = window.DNF;

  const bodyEl = $("#post-body");
  if (!bodyEl) return;

  const titleEl = $("#post-title");
  const metaEl = $("#post-meta");
  const crumbEl = $("#post-crumb");
  const projectEl = $("#post-project");
  const statusEl = $("#post-status");
  const tagsEl = $("#post-tags");
  const addendumsEl = $("#post-addendums-track");
  const libEl = $("#post-library-container");
  const gallerySection = $("#post-gallery-section");
  const galleryGrid = $("#post-gallery-grid");
  const pagerEl = $("#post-pager");
  const drawingModalEl = $("#drawing-modal");

  const params = new URLSearchParams(location.search);
  const postId = params.get("p") || "";

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
    if (!md) return "";
    const out = [];
    const lines = md.replace(/\r\n?/g, "\n").split("\n");
    let i = 0;

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
            items.push(`<li>${inline(m[1])}</li>`);
            i++;
          } else if (/^\s{2,}\S/.test(lines[i]) && items.length) {
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
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(\s*[-*+>#]|\s*\d+[.)]|```)/.test(lines[i])
      ) {
        para.push(lines[i++]);
      }
      if (para.length) {
        out.push(`<p>${inline(para.join("\n")).replace(/\n/g, "<br>")}</p>`);
      } else {
        i++;
      }
    }

    return out.join("\n");
  }

  /* ---------------------------------------------------- drawings & modal */

  let currentZoom = 1;
  let activeDrawingSvg = "";

  function openDrawingModal(title, caption, svgHtml) {
    if (!drawingModalEl) return;
    const titleEl = $("#drawing-modal-title");
    const capEl = $("#drawing-modal-cap");
    const canvasEl = $("#drawing-canvas");

    if (titleEl) titleEl.textContent = title || "Excalidraw Drawing";
    if (capEl) capEl.textContent = caption || "";
    if (canvasEl) {
      canvasEl.innerHTML = svgHtml || `<p class="soft">No drawing content.</p>`;
      currentZoom = 1;
      canvasEl.style.transform = `scale(${currentZoom})`;
    }

    drawingModalEl.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeDrawingModal() {
    if (!drawingModalEl) return;
    drawingModalEl.hidden = true;
    document.body.style.overflow = "";
  }

  /* ----------------------------------------------------------------- init */

  (async function init() {
    const data = await json("data/feed.json");
    if (!data || !data.posts) {
      fail(bodyEl, "Couldn't load dispatch data.");
      return;
    }

    const posts = data.posts;
    const post = posts.find((p) => p.id === postId) || posts[0];
    const at = posts.indexOf(post);

    if (!post) {
      fail(bodyEl, "That dispatch does not exist.");
      return;
    }

    document.title = `${post.title} — The Feed — DNF`;
    if (crumbEl) crumbEl.textContent = post.title;
    if (projectEl) projectEl.textContent = post.project;
    if (statusEl) {
      statusEl.textContent = post.status;
      statusEl.className = `pill ${post.status}`;
    }
    if (titleEl) titleEl.textContent = post.title;

    const words = post.body.split(/\s+/).filter(Boolean).length;
    const mins = Math.max(1, Math.round(words / 220));
    if (metaEl) {
      metaEl.textContent = `${post.project} · posted ${post.date} · ${words.toLocaleString()} words · ${mins} min read`;
    }

    if (tagsEl) {
      tagsEl.innerHTML = (post.tags || [])
        .map((t) => `<a href="feed.html" class="tag" style="text-decoration:none">${esc(t)}</a>`)
        .join(" ");
    }

    // Body
    bodyEl.innerHTML = markdown(post.body);

    // Addendums
    if (addendumsEl) {
      if (post.addendums && post.addendums.length) {
        addendumsEl.innerHTML = post.addendums
          .map(
            (a) => `
            <div class="addendum-item">
              <span class="addendum-date">${esc(a.date)}</span>
              <p class="addendum-note">${esc(a.note)}</p>
            </div>`
          )
          .join("");
      } else {
        addendumsEl.innerHTML = `<p class="soft" style="font-size:0.86rem;margin:0">No addendums logged for this dispatch yet.</p>`;
      }
    }

    // Library Interplay
    if (libEl) {
      if (post.linked_notes && post.linked_notes.length) {
        libEl.innerHTML = post.linked_notes
          .map(
            (n) => `
            <div class="card" style="padding:var(--s4);margin-bottom:var(--s4)">
              <div class="interplay-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--s1)">
                <span class="eyebrow" style="margin:0">From the Library · ${esc(n.section)}</span>
                <span class="stamp">${n.words ? `${n.words.toLocaleString()} words` : ""}</span>
              </div>
              <h4 style="margin:0 0 var(--s1)"><a href="note.html?n=${encodeURIComponent(n.path)}" style="color:inherit;text-decoration:none">${esc(n.title)}</a></h4>
              ${n.summary ? `<p class="soft" style="font-size:0.86rem;margin:0 0 var(--s2)">${esc(n.summary)}</p>` : ""}
              <a href="note.html?n=${encodeURIComponent(n.path)}" class="tile-go" style="margin:0">Read note in library →</a>
            </div>`
          )
          .join("");
      } else {
        libEl.innerHTML = "";
      }
    }

    // Full Gallery
    const atts = post.attachments || [];
    if (atts.length && gallerySection && galleryGrid) {
      gallerySection.hidden = false;
      galleryGrid.innerHTML = atts
        .map((att, idx) => {
          const isDrawing = att.type === "drawing" || (att.file && att.file.endsWith(".excalidraw"));
          const title = att.title || (isDrawing ? "Excalidraw Vector Drawing" : "Attached Image");
          const caption = att.caption || "";

          if (isDrawing) {
            return `
              <div class="attach-card is-drawing" role="button" tabindex="0" data-idx="${idx}">
                <div class="attach-preview" style="aspect-ratio: 16/10">
                  <span class="attach-badge">Vector Drawing</span>
                  ${att.svg_inline || ""}
                </div>
                <div class="attach-cap">
                  <strong>${esc(title)}</strong>
                  ${caption ? `<span>${esc(caption)}</span>` : ""}
                </div>
              </div>`;
          } else {
            return `
              <div class="attach-card" role="button" tabindex="0" data-idx="${idx}">
                <div class="attach-preview" style="aspect-ratio: 16/10">
                  <span class="attach-badge">Image</span>
                  <img src="${esc(att.file)}" alt="${esc(title)}" loading="lazy">
                </div>
                <div class="attach-cap">
                  <strong>${esc(title)}</strong>
                  ${caption ? `<span>${esc(caption)}</span>` : ""}
                </div>
              </div>`;
          }
        })
        .join("");

      galleryGrid.addEventListener("click", (e) => {
        const card = e.target.closest(".attach-card");
        if (!card) return;
        const idx = parseInt(card.dataset.idx, 10);
        const att = atts[idx];
        if (!att) return;

        const isDrawing = att.type === "drawing" || (att.file && att.file.endsWith(".excalidraw"));
        if (isDrawing) {
          openDrawingModal(att.title, att.caption, att.svg_inline);
        } else {
          const lb = $("#lightbox");
          if (lb) {
            const img = $("img", lb);
            const capEl = $("[data-lb-cap]", lb);
            const titleEl = $("[data-lb-title]", lb);
            if (img) img.src = att.file;
            if (titleEl) titleEl.textContent = att.title || "";
            if (capEl) capEl.textContent = att.caption || "";
            lb.hidden = false;
            document.body.style.overflow = "hidden";
          }
        }
      });
    }

    // Pager
    if (pagerEl && at > -1) {
      const link = (p, dir) =>
        p
          ? `<a class="card tile" href="post.html?p=${encodeURIComponent(p.id)}">
               <span class="eyebrow">${dir}</span>
               <h3 style="font-size:1.05rem;margin:0">${esc(p.title)}</h3>
               <span class="stamp">${esc(p.date)} · ${esc(p.project)}</span>
             </a>`
          : "<div></div>";
      pagerEl.innerHTML = link(posts[at - 1], "Newer Dispatch") + link(posts[at + 1], "Older Dispatch");
    }

    // Modal controls
    $("#zoom-in")?.addEventListener("click", () => {
      currentZoom = Math.min(currentZoom + 0.25, 3.5);
      const c = $("#drawing-canvas");
      if (c) c.style.transform = `scale(${currentZoom})`;
    });

    $("#zoom-out")?.addEventListener("click", () => {
      currentZoom = Math.max(currentZoom - 0.25, 0.5);
      const c = $("#drawing-canvas");
      if (c) c.style.transform = `scale(${currentZoom})`;
    });

    $("#zoom-reset")?.addEventListener("click", () => {
      currentZoom = 1;
      const c = $("#drawing-canvas");
      if (c) c.style.transform = `scale(${currentZoom})`;
    });

    $("[data-close-drawing]")?.addEventListener("click", closeDrawingModal);
    $("[data-lb-close]")?.addEventListener("click", () => {
      const lb = $("#lightbox");
      if (lb) {
        lb.hidden = true;
        document.body.style.overflow = "";
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeDrawingModal();
        const lb = $("#lightbox");
        if (lb && !lb.hidden) {
          lb.hidden = true;
          document.body.style.overflow = "";
        }
      }
    });
  })();
})();
