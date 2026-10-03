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

  function renderAttachments(attachments, postId) {
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
            <div class="attach-card is-drawing" role="button" tabindex="0" data-post-id="${esc(postId)}" data-idx="${idx}" title="Click to zoom and pan drawing">
              <div class="attach-preview" style="pointer-events:none">
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
            <div class="attach-card" role="button" tabindex="0" data-post-id="${esc(postId)}" data-idx="${idx}" title="Click to inspect image">
              <div class="attach-preview" style="pointer-events:none">
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
        ${renderAttachments(post.attachments, post.id)}
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
    searchQuery = "";
    const searchInput = $("#feed-search");
    if (searchInput) searchInput.value = "";
    renderLeftRail();
    renderStream();
  }

  /* ---------------------------------------------------- left rail */

  function renderLeftRail() {
    if (!leftRailEl || !feedData) return;

    // Real, direct Projects navigation links
    const projectsList = [
      { id: "all", name: "All Feed Dispatches", count: feedData.posts.length, url: "feed.html", isHome: true },
      { id: "Hod", name: "Hod (Sims 1 Tools)", count: feedData.posts.filter((p) => p.project === "Hod").length, url: "hod.html" },
      { id: "Attack of the Show", name: "Attack of the Show", count: feedData.posts.filter((p) => p.project === "Attack of the Show").length, url: "aots.html" },
      { id: "Tools", name: "Tools & Reverse Eng.", count: feedData.posts.filter((p) => p.project === "Tools").length, url: "about.html#tools" },
    ];

    const projectNavLinks = projectsList
      .map(
        (proj) => `
        <a href="${esc(proj.url)}" class="project-nav-link${proj.isHome ? " active" : ""}">
          <span class="project-nav-title">${esc(proj.name)}</span>
          ${proj.isHome ? `<span class="project-nav-count">${proj.count}</span>` : `<span class="project-nav-arrow">→</span>`}
        </a>`
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
        <p class="eyebrow" style="margin:0 0 var(--s3)">Projects</p>
        <nav class="project-nav-list" aria-label="Projects">
          ${projectNavLinks}
        </nav>
      </div>`;
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
    const modal = document.getElementById("inspector-modal");
    if (!modal) return;

    const titleEl = document.getElementById("inspector-title");
    const capEl = document.getElementById("inspector-cap");
    const badgeEl = document.getElementById("inspector-badge");
    const canvasEl = document.getElementById("inspector-canvas");

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
    const modal = document.getElementById("inspector-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
    const canvasEl = document.getElementById("inspector-canvas");
    if (canvasEl) canvasEl.innerHTML = "";
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

    // Attachment inspection click: attached to document for 100% reliable trigger
    document.addEventListener("click", (e) => {
      const attachCard = e.target.closest(".attach-card");
      if (!attachCard) return;

      e.preventDefault();
      e.stopPropagation();

      const postId = attachCard.dataset.postId;
      const idx = parseInt(attachCard.dataset.idx, 10);
      const post = (feedData && feedData.posts ? feedData.posts : []).find((p) => p.id === postId);
      const att = post && post.attachments ? post.attachments[idx] : null;

      if (att) {
        const isDrawing = att.type === "drawing" || (att.file && att.file.endsWith(".excalidraw"));
        if (isDrawing) {
          openInspector(att.title || "Vector Drawing", att.caption, "drawing", att.svg_inline);
        } else {
          openInspector(att.title || "Image Capture", att.caption, "image", att.file);
        }
      }
    });

    // Stream clicks (delegated)
    streamEl.addEventListener("click", (e) => {
      // Click post to activate it in right rail
      const postCard = e.target.closest(".feed-post");
      if (postCard && !e.target.closest("a, button, input, .attach-card")) {
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
