/* DNF feed: browsing, combined filters, and in-place attachment inspection. */
(function () {
  "use strict";
  const { $, $$, esc, json, fail } = window.DNF;
  const stream = $("#feed-stream");
  if (!stream) return;

  const filters = { project: "", tag: "", status: "", media: "", q: "" };
  const labels = { project: "Project", tag: "Tag", status: "Status", media: "Attachments", q: "Search" };
  const mediaLabels = { drawing: "Drawings", image: "Images", none: "No attachments" };
  let posts = [];
  let feedData = {};
  let selectedPostId = "";
  const readerUrl = (post) => `post.html?p=${encodeURIComponent(post.id)}`;
  const attachmentType = (att) => att.type === "drawing" || /\.excalidraw$/i.test(att.file || "") ? "drawing" : "image";
  const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

  function matches(post) {
    if (filters.project && post.project !== filters.project) return false;
    if (filters.status && post.status !== filters.status) return false;
    if (filters.tag && !(post.tags || []).includes(filters.tag)) return false;
    const attachments = post.attachments || [];
    if (filters.media === "none" && attachments.length) return false;
    if (filters.media && filters.media !== "none" && !attachments.some((a) => attachmentType(a) === filters.media)) return false;
    const haystack = [post.title, post.summary, post.body, post.project, ...(post.tags || []),
      ...(post.comments || []).map((a) => a.body),
      ...attachments.flatMap((a) => [a.title, a.caption]),
      ...(post.linked_notes || []).flatMap((n) => [n.title, n.summary])].join(" ").toLowerCase();
    return !filters.q || haystack.includes(filters.q.toLowerCase());
  }

  function selectFilter(field, title, values, allLabel) {
    return `<label class="feed-filter-label" for="feed-${field}">${title}</label>
      <select id="feed-${field}" data-filter="${field}"><option value="">${allLabel}</option>
        ${values.map((v) => `<option value="${esc(v)}">${esc(field === "media" ? mediaLabels[v] : v)}</option>`).join("")}
      </select>`;
  }

  function renderSidebar() {
    const types = unique(posts.flatMap((p) => (p.attachments || []).map(attachmentType)));
    if (posts.some((p) => !(p.attachments || []).length)) types.push("none");
    $("#feed-rail-left").innerHTML = `
      <div class="feed-filter-panel">
        <h2 class="eyebrow">Browse the feed</h2>
        <div class="feed-filter-fields">
          <div>${selectFilter("project", "Project", unique(feedData.projects || posts.map((p) => p.project)), "All projects")}</div>
          <div>${selectFilter("status", "Status", unique(feedData.statuses || posts.map((p) => p.status)), "Any status")}</div>
          <div>${selectFilter("media", "Attachments", types, "Any attachment type")}</div>
        </div>
        <fieldset class="feed-tag-filter"><legend>Tags</legend><div class="chiprow">
          ${unique(posts.flatMap((p) => p.tags || [])).map((tag) => `<button type="button" class="tag" data-tag="${esc(tag)}" aria-pressed="false">${esc(tag)}</button>`).join("")}
        </div></fieldset>
      </div>
      <nav class="feed-project-links" aria-label="Project websites">
        <h2 class="eyebrow">Explore the projects</h2>
        <a href="hod.html">Hod · Sims 1 tools <span aria-hidden="true">↗</span></a>
        <a href="aots.html">Attack of the Show <span aria-hidden="true">↗</span></a>
        <a href="about.html#tools">Tools &amp; reverse engineering <span aria-hidden="true">↗</span></a>
      </nav>`;

  }

  function renderComments() {
    const post = posts.find((p) => p.id === selectedPostId);
    const rail = $("#feed-rail-right");
    if (!post) { rail.innerHTML = ""; return; }
    const comments = post.comments || [];
    rail.innerHTML = `<div class="feed-updates" id="feed-comments-panel"><h2 class="eyebrow">Comments · ${comments.length}</h2>
      <a class="feed-update-link" href="${readerUrl(post)}">${esc(post.title)} ↗</a>
      ${comments.length ? `<div class="addendum-track">${comments.map((comment) => `<div class="addendum-item">
        <time class="addendum-date">${esc(comment.date)}</time><p class="addendum-note">${esc(comment.body)}</p>
      </div>`).join("")}</div>` : `<p class="soft">No comments on this post yet.</p>`}</div>`;
  }

  function selectPost(id, focus = false) {
    selectedPostId = id;
    $$(".feed-post").forEach((card) => {
      const active = card.id === id;
      card.classList.toggle("is-active", active);
      card.setAttribute("aria-current", active ? "true" : "false");
    });
    renderComments();
    if (focus) document.getElementById(id)?.focus({ preventScroll: true });
  }

  function renderAttachments(post) {
    const attachments = post.attachments || [];
    if (!attachments.length) return "";
    return `<div class="feed-attachments">
      <div class="feed-attachments-head"><span class="eyebrow">Attachments · ${attachments.length}</span><span class="stamp">Open to inspect ↗</span></div>
      <div class="attach-grid ${attachments.length === 1 ? "grid-1" : "grid-2"}">
        ${attachments.map((att, idx) => {
          const drawing = attachmentType(att) === "drawing";
          const title = att.title || (drawing ? "Drawing" : "Image");
          return `<button type="button" class="attach-card${drawing ? " is-drawing" : ""}" data-post="${esc(post.id)}" data-attachment="${idx}" aria-label="Inspect ${esc(title)}" aria-haspopup="dialog">
            <span class="attach-preview" aria-hidden="true"><span class="attach-badge">${drawing ? "Drawing" : "Image"}</span>
              ${drawing && att.svg_inline ? att.svg_inline : `<img src="${esc(drawing ? att.svg_file || "" : att.file || "")}" alt="" loading="lazy">`}
            </span><span class="attach-cap"><strong>${esc(title)}</strong></span>
          </button>`;
        }).join("")}
      </div></div>`;
  }

  function renderPost(post) {
    const summary = post.summary || (post.body || "").split(/\n\s*\n/)[0].slice(0, 300);
    return `<article class="feed-post${post.id === selectedPostId ? " is-active" : ""}" id="${esc(post.id)}" data-status="${esc(post.status)}" tabindex="0" aria-label="Select ${esc(post.title)} to show its comments" aria-current="${post.id === selectedPostId}">
      <div class="feed-post-head"><div class="feed-meta-row"><span class="eyebrow">${esc(post.project)}</span><time class="stamp" datetime="${esc(post.date)}">${esc(post.date)}</time></div>
      ${post.status ? `<span class="pill ${esc(post.status)}">${esc(post.status)}</span>` : ""}</div>
      <h2 class="feed-post-title"><a href="${readerUrl(post)}">${esc(post.title)}</a></h2>
      <p class="feed-summary">${esc(summary)}</p>
      <div class="chiprow feed-post-tags">${(post.tags || []).map((tag) => `<button type="button" class="tag" data-tag="${esc(tag)}" aria-pressed="${filters.tag === tag}">${esc(tag)}</button>`).join("")}</div>
      ${renderAttachments(post)}
      ${(post.linked_notes || []).length ? `<div class="feed-related"><span class="stamp">Related writing</span>${post.linked_notes.map((n) => `<a href="note.html?n=${encodeURIComponent(n.path)}">${esc(n.title)} <span aria-hidden="true">→</span></a>`).join("")}</div>` : ""}
      <div class="feed-post-foot"><span class="stamp">${(post.comments || []).length} comment${(post.comments || []).length === 1 ? "" : "s"}</span>
      <a class="feed-read-link" href="${readerUrl(post)}">Read full post <span aria-hidden="true">→</span></a></div>
    </article>`;
  }

  function render() {
    const list = posts.filter(matches);
    if (!list.some((post) => post.id === selectedPostId)) selectedPostId = list[0]?.id || "";
    $("#feed-count").textContent = `Showing ${list.length} of ${posts.length} posts`;
    stream.innerHTML = list.length ? `<div class="feed-track">${list.map(renderPost).join("")}</div>` :
      `<div class="empty card"><h2>No matching posts</h2><p class="soft">Try another search or remove a filter.</p><button type="button" class="btn btn-ghost" data-clear>Clear all filters</button></div>`;
    const selected = Object.entries(filters).filter(([, value]) => value);
    $("#feed-active-filters").innerHTML = selected.map(([field, value]) => `<button type="button" class="tag" data-remove="${field}" aria-label="Remove ${labels[field].toLowerCase()} filter: ${esc(value)}">${labels[field]}: ${esc(field === "media" ? mediaLabels[value] : value)} <span aria-hidden="true">×</span></button>`).join("");
    $("#feed-clear").hidden = !selected.length;
    $$('[data-filter]').forEach((el) => { el.value = filters[el.dataset.filter]; });
    $$('[data-tag]').forEach((el) => {
      el.setAttribute("aria-pressed", String(filters.tag === el.dataset.tag));
      el.classList.toggle("here", filters.tag === el.dataset.tag);
    });
    renderComments();
  }

  function updateFilters() {
    const url = new URL(location.href);
    Object.entries(filters).forEach(([key, value]) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key));
    history.replaceState(null, "", url);
    render();
  }

  function readFilters() {
    const params = new URLSearchParams(location.search);
    Object.keys(filters).forEach((key) => { filters[key] = params.get(key) || ""; });
    $("#feed-search").value = filters.q;
  }

  function wireFilters() {
    $("#feed-search").addEventListener("input", (e) => { filters.q = e.target.value.trim(); updateFilters(); });
    $("#main").addEventListener("change", (e) => {
      if (!e.target.matches("[data-filter]")) return;
      filters[e.target.dataset.filter] = e.target.value;
      updateFilters();
    });
    $("#main").addEventListener("click", (e) => {
      const button = e.target.closest("button");
      if (!button) return;
      if (button.hasAttribute("data-attachment")) {
        const post = posts.find((p) => p.id === button.dataset.post);
        const att = post?.attachments?.[Number(button.dataset.attachment)];
        if (att) openInspector(att);
        return;
      }
      if (button.hasAttribute("data-tag")) {
        const tag = button.dataset.tag;
        filters.tag = filters.tag === tag ? "" : tag;
        updateFilters();
        if (!button.isConnected) $$("#feed-rail-left [data-tag]").find((el) => el.dataset.tag === tag)?.focus({ preventScroll: true });
      } else if (button.hasAttribute("data-remove")) {
        filters[button.dataset.remove] = "";
        $("#feed-search").value = filters.q;
        updateFilters();
        $("#feed-search").focus({ preventScroll: true });
      } else if (button.hasAttribute("data-clear")) {
        Object.keys(filters).forEach((key) => { filters[key] = ""; });
        $("#feed-search").value = "";
        updateFilters();
        $("#feed-search").focus({ preventScroll: true });
      }
    });
    stream.addEventListener("click", (event) => {
      if (event.target.closest("a, button, input, select, textarea")) return;
      const card = event.target.closest(".feed-post");
      if (card) selectPost(card.id);
    });
    stream.addEventListener("keydown", (event) => {
      if (event.target.matches(".feed-post") && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault(); selectPost(event.target.id, true);
      }
    });
    window.addEventListener("popstate", () => { readFilters(); render(); });
  }

  const modal = $("#inspector-modal");
  const canvas = $("#inspector-canvas");
  const body = $("#inspector-body");
  let zoom = 1, panX = 0, panY = 0, drag = null;
  let returnFocus = null, previousOverflow = "";

  function paintTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    $("#inspector-zoom-level").textContent = `${Math.round(zoom * 100)}%`;
    $("#inspector-zoom-out").disabled = zoom <= 0.5;
    $("#inspector-zoom-in").disabled = zoom >= 4;
  }
  function setZoom(value) { zoom = Math.max(0.5, Math.min(4, value)); paintTransform(); }
  function fit() { zoom = 1; panX = 0; panY = 0; paintTransform(); }

  function openInspector(att) {
    const drawing = attachmentType(att) === "drawing";
    returnFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    $("#inspector-title").textContent = att.title || (drawing ? "Drawing" : "Image");
    $("#inspector-cap").textContent = att.caption || "";
    $("#inspector-badge").textContent = drawing ? "Drawing" : "Image";
    canvas.innerHTML = "";
    if (drawing && att.svg_inline) {
      canvas.innerHTML = att.svg_inline;
      const svg = canvas.querySelector("svg");
      if (svg) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", att.title || "Drawing"); }
    } else {
      const source = drawing ? att.svg_file : att.file;
      if (source) {
        const image = document.createElement("img");
        image.alt = att.title || "Attachment";
        image.draggable = false;
        image.addEventListener("error", () => { canvas.textContent = "This attachment could not be loaded."; });
        image.src = source;
        canvas.append(image);
      } else { canvas.textContent = "No preview is available for this attachment."; }
    }
    fit();
    modal.showModal();
    document.body.style.overflow = "hidden";
    $("#inspector-close").focus();
  }

  function wireInspector() {
    $("#inspector-close").addEventListener("click", () => modal.close());
    modal.addEventListener("close", () => {
      document.body.style.overflow = previousOverflow;
      canvas.innerHTML = "";
      drag = null;
      returnFocus?.focus({ preventScroll: true });
    });
    $("#inspector-zoom-in").addEventListener("click", () => setZoom(zoom + 0.25));
    $("#inspector-zoom-out").addEventListener("click", () => setZoom(zoom - 0.25));
    $("#inspector-zoom-reset").addEventListener("click", fit);
    body.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(zoom + (e.deltaY < 0 ? 0.15 : -0.15)); }, { passive: false });
    body.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX - panX, y: e.clientY - panY };
      body.setPointerCapture(e.pointerId);
    });
    body.addEventListener("pointermove", (e) => {
      if (!drag) return;
      panX = e.clientX - drag.x; panY = e.clientY - drag.y; paintTransform();
    });
    body.addEventListener("pointerup", () => { drag = null; });
    body.addEventListener("pointercancel", () => { drag = null; });
    modal.addEventListener("keydown", (e) => {
      if (["+", "=", "-", "0", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
      if (e.key === "+" || e.key === "=") setZoom(zoom + 0.25);
      if (e.key === "-") setZoom(zoom - 0.25);
      if (e.key === "0") fit();
      if (e.key === "ArrowLeft") panX -= 40;
      if (e.key === "ArrowRight") panX += 40;
      if (e.key === "ArrowUp") panY -= 40;
      if (e.key === "ArrowDown") panY += 40;
      paintTransform();
      // Keep site-wide search shortcuts from opening a second modal.
      e.stopPropagation();
    });
  }

  (async function init() {
    const data = await json("data/feed.json");
    if (!Array.isArray(data?.posts)) { fail(stream, "Couldn't load the feed. Please reload to try again."); return; }
    feedData = data;
    posts = [...data.posts].sort((a, b) => b.date.localeCompare(a.date));
    renderSidebar();
    wireFilters();
    wireInspector();
    readFilters();
    render();
  })();
})();
