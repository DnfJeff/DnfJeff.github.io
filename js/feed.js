/* =========================================================================
   DNF — Feed timeline engine
   Loads data/feed.json, renders the 3-column chronological stream,
   manages tag & project filtering, author addendums sync, bundled
   attachments, and the interactive Excalidraw vector viewer.
   ========================================================================= */

(function () {
  "use strict";

  const { $, $$, esc, json, observe, fail } = window.DNF;

  const streamEl = $("#feed-stream");
  const leftRailEl = $("#feed-rail-left");
  const rightRailEl = $("#feed-rail-right");
  const drawingModalEl = $("#drawing-modal");
  const readerModalEl = $("#post-reader-modal");

  if (!streamEl) return;

  let feedData = null;
  let activeProject = "all";
  let activeTag = "all";
  let activeMedia = "all";
  let searchQuery = "";
  let activePostId = null;

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

  /* --------------------------------------------------- attachments tray */

  function renderAttachments(attachments) {
    if (!attachments || !attachments.length) return "";

    const count = attachments.length;
    const gridClass = count === 1 ? "grid-1" : count === 2 ? "grid-2" : "grid-3";

    const tiles = attachments
      .map((att, idx) => {
        const isDrawing = att.type === "drawing" || (att.file && att.file.endsWith(".excalidraw"));
        const title = att.title || (isDrawing ? "Excalidraw Drawing" : "Attached Image");
        const caption = att.caption || "";

        if (isDrawing) {
          const svgContent = att.svg_inline || "";
          return `
            <div class="attach-card is-drawing" role="button" tabindex="0" data-view-drawing="${esc(att.file)}" data-title="${esc(title)}" data-caption="${esc(caption)}">
              <div class="attach-preview">
                <span class="attach-badge">Vector Drawing</span>
                ${svgContent}
              </div>
              <div class="attach-cap">
                <strong>${esc(title)}</strong>
                ${caption ? `<span>${esc(caption)}</span>` : ""}
              </div>
            </div>`;
        } else {
          return `
            <div class="attach-card" role="button" tabindex="0" data-view-img="${esc(att.file)}" data-title="${esc(title)}" data-caption="${esc(caption)}">
              <div class="attach-preview">
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

    return `
      <div class="feed-attachments">
        <div class="feed-attachments-head">
          <span class="eyebrow" style="margin:0">Bundled Attachments (${count})</span>
          <span class="stamp">Click to inspect</span>
        </div>
        <div class="attach-grid ${gridClass}">
          ${tiles}
        </div>
      </div>`;
  }

  /* ---------------------------------------------------- library interplay */

  function renderLibraryInterplay(notes) {
    if (!notes || !notes.length) return "";

    return notes
      .map(
        (n) => `
        <div class="feed-library-interplay">
          <div class="interplay-head">
            <span class="eyebrow" style="margin:0">From the Library · ${esc(n.section)}</span>
            <span class="stamp">${n.words ? `${n.words.toLocaleString()} words` : ""}</span>
          </div>
          <h4><a href="note.html?n=${encodeURIComponent(n.path)}" style="color:var(--ink);text-decoration:none">${esc(n.title)}</a></h4>
          ${n.summary ? `<p>${esc(n.summary)}</p>` : ""}
          <div style="margin-top:var(--s1)">
            <a href="note.html?n=${encodeURIComponent(n.path)}" class="tile-go" style="margin:0;display:inline-block">Read note in library →</a>
          </div>
        </div>`
      )
      .join("");
  }

  /* --------------------------------------------------- addendums & errata */

  function renderInlineAddendums(addendums) {
    if (!addendums || !addendums.length) return "";

    const items = addendums
      .map(
        (a) => `
        <div class="addendum-item">
          <span class="addendum-date">${esc(a.date)}</span>
          <p class="addendum-note">${esc(a.note)}</p>
        </div>`
      )
      .join("");

    return `
      <details class="feed-inline-addendums">
        <summary>Author Field Notes & Addendums (${addendums.length})</summary>
        <div class="addendum-track">
          ${items}
        </div>
      </details>`;
  }

  function updateRightRailAddendums(post) {
    if (!rightRailEl) return;

    if (!post || !post.addendums || !post.addendums.length) {
      rightRailEl.innerHTML = `
        <div class="addendum-panel">
          <div class="addendum-header">
            <p class="eyebrow" style="margin:0">Field Notes & Errata</p>
            <h3>No addendums</h3>
          </div>
          <p class="soft" style="font-size:0.86rem;margin:0">
            ${post ? "This dispatch stands as originally posted without follow-up notes." : "Select or scroll past any dispatch to view its author addendums."}
          </p>
        </div>`;
      return;
    }

    const items = post.addendums
      .map(
        (a) => `
        <div class="addendum-item">
          <span class="addendum-date">${esc(a.date)}</span>
          <p class="addendum-note">${esc(a.note)}</p>
        </div>`
      )
      .join("");

    rightRailEl.innerHTML = `
      <div class="addendum-panel" data-rise>
        <div class="addendum-header">
          <p class="eyebrow" style="margin:0">Field Notes · ${esc(post.project)}</p>
          <h3 style="margin-top:var(--s1)"><a href="#${esc(post.id)}" style="color:inherit;text-decoration:none">${esc(post.title)}</a></h3>
          <span class="stamp">${post.addendums.length} follow-up note${post.addendums.length > 1 ? "s" : ""}</span>
        </div>
        <div class="addendum-track">
          ${items}
        </div>
      </div>`;
    observe(rightRailEl);
  }

  /* ------------------------------------------------------- post rendering */

  function renderPostCard(post) {
    const statusPill = post.status ? `<span class="pill ${esc(post.status)}">${esc(post.status)}</span>` : "";
    const tagsRow = (post.tags || [])
      .map((t) => `<button type="button" class="tag" data-filter-tag="${esc(t)}">${esc(t)}</button>`)
      .join(" ");

    return `
      <article class="feed-post" id="${esc(post.id)}" data-status="${esc(post.status)}" data-rise>
        <div class="feed-post-head">
          <div class="feed-meta-row">
            <span class="eyebrow" style="margin:0">${esc(post.project)}</span>
            <span class="stamp">· ${esc(post.date)}</span>
          </div>
          ${statusPill}
        </div>

        <h3 class="feed-post-title">
          <a href="feed.html?post=${encodeURIComponent(post.id)}" data-open-reader="${esc(post.id)}">${esc(post.title)}</a>
        </h3>

        <div class="feed-prose">
          ${markdown(post.body)}
        </div>

        ${renderLibraryInterplay(post.linked_notes)}
        ${renderAttachments(post.attachments)}
        ${renderInlineAddendums(post.addendums)}

        <div class="feed-post-foot">
          <div class="chiprow" style="margin:0">
            ${tagsRow}
          </div>
          <div>
            <a href="feed.html?post=${encodeURIComponent(post.id)}" data-open-reader="${esc(post.id)}" style="text-decoration:none;font-weight:500">
              Reader view →
            </a>
          </div>
        </div>
      </article>`;
  }

  /* ------------------------------------------------------------- filtering */

  function matchesFilter(p) {
    if (activeProject !== "all" && p.project.toLowerCase() !== activeProject.toLowerCase()) {
      return false;
    }
    if (activeTag !== "all" && !(p.tags || []).some((t) => t.toLowerCase() === activeTag.toLowerCase())) {
      return false;
    }
    if (activeMedia === "drawings") {
      const hasD = (p.attachments || []).some((a) => a.type === "drawing" || (a.file && a.file.endsWith(".excalidraw")));
      if (!hasD) return false;
    } else if (activeMedia === "media") {
      if (!p.attachments || !p.attachments.length) return false;
    } else if (activeMedia === "library") {
      if (!p.linked_notes || !p.linked_notes.length) return false;
    }

    if (searchQuery) {
      const haystack = `${p.title} ${p.summary} ${p.body} ${(p.tags || []).join(" ")} ${p.project}`.toLowerCase();
      if (!haystack.includes(searchQuery.toLowerCase())) return false;
    }

    return true;
  }

  function renderStream() {
    const list = feedData.posts.filter(matchesFilter);
    const countEl = $("#feed-count");
    if (countEl) {
      countEl.textContent = `${list.length} dispatch${list.length === 1 ? "" : "es"}`;
    }

    if (!list.length) {
      streamEl.innerHTML = `
        <div class="empty card" style="padding:var(--s6);text-align:center">
          <p class="eyebrow" style="margin-bottom:var(--s2)">Nothing found</p>
          <p class="soft" style="margin:0">No dispatches match the selected filters or search query.</p>
          <button type="button" class="btn btn-ghost" id="reset-filters-btn" style="margin-top:var(--s4)">Reset all filters</button>
        </div>`;
      $("#reset-filters-btn")?.addEventListener("click", resetFilters);
      updateRightRailAddendums(null);
      return;
    }

    streamEl.innerHTML = `<div class="feed-track">${list.map(renderPostCard).join("")}</div>`;
    observe(streamEl);

    // Default right rail to the topmost matching post
    if (list[0]) {
      activePostId = list[0].id;
      updateRightRailAddendums(list[0]);
      $(`#${list[0].id}`)?.classList.add("is-active");
    }

    wirePostIntersectionObserver();
  }

  function resetFilters() {
    activeProject = "all";
    activeTag = "all";
    activeMedia = "all";
    searchQuery = "";
    const searchInput = $("#feed-search");
    if (searchInput) searchInput.value = "";
    renderLeftRail();
    renderStream();
  }

  /* ---------------------------------------------------- left rail & controls */

  function renderLeftRail() {
    if (!leftRailEl || !feedData) return;

    const projects = ["all", ...(feedData.projects || [])];
    const tags = feedData.tags || [];

    const projectButtons = projects
      .map(
        (proj) => `
        <button type="button" class="chip${activeProject.toLowerCase() === proj.toLowerCase() ? " here" : ""}" data-filter-project="${esc(proj)}">
          ${proj === "all" ? "All Projects" : esc(proj)}
        </button>`
      )
      .join("");

    const tagChips = tags
      .map(
        (t) => `
        <button type="button" class="tag${activeTag.toLowerCase() === t.toLowerCase() ? " here" : ""}" data-filter-tag="${esc(t)}">
          ${esc(t)}
        </button>`
      )
      .join("");

    leftRailEl.innerHTML = `
      <div class="card" style="padding:var(--s4)">
        <p class="eyebrow" style="margin:0 0 var(--s2)">Author</p>
        <h4 style="margin:0 0 var(--s1)">Jeff Adkins</h4>
        <p class="soft" style="font-size:0.86rem;margin:0 0 var(--s3)">
          Chronological dispatches, reverse engineering progress, archival finds and field notes.
        </p>
        <span class="stamp">${feedData.count} total dispatches</span>
      </div>

      <div class="card" style="padding:var(--s4)">
        <p class="eyebrow" style="margin:0 0 var(--s3)">Projects</p>
        <div class="chiprow" style="margin:0">
          ${projectButtons}
        </div>
      </div>

      <div class="card" style="padding:var(--s4)">
        <p class="eyebrow" style="margin:0 0 var(--s2)">Content Filter</p>
        <div class="stack" style="gap:var(--s2);font-size:0.88rem">
          <label style="display:flex;align-items:center;gap:var(--s2);cursor:pointer">
            <input type="radio" name="media-filter" value="all" ${activeMedia === "all" ? "checked" : ""}>
            <span>All entries</span>
          </label>
          <label style="display:flex;align-items:center;gap:var(--s2);cursor:pointer">
            <input type="radio" name="media-filter" value="drawings" ${activeMedia === "drawings" ? "checked" : ""}>
            <span>Has Excalidraw Drawings</span>
          </label>
          <label style="display:flex;align-items:center;gap:var(--s2);cursor:pointer">
            <input type="radio" name="media-filter" value="media" ${activeMedia === "media" ? "checked" : ""}>
            <span>Has Bundled Media</span>
          </label>
          <label style="display:flex;align-items:center;gap:var(--s2);cursor:pointer">
            <input type="radio" name="media-filter" value="library" ${activeMedia === "library" ? "checked" : ""}>
            <span>Linked to Library Notes</span>
          </label>
        </div>
      </div>

      <div class="card" style="padding:var(--s4)">
        <p class="eyebrow" style="margin:0 0 var(--s3)">Topics & Tags</p>
        <div class="chiprow" style="margin:0">
          <button type="button" class="tag${activeTag === "all" ? " here" : ""}" data-filter-tag="all">All</button>
          ${tagChips}
        </div>
      </div>`;
  }

  /* --------------------------------------------- intersection observer & sync */

  let streamObserver = null;
  function wirePostIntersectionObserver() {
    if (streamObserver) streamObserver.disconnect();
    if (!("IntersectionObserver" in window)) return;

    streamObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
            const id = entry.target.id;
            if (id && id !== activePostId) {
              activePostId = id;
              $$(".feed-post.is-active", streamEl).forEach((el) => el.classList.remove("is-active"));
              entry.target.classList.add("is-active");
              const post = feedData.posts.find((p) => p.id === id);
              if (post) updateRightRailAddendums(post);
            }
          }
        });
      },
      { threshold: [0.4, 0.8] }
    );

    $$(".feed-post", streamEl).forEach((el) => streamObserver.observe(el));
  }

  /* ---------------------------------------------------- excalidraw modal */

  let currentZoom = 1;
  function openDrawingModal(file, title, caption) {
    if (!drawingModalEl) return;
    const post = feedData.posts.find((p) =>
      (p.attachments || []).some((a) => a.file === file)
    );
    const att = post ? post.attachments.find((a) => a.file === file) : null;
    const svgHtml = att && att.svg_inline ? att.svg_inline : `<p class="soft">Loading vector drawing...</p>`;

    const titleEl = $("#drawing-modal-title");
    const capEl = $("#drawing-modal-cap");
    const canvasEl = $("#drawing-canvas");

    if (titleEl) titleEl.textContent = title || "Excalidraw Drawing";
    if (capEl) capEl.textContent = caption || "";
    if (canvasEl) {
      canvasEl.innerHTML = svgHtml;
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

  /* --------------------------------------------------- reader modal / permalink */

  function openReaderModal(postId) {
    const post = feedData.posts.find((p) => p.id === postId);
    if (!post || !readerModalEl) return;

    const contentEl = $("#post-reader-content");
    if (contentEl) {
      contentEl.innerHTML = `
        <div class="feed-post-head" style="margin-bottom:var(--s4)">
          <div class="feed-meta-row">
            <span class="eyebrow" style="margin:0">${esc(post.project)}</span>
            <span class="stamp">· ${esc(post.date)}</span>
          </div>
          <span class="pill ${esc(post.status)}">${esc(post.status)}</span>
        </div>
        <h1 style="font-size:clamp(1.8rem,4vw,2.4rem);margin-bottom:var(--s4)">${esc(post.title)}</h1>
        <div class="feed-prose" style="font-size:1.05rem">
          ${markdown(post.body)}
        </div>
        ${renderLibraryInterplay(post.linked_notes)}
        ${renderAttachments(post.attachments)}
        ${renderInlineAddendums(post.addendums)}`;
    }

    readerModalEl.hidden = false;
    document.body.style.overflow = "hidden";
    // update URL without hard reloading
    history.replaceState(null, "", `feed.html?post=${encodeURIComponent(postId)}`);
  }

  function closeReaderModal() {
    if (!readerModalEl) return;
    readerModalEl.hidden = true;
    document.body.style.overflow = "";
    history.replaceState(null, "", "feed.html");
  }

  /* ---------------------------------------------------- event listeners */

  function wireEvents() {
    // Search input
    const searchInput = $("#feed-search");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value.trim();
        renderStream();
      });
    }

    // Left Rail clicks (delegated)
    if (leftRailEl) {
      leftRailEl.addEventListener("click", (e) => {
        const projBtn = e.target.closest("[data-filter-project]");
        if (projBtn) {
          activeProject = projBtn.dataset.filterProject;
          renderLeftRail();
          renderStream();
          return;
        }

        const tagBtn = e.target.closest("[data-filter-tag]");
        if (tagBtn) {
          activeTag = tagBtn.dataset.filterTag;
          renderLeftRail();
          renderStream();
          return;
        }
      });

      leftRailEl.addEventListener("change", (e) => {
        if (e.target.name === "media-filter") {
          activeMedia = e.target.value;
          renderStream();
        }
      });
    }

    // Stream clicks (delegated)
    streamEl.addEventListener("click", (e) => {
      // Drawing inspection
      const drawCard = e.target.closest("[data-view-drawing]");
      if (drawCard) {
        openDrawingModal(
          drawCard.dataset.viewDrawing,
          drawCard.dataset.title,
          drawCard.dataset.caption
        );
        return;
      }

      // Image inspection (trigger site lightbox or drawing modal)
      const imgCard = e.target.closest("[data-view-img]");
      if (imgCard) {
        const full = imgCard.dataset.viewImg;
        const title = imgCard.dataset.title;
        const cap = imgCard.dataset.caption;
        // Check if global lightbox exists
        const lb = $("#lightbox");
        if (lb) {
          const img = $("img", lb);
          const capEl = $("[data-lb-cap]", lb);
          const titleEl = $("[data-lb-title]", lb);
          if (img) img.src = full;
          if (titleEl) titleEl.textContent = title;
          if (capEl) capEl.textContent = cap;
          lb.hidden = false;
          document.body.style.overflow = "hidden";
        } else {
          openDrawingModal(full, title, cap);
        }
        return;
      }

      // Tag chip inside post
      const tagBtn = e.target.closest("[data-filter-tag]");
      if (tagBtn) {
        activeTag = tagBtn.dataset.filterTag;
        renderLeftRail();
        renderStream();
        return;
      }

      // Open full post reader view
      const readerLink = e.target.closest("[data-open-reader]");
      if (readerLink) {
        e.preventDefault();
        openReaderModal(readerLink.dataset.openReader);
        return;
      }

      // Click on post card itself to activate addendums
      const postCard = e.target.closest(".feed-post");
      if (postCard) {
        const id = postCard.id;
        if (id && id !== activePostId) {
          activePostId = id;
          $$(".feed-post.is-active", streamEl).forEach((el) => el.classList.remove("is-active"));
          postCard.classList.add("is-active");
          const post = feedData.posts.find((p) => p.id === id);
          if (post) updateRightRailAddendums(post);
        }
      }
    });

    // Drawing modal zoom buttons
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
    $("[data-close-reader]")?.addEventListener("click", closeReaderModal);

    // Keyboard ESC to close modals
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (drawingModalEl && !drawingModalEl.hidden) closeDrawingModal();
        if (readerModalEl && !readerModalEl.hidden) closeReaderModal();
      }
    });
  }

  /* ----------------------------------------------------------------- init */

  (async function init() {
    feedData = await json("data/feed.json");
    if (!feedData || !feedData.posts) {
      fail(streamEl, "Couldn't load feed dispatches.");
      return;
    }

    renderLeftRail();
    renderStream();
    wireEvents();

    // Check if URL has ?post=<id> query param
    const params = new URLSearchParams(location.search);
    const targetPostId = params.get("post");
    if (targetPostId) {
      openReaderModal(targetPostId);
    }
  })();
})();
