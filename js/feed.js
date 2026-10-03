/* =========================================================================
   DNF — Feed Timeline Engine (Pass 2)
   Wide-screen responsive 3-column stream, centralized navigation,
   rock-solid filter and attachment click handling, dynamic right rail
   addendums hub, and direct reader view routing.
   ========================================================================= */

(function () {
  "use strict";

  const { $, $$, esc, json, observe, fail } = window.DNF;

  const streamEl = $("#feed-stream");
  const leftRailEl = $("#feed-rail-left");
  const rightRailEl = $("#feed-rail-right");
  const drawingModalEl = $("#drawing-modal");

  if (!streamEl) return;

  let feedData = null;
  let activeProject = "all";
  let activeStatus = "all";
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
        const title = att.title || (isDrawing ? "Excalidraw Vector Drawing" : "Attached Image");
        const caption = att.caption || "";

        if (isDrawing) {
          const svgContent = att.svg_inline || "";
          return `
            <div class="attach-card is-drawing" role="button" tabindex="0" data-att-idx="${idx}" data-drawing-file="${esc(att.file)}" title="Click to zoom and pan drawing">
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
            <div class="attach-card" role="button" tabindex="0" data-att-idx="${idx}" data-img-file="${esc(att.file)}" title="Click to open image">
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
          <span class="stamp">Click any item to inspect</span>
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
        <summary>Author Field Notes &amp; Addendums (${addendums.length})</summary>
        <div class="addendum-track">
          ${items}
        </div>
      </details>`;
  }

  /* ------------------------------------------------- right rail hub */

  function updateRightRail(activePost) {
    if (!rightRailEl || !feedData) return;

    // 1. Active Post Section
    let activeHtml = "";
    if (activePost) {
      const addendumsList = (activePost.addendums || [])
        .map(
          (a) => `
          <div class="addendum-item">
            <span class="addendum-date">${esc(a.date)}</span>
            <p class="addendum-note">${esc(a.note)}</p>
          </div>`
        )
        .join("");

      activeHtml = `
        <div class="addendum-panel" style="margin-bottom:var(--s4)">
          <div class="addendum-header">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--s2)">
              <span class="eyebrow" style="margin:0">Active Dispatch</span>
              <span class="pill ${esc(activePost.status)}">${esc(activePost.status)}</span>
            </div>
            <h3 style="margin:var(--s1) 0"><a href="post.html?p=${encodeURIComponent(activePost.id)}" style="color:inherit;text-decoration:none">${esc(activePost.title)}</a></h3>
            <span class="stamp">${activePost.project} · ${activePost.date}</span>
          </div>

          <div style="margin-bottom:var(--s3)">
            <p class="eyebrow" style="font-size:0.68rem;margin:0 0 var(--s2)">Field Notes on this Dispatch (${(activePost.addendums||[]).length})</p>
            ${
              addendumsList
                ? `<div class="addendum-track">${addendumsList}</div>`
                : `<p class="soft" style="font-size:0.85rem;margin:0">No addendums on this dispatch yet.</p>`
            }
          </div>

          <a href="post.html?p=${encodeURIComponent(activePost.id)}" class="tile-go" style="margin:0">
            Open full reader view →
          </a>
        </div>`;
    }

    // 2. Global Recent Field Notes across all dispatches
    const allAddendums = [];
    (feedData.posts || []).forEach((p) => {
      (p.addendums || []).forEach((a) => {
        allAddendums.push({
          postTitle: p.title,
          postId: p.id,
          project: p.project,
          date: a.date,
          note: a.note,
        });
      });
    });

    allAddendums.sort((a, b) => (a.date < b.date ? 1 : -1));
    const recentAddendums = allAddendums.slice(0, 4);

    const recentHtml = `
      <div class="card" style="padding:var(--s4)">
        <p class="eyebrow" style="margin:0 0 var(--s2)">Recent Field Updates</p>
        <div class="addendum-track" style="margin-top:var(--s3)">
          ${
            recentAddendums.length
              ? recentAddendums
                  .map(
                    (item) => `
              <div class="addendum-item">
                <span class="addendum-date">${esc(item.date)} · <a href="#${esc(item.postId)}" style="color:var(--ink);text-decoration:none" data-jump-post="${esc(item.postId)}"><b>${esc(item.project)}</b></a></span>
                <p class="addendum-note" style="font-size:0.85rem">${esc(item.note)}</p>
              </div>`
                  )
                  .join("")
              : `<p class="soft" style="font-size:0.85rem;margin:0">No recent updates.</p>`
          }
        </div>
      </div>`;

    rightRailEl.innerHTML = activeHtml + recentHtml;
  }

  /* ------------------------------------------------------- post card */

  function renderPostCard(post) {
    const statusPill = post.status ? `<span class="pill ${esc(post.status)}">${esc(post.status)}</span>` : "";
    const tagsRow = (post.tags || [])
      .map((t) => `<button type="button" class="tag${activeTag.toLowerCase() === t.toLowerCase() ? " here" : ""}" data-feed-tag="${esc(t)}">${esc(t)}</button>`)
      .join(" ");

    return `
      <article class="feed-post" id="${esc(post.id)}" data-post-id="${esc(post.id)}" data-status="${esc(post.status)}">
        <div class="feed-post-head">
          <div class="feed-meta-row">
            <span class="eyebrow" style="margin:0">${esc(post.project)}</span>
            <span class="stamp">· ${esc(post.date)}</span>
          </div>
          ${statusPill}
        </div>

        <h3 class="feed-post-title">
          <a href="post.html?p=${encodeURIComponent(post.id)}">${esc(post.title)}</a>
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
            <a href="post.html?p=${encodeURIComponent(post.id)}" class="btn btn-ghost" style="padding:var(--s1) var(--s3);font-size:0.85rem;text-decoration:none">
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
    if (activeStatus !== "all" && (p.status || "").toLowerCase() !== activeStatus.toLowerCase()) {
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
    const list = (feedData.posts || []).filter(matchesFilter);
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
      updateRightRail(null);
      return;
    }

    streamEl.innerHTML = `<div class="feed-track">${list.map(renderPostCard).join("")}</div>`;
    observe(streamEl);

    // Set active post to the first matching one
    const firstPost = list[0];
    if (firstPost) {
      activePostId = firstPost.id;
      $(`#${firstPost.id}`)?.classList.add("is-active");
      updateRightRail(firstPost);
    }
  }

  function resetFilters() {
    activeProject = "all";
    activeStatus = "all";
    activeTag = "all";
    activeMedia = "all";
    searchQuery = "";
    const searchInput = $("#feed-search");
    if (searchInput) searchInput.value = "";
    renderLeftRail();
    renderStream();
  }

  /* ---------------------------------------------------- left rail */

  function renderLeftRail() {
    if (!leftRailEl || !feedData) return;

    // Projects list with links to dedicated panels
    const projectsList = [
      { id: "all", name: "All Projects", count: feedData.posts.length },
      { id: "Hod", name: "Hod (Sims 1 Tools)", count: feedData.posts.filter((p) => p.project === "Hod").length, panelUrl: "hod.html" },
      { id: "Attack of the Show", name: "Attack of the Show", count: feedData.posts.filter((p) => p.project === "Attack of the Show").length, panelUrl: "aots.html" },
      { id: "Tools", name: "Tools & Reverse Eng.", count: feedData.posts.filter((p) => p.project === "Tools").length, panelUrl: "about.html#tools" },
    ];

    const projectItems = projectsList
      .map(
        (proj) => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--s2);margin-bottom:var(--s2)">
          <button type="button" class="chip${activeProject.toLowerCase() === proj.id.toLowerCase() ? " here" : ""}" data-feed-project="${esc(proj.id)}" style="flex:1;text-align:left">
            ${esc(proj.name)}
          </button>
          ${proj.panelUrl ? `<a href="${esc(proj.panelUrl)}" title="Visit dedicated project panel" class="tile-go" style="margin:0;padding:2px 6px;font-size:0.75rem">Panel ↗</a>` : ""}
        </div>`
      )
      .join("");

    // Status items
    const statuses = ["all", "in motion", "done", "ahead"];
    const statusButtons = statuses
      .map(
        (st) => `
        <button type="button" class="chip${activeStatus.toLowerCase() === st.toLowerCase() ? " here" : ""}" data-feed-status="${esc(st)}">
          ${st === "all" ? "All Statuses" : esc(st)}
        </button>`
      )
      .join("");

    // Tags
    const tags = feedData.tags || [];
    const tagChips = tags
      .map(
        (t) => `
        <button type="button" class="tag${activeTag.toLowerCase() === t.toLowerCase() ? " here" : ""}" data-feed-tag="${esc(t)}">
          ${esc(t)}
        </button>`
      )
      .join("");

    leftRailEl.innerHTML = `
      <div class="card" style="padding:var(--s4)">
        <p class="eyebrow" style="margin:0 0 var(--s2)">The Timeline</p>
        <h4 style="margin:0 0 var(--s1)">Jeff Adkins · DNF</h4>
        <p class="soft" style="font-size:0.86rem;margin:0 0 var(--s3)">
          Chronological workstream, reverse engineering dispatches, and field notes.
        </p>
        <span class="stamp">${feedData.count} total dispatches</span>
      </div>

      <div class="card" style="padding:var(--s4)">
        <p class="eyebrow" style="margin:0 0 var(--s2)">Projects</p>
        ${projectItems}
      </div>

      <div class="card" style="padding:var(--s4)">
        <p class="eyebrow" style="margin:0 0 var(--s2)">Filter by Status</p>
        <div class="chiprow" style="margin:0">
          ${statusButtons}
        </div>
      </div>

      <div class="card" style="padding:var(--s4)">
        <p class="eyebrow" style="margin:0 0 var(--s2)">Filter by Content</p>
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
        <p class="eyebrow" style="margin:0 0 var(--s2)">Topics &amp; Tags</p>
        <div class="chiprow" style="margin:0">
          <button type="button" class="tag${activeTag === "all" ? " here" : ""}" data-feed-tag="all">All</button>
          ${tagChips}
        </div>
      </div>`;
  }

  /* ---------------------------------------------------- excalidraw modal */

  let currentZoom = 1;

  function openDrawingModal(title, caption, svgHtml) {
    if (!drawingModalEl) return;
    const titleEl = $("#drawing-modal-title");
    const capEl = $("#drawing-modal-cap");
    const canvasEl = $("#drawing-canvas");

    if (titleEl) titleEl.textContent = title || "Excalidraw Vector Drawing";
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

  /* ---------------------------------------------------- event handling */

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
    leftRailEl?.addEventListener("click", (e) => {
      const projBtn = e.target.closest("[data-feed-project]");
      if (projBtn) {
        activeProject = projBtn.dataset.feedProject;
        renderLeftRail();
        renderStream();
        return;
      }

      const statusBtn = e.target.closest("[data-feed-status]");
      if (statusBtn) {
        activeStatus = statusBtn.dataset.feedStatus;
        renderLeftRail();
        renderStream();
        return;
      }

      const tagBtn = e.target.closest("[data-feed-tag]");
      if (tagBtn) {
        activeTag = tagBtn.dataset.feedTag;
        renderLeftRail();
        renderStream();
        return;
      }
    });

    // Content filter radio changes
    leftRailEl?.addEventListener("change", (e) => {
      if (e.target.name === "media-filter") {
        activeMedia = e.target.value;
        renderStream();
      }
    });

    // Stream clicks (delegated)
    streamEl.addEventListener("click", (e) => {
      // 1. Drawing inspection click
      const drawCard = e.target.closest(".attach-card.is-drawing");
      if (drawCard) {
        const postCard = drawCard.closest(".feed-post");
        const post = (feedData.posts || []).find((p) => p.id === postCard?.id);
        const idx = parseInt(drawCard.dataset.attIdx, 10);
        const att = post && post.attachments ? post.attachments[idx] : null;
        if (att) {
          openDrawingModal(att.title, att.caption, att.svg_inline);
          return;
        }
      }

      // 2. Image lightbox click
      const imgCard = e.target.closest(".attach-card:not(.is-drawing)");
      if (imgCard) {
        const postCard = imgCard.closest(".feed-post");
        const post = (feedData.posts || []).find((p) => p.id === postCard?.id);
        const idx = parseInt(imgCard.dataset.attIdx, 10);
        const att = post && post.attachments ? post.attachments[idx] : null;
        if (att) {
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
          return;
        }
      }

      // 3. Tag click inside post
      const tagBtn = e.target.closest("[data-feed-tag]");
      if (tagBtn) {
        activeTag = tagBtn.dataset.feedTag;
        renderLeftRail();
        renderStream();
        return;
      }

      // 4. Click post to activate it in right rail
      const postCard = e.target.closest(".feed-post");
      if (postCard && !e.target.closest("a, button, input")) {
        const id = postCard.id;
        if (id && id !== activePostId) {
          activePostId = id;
          $$(".feed-post.is-active", streamEl).forEach((el) => el.classList.remove("is-active"));
          postCard.classList.add("is-active");
          const post = (feedData.posts || []).find((p) => p.id === id);
          if (post) updateRightRail(post);
        }
      }
    });

    // Right Rail click to jump to post
    rightRailEl?.addEventListener("click", (e) => {
      const jumpLink = e.target.closest("[data-jump-post]");
      if (jumpLink) {
        const targetId = jumpLink.dataset.jumpPost;
        const targetPost = document.getElementById(targetId);
        if (targetPost) {
          e.preventDefault();
          targetPost.scrollIntoView({ behavior: "smooth", block: "center" });
          activePostId = targetId;
          $$(".feed-post.is-active", streamEl).forEach((el) => el.classList.remove("is-active"));
          targetPost.classList.add("is-active");
          const post = (feedData.posts || []).find((p) => p.id === targetId);
          if (post) updateRightRail(post);
        }
      }
    });

    // Scroll listener to update active post in right rail reliably
    let scrollTimeout = null;
    window.addEventListener("scroll", () => {
      if (scrollTimeout) return;
      scrollTimeout = setTimeout(() => {
        scrollTimeout = null;
        const posts = $$(".feed-post", streamEl);
        if (!posts.length) return;

        const viewportCenter = window.innerHeight / 2;
        let closestPost = null;
        let closestDist = Infinity;

        posts.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const dist = Math.abs(rect.top + rect.height / 2 - viewportCenter);
          if (dist < closestDist) {
            closestDist = dist;
            closestPost = el;
          }
        });

        if (closestPost && closestPost.id !== activePostId) {
          activePostId = closestPost.id;
          posts.forEach((el) => el.classList.remove("is-active"));
          closestPost.classList.add("is-active");
          const post = (feedData.posts || []).find((p) => p.id === closestPost.id);
          if (post) updateRightRail(post);
        }
      }, 100);
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
  })();
})();
