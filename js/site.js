/* =========================================================================
   DNF — shared behaviour
   Theme, nav, reveal-on-scroll, the meters, the ticker, the command palette.
   Everything here is progressive: with JS off the pages still read fine.
   ========================================================================= */

(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* -------------------------------------------------------------- theme */

  const root = document.documentElement;
  const themeBtn = $("[data-theme-toggle]");

  function currentTheme() {
    if (root.dataset.theme) return root.dataset.theme;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function paintThemeButton() {
    if (!themeBtn) return;
    const dark = currentTheme() === "dark";
    themeBtn.setAttribute(
      "aria-label",
      dark ? "Switch to light theme" : "Switch to dark theme"
    );
    themeBtn.innerHTML = dark
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1Z"/></svg>';
  }

  if (themeBtn) {
    paintThemeButton();
    themeBtn.addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try {
        localStorage.setItem("dnf-theme", next);
      } catch (e) {
        /* private mode — the choice just won't outlive the tab */
      }
      paintThemeButton();
    });
  }

  /* ---------------------------------------------------------------- nav */

  const menuBtn = $("[data-menu]");
  const nav = $("#nav");
  if (menuBtn && nav) {
    const setOpen = (open) => {
      nav.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
    };
    menuBtn.addEventListener("click", () =>
      setOpen(!nav.classList.contains("open"))
    );
    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  }

  /* ------------------------------------------------------------- reveal */

  /*
   * One observer serves both jobs: fading sections in, and letting the
   * progress meters draw themselves the moment they're actually on screen.
   * Anything registered later (rendered by a page script) calls
   * DNF.observe() to join in.
   */
  const io =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              entry.target.classList.add(
                entry.target.classList.contains("meter") ? "lit" : "in"
              );
              io.unobserve(entry.target);
            });
          },
          { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
        )
      : null;

  function observe(scope) {
    const targets = $$("[data-rise], .meter", scope || document);
    if (!io) {
      targets.forEach((el) =>
        el.classList.add(el.classList.contains("meter") ? "lit" : "in")
      );
      return;
    }
    targets.forEach((el) => {
      if (!el.classList.contains("in") && !el.classList.contains("lit")) {
        io.observe(el);
      }
    });
  }
  observe();

  /*
   * Safety net. The reveal is a nicety, but a page that never fires the
   * observer — a background tab that gets discarded, a browser quirk, an
   * embedded view that never composites — would leave real content
   * permanently invisible. After a few seconds, show everything regardless.
   */
  function revealAll() {
    $$("[data-rise]").forEach((el) => el.classList.add("in"));
    $$(".meter").forEach((el) => el.classList.add("lit"));
  }
  setTimeout(revealAll, 2500);
  addEventListener("beforeprint", revealAll);

  /* ------------------------------------------------------------- ticker */

  /* The strip scrolls by translating -50%, so the content has to exist
     twice for the loop to be seamless. Duplicate it here rather than in
     the markup. */
  const track = $(".ticker-track");
  if (track && !track.dataset.doubled) {
    track.dataset.doubled = "1";
    track.append(...Array.from(track.children).map((n) => n.cloneNode(true)));
  }

  /* ----------------------------------------------------------- lightbox */

  const lb = $("#lightbox");
  if (lb) {
    const img = $("img", lb);
    const cap = $("[data-lb-cap]", lb);
    const title = $("[data-lb-title]", lb);
    const counter = $("[data-lb-count]", lb);
    let shots = [];
    let at = 0;
    let opener = null;

    function show(i) {
      shots = $$("[data-shot]");
      if (!shots.length) return;
      at = (i + shots.length) % shots.length;
      const el = shots[at];
      img.src = el.dataset.full;
      img.alt = el.dataset.title || "";
      if (title) title.textContent = el.dataset.title || "";
      if (cap) cap.textContent = el.dataset.caption || "";
      if (counter) counter.textContent = `${at + 1} / ${shots.length}`;
    }

    function open(i, from) {
      opener = from || null;
      lb.hidden = false;
      document.body.style.overflow = "hidden";
      show(i);
      $("[data-lb-close]", lb).focus();
    }

    function close() {
      lb.hidden = true;
      document.body.style.overflow = "";
      if (opener) opener.focus();
    }

    document.addEventListener("click", (e) => {
      const shot = e.target.closest("[data-shot]");
      if (shot) {
        open($$("[data-shot]").indexOf(shot), shot);
        return;
      }
      if (e.target.closest("[data-lb-close]") || e.target === lb) close();
      if (e.target.closest("[data-lb-prev]")) show(at - 1);
      if (e.target.closest("[data-lb-next]")) show(at + 1);
    });

    document.addEventListener("keydown", (e) => {
      if (lb.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") show(at - 1);
      if (e.key === "ArrowRight") show(at + 1);
    });
  }

  /* ---------------------------------------------------- command palette */

  /*
   * ⌘K / Ctrl-K opens a jump list over every page, every note and every
   * episode note on the site. The index is built once, on first open, so a
   * visitor who never presses the key never pays for it.
   */
  const pal = $("#palette");
  if (pal) {
    const input = $("input", pal);
    const list = $("ul", pal);
    const none = $(".palette-none", pal);
    let index = null;
    let hits = [];
    let cursor = 0;
    let opener = null;

    const STATIC = [
      { label: "Home", href: "index.html", kind: "page" },
      { label: "Hod — Sims 1 tools", href: "hod.html", kind: "page" },
      { label: "Attack of the Show — episode notes", href: "aots.html", kind: "page" },
      { label: "Writing & notes", href: "library.html", kind: "page" },
      { label: "About", href: "about.html", kind: "page" },
      { label: "GitHub — DnfJeff", href: "https://github.com/DnfJeff", kind: "link" },
      { label: "YouTube — Dnf_Jeff", href: "https://www.youtube.com/@Dnf_Jeff", kind: "link" },
    ];

    async function build() {
      if (index) return index;
      index = STATIC.slice();
      const grab = async (url, map) => {
        try {
          const res = await fetch(url, { cache: "no-cache" });
          if (res.ok) index.push(...map(await res.json()));
        } catch (e) {
          /* offline or opened from file:// — the static entries still work */
        }
      };
      await Promise.all([
        grab("data/library.json", (d) =>
          (d.entries || []).map((e) => ({
            label: e.title,
            href: `note.html?n=${encodeURIComponent(e.path)}`,
            kind: e.section.toLowerCase(),
          }))
        ),
        grab("data/aots.json", (d) =>
          (d.notes || []).map((n) => ({
            label: `${n.date} — ${n.title}`,
            href: `aots.html?ep=${n.date}`,
            kind: "episode",
          }))
        ),
      ]);
      return index;
    }

    function score(item, q) {
      const label = item.label.toLowerCase();
      const i = label.indexOf(q);
      if (i === 0) return 0;
      if (i > 0) return 1;
      // Fall back to a loose subsequence match so "s2check" finds the
      // Sims 2 checklist.
      let at = -1;
      for (const ch of q) {
        at = label.indexOf(ch, at + 1);
        if (at === -1) return null;
      }
      return 2;
    }

    function render() {
      list.innerHTML = "";
      none.hidden = hits.length > 0;
      hits.forEach((item, i) => {
        const li = document.createElement("li");
        li.setAttribute("aria-selected", String(i === cursor));
        const a = document.createElement("a");
        a.href = item.href;
        if (item.kind === "link") {
          a.target = "_blank";
          a.rel = "noopener";
        }
        const span = document.createElement("span");
        span.textContent = item.label;
        const small = document.createElement("small");
        small.textContent = item.kind;
        a.append(span, small);
        li.append(a);
        list.append(li);
      });
    }

    function filter() {
      const q = input.value.trim().toLowerCase();
      const all = index || STATIC;
      hits = !q
        ? all.slice(0, 12)
        : all
            .map((item) => ({ item, s: score(item, q) }))
            .filter((r) => r.s !== null)
            .sort((a, b) => a.s - b.s)
            .slice(0, 24)
            .map((r) => r.item);
      cursor = 0;
      render();
    }

    async function open() {
      opener = document.activeElement;
      pal.hidden = false;
      document.body.style.overflow = "hidden";
      input.value = "";
      filter();
      input.focus();
      await build();
      filter();
    }

    function close() {
      pal.hidden = true;
      document.body.style.overflow = "";
      if (opener && opener.focus) opener.focus();
    }

    document.addEventListener("keydown", (e) => {
      const key = e.key.toLowerCase();
      if (key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        pal.hidden ? open() : close();
        return;
      }
      // "/" opens it too, as long as you aren't already typing somewhere.
      if (
        key === "/" &&
        pal.hidden &&
        !/^(input|textarea|select)$/i.test(document.activeElement.tagName)
      ) {
        e.preventDefault();
        open();
        return;
      }
      if (pal.hidden) return;
      if (e.key === "Escape") {
        close();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!hits.length) return;
        cursor = (cursor + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length;
        render();
        list.children[cursor].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && hits[cursor]) {
        e.preventDefault();
        list.children[cursor].querySelector("a").click();
      }
    });

    input.addEventListener("input", filter);
    pal.addEventListener("click", (e) => {
      if (e.target === pal) close();
    });
    $$("[data-palette-open]").forEach((btn) =>
      btn.addEventListener("click", () => (pal.hidden ? open() : close()))
    );
  }

  /* -------------------------------------------------------------- export */

  /* Every helper below is a plain function, not a method — page scripts
     destructure these off DNF, which would break any use of `this`. */

  /** Escape a string for safe interpolation into innerHTML. */
  function esc(s) {
    return String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]
    );
  }

  /** Fetch JSON, returning null instead of throwing. */
  async function json(url) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(String(res.status));
      return await res.json();
    } catch (e) {
      console.warn("DNF: could not load", url, e);
      return null;
    }
  }

  function fail(el, msg) {
    if (el) el.innerHTML = `<div class="empty"><p>${esc(msg)}</p></div>`;
  }

  window.DNF = { $, $$, observe, esc, json, fail };
})();
