/* =========================================================================
   DNF — Dedicated Post Reader
   Loads one post from data/feed.json, renders the full prose,
   attached drawings and media gallery, author comments rail, and pager.
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

  /* ---------------------------------------------------- unified inspector modal */

  let currentZoom = 1;

  function updateZoom(newZoom) {
    currentZoom = Math.min(Math.max(newZoom, 0.4), 4.0);
    const canvasEl = $("#inspector-canvas");
    const zoomLabel = $("#inspector-zoom-level");
    if (canvasEl) canvasEl.style.transform = `scale(${currentZoom})`;
    if (zoomLabel) zoomLabel.textContent = `${Math.round(currentZoom * 100)}%`;
  }

  function openInspector(title, caption, type, content) {
    const modal = $("#inspector-modal");
    if (!modal) return;

    const titleEl = $("#inspector-title");
    const capEl = $("#inspector-cap");
    const badgeEl = $("#inspector-badge");
    const canvasEl = $("#inspector-canvas");

    if (titleEl) titleEl.textContent = title || (type === "drawing" ? "Vector Drawing" : "Image Capture");
    if (capEl) capEl.textContent = caption || "";
    if (badgeEl) {
      badgeEl.textContent = type === "drawing" ? "Vector Drawing" : "Image Capture";
      badgeEl.className = `attach-badge ${type === "drawing" ? "is-drawing" : "is-image"}`;
    }

    if (canvasEl) {
      if (type === "drawing") {
        canvasEl.innerHTML = content || `<p class="soft">No vector drawing content.</p>`;
      } else {
        canvasEl.innerHTML = `<img src="${esc(content)}" alt="${esc(title || 'Image')}">`;
      }
      updateZoom(1);
    }

    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeInspector() {
    const modal = $("#inspector-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
    const canvasEl = $("#inspector-canvas");
    if (canvasEl) canvasEl.innerHTML = "";
  }

  /* ----------------------------------------------------------------- init */

  (async function init() {
    const data = await json("data/feed.json");
    if (!data || !data.posts) {
      fail(bodyEl, "Couldn't load post data.");
      return;
    }

    const posts = data.posts;
    const post = posts.find((p) => p.id === postId) || posts[0];
    const at = posts.indexOf(post);

    if (!post) {
      fail(bodyEl, "That post does not exist.");
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

    // Author comments
    if (addendumsEl) {
      if (post.comments && post.comments.length) {
        addendumsEl.innerHTML = post.comments
          .map(
            (a) => `
            <div class="addendum-item">
              <span class="addendum-date">${esc(a.date)}</span>
              <p class="addendum-note">${esc(a.body)}</p>
            </div>`
          )
          .join("");
      } else {
        addendumsEl.innerHTML = `<p class="soft" style="font-size:0.86rem;margin:0">No comments on this post yet.</p>`;
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
                <div class="attach-preview" style="aspect-ratio: 16/10; pointer-events: none">
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
                <div class="attach-preview" style="aspect-ratio: 16/10; pointer-events: none">
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
          openInspector(att.title || "Vector Drawing", att.caption, "drawing", att.svg_inline);
        } else {
          openInspector(att.title || "Image Capture", att.caption, "image", att.file);
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
      pagerEl.innerHTML = link(posts[at - 1], "Newer Post") + link(posts[at + 1], "Older Post");
    }

    // Inspector controls
    $("#inspector-zoom-in")?.addEventListener("click", () => updateZoom(currentZoom + 0.25));
    $("#inspector-zoom-out")?.addEventListener("click", () => updateZoom(currentZoom - 0.25));
    $("#inspector-zoom-reset")?.addEventListener("click", () => updateZoom(1));
    $("#inspector-close")?.addEventListener("click", closeInspector);

    // Close on clicking backdrop
    $("#inspector-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "inspector-body" || e.target.id === "inspector-modal") {
        closeInspector();
      }
    });

    // Mouse wheel zoom inside inspector
    $("#inspector-body")?.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      updateZoom(currentZoom + delta);
    }, { passive: false });

    // Keyboard controls
    document.addEventListener("keydown", (e) => {
      const modal = $("#inspector-modal");
      if (modal && !modal.hidden) {
        if (e.key === "Escape") closeInspector();
        if (e.key === "+" || e.key === "=") updateZoom(currentZoom + 0.25);
        if (e.key === "-" || e.key === "_") updateZoom(currentZoom - 0.25);
        if (e.key === "0") updateZoom(1);
      }
    });
  })();
})();
