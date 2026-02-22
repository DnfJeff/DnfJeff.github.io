/* ============================================================
   ANALOG ATLAS — Main JavaScript
   Handles: mobile nav, note library, note viewer, contact form
   ============================================================ */

(function () {
  'use strict';

  const REPO_OWNER = 'DnfJeff';
  const REPO_NAME  = 'DnfJeff.github.io';
  const API_BASE   = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;

  /* ----------------------------------------------------------
     1. Mobile Navigation Toggle
     ---------------------------------------------------------- */
  const navToggle = document.querySelector('.nav-toggle');
  const mobileNav = document.querySelector('.mobile-nav');

  // Always reset body overflow on fresh page load (prevents stuck state from prev page)
  document.body.style.overflow = '';

  if (navToggle && mobileNav) {
    // Remove the HTML hidden attribute so CSS takes over, but keep it closed
    mobileNav.removeAttribute('hidden');
    mobileNav.classList.remove('open');

    function openMobileNav() {
      mobileNav.classList.add('open');
      navToggle.classList.add('open');
      navToggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }

    function closeMobileNav() {
      mobileNav.classList.remove('open');
      navToggle.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    navToggle.addEventListener('click', () => {
      mobileNav.classList.contains('open') ? closeMobileNav() : openMobileNav();
    });

    // Close on link click
    mobileNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', closeMobileNav);
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileNav.classList.contains('open')) {
        closeMobileNav();
      }
    });
  }

  /* ----------------------------------------------------------
     2. Note Library — Workspace & Note Loading
     ---------------------------------------------------------- */
  const workspaceListEl = document.getElementById('workspace-list');
  const noteListEl      = document.getElementById('note-list');

  if (workspaceListEl && noteListEl) {
    loadWorkspaces();
  }

  async function loadWorkspaces() {
    try {
      const res = await fetch(`${API_BASE}/notes`);
      if (!res.ok) {
        if (res.status === 403) throw new Error('GitHub API rate limit reached. Try again later.');
        if (res.status === 404) throw new Error('Notes directory not found.');
        throw new Error(`HTTP ${res.status}`);
      }
      const items = await res.json();

      // Handle case where response is not an array (e.g. API error object)
      if (!Array.isArray(items)) throw new Error('Unexpected API response');

      const dirs = items.filter(i => i.type === 'dir');
      workspaceListEl.innerHTML = '';

      if (dirs.length === 0) {
        workspaceListEl.innerHTML = '<li style="color:var(--clr-text-muted);font-size:.9rem;">No workspaces found.</li>';
        noteListEl.innerHTML = '<div class="empty-state"><p>No workspaces available yet.</p></div>';
        return;
      }

      dirs.forEach((dir, idx) => {
        const btn = document.createElement('button');
        btn.textContent = formatName(dir.name);
        btn.dataset.workspace = dir.name;
        if (idx === 0) btn.classList.add('active');
        btn.addEventListener('click', () => selectWorkspace(dir.name, btn));

        const li = document.createElement('li');
        li.appendChild(btn);
        workspaceListEl.appendChild(li);
      });

      // Auto-load the first workspace
      loadNotes(dirs[0].name);
    } catch (err) {
      console.error('Failed to load workspaces:', err);
      workspaceListEl.innerHTML = `<li style="color:var(--clr-text-muted);font-size:.9rem;">${err.message || 'Could not load workspaces.'}</li>`;
      noteListEl.innerHTML = '<div class="empty-state"><p>Could not connect to the note library. Please try refreshing the page.</p></div>';
    }
  }

  function selectWorkspace(name, btn) {
    workspaceListEl.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadNotes(name);
  }

  async function loadNotes(workspace) {
    noteListEl.innerHTML = `
      <div class="skeleton" style="height:5rem;"></div>
      <div class="skeleton" style="height:5rem;"></div>
      <div class="skeleton" style="height:5rem;"></div>
    `;

    try {
      const res = await fetch(`${API_BASE}/notes/${workspace}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = await res.json();

      const files = items.filter(i => i.type === 'file');
      noteListEl.innerHTML = '';

      if (files.length === 0) {
        noteListEl.innerHTML = '<div class="empty-state"><p>No notes in this workspace yet.</p></div>';
        return;
      }

      files.forEach(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        const card = document.createElement('a');
        card.className = 'note-card';
        card.href = `note-viewer.html?workspace=${encodeURIComponent(workspace)}&note=${encodeURIComponent(file.name)}`;

        card.innerHTML = `
          <span class="note-type">${ext.toUpperCase()}</span>
          <h4>${formatName(file.name.replace(/\.[^.]+$/, ''))}</h4>
        `;
        noteListEl.appendChild(card);
      });
    } catch (err) {
      console.error('Failed to load notes', err);
      noteListEl.innerHTML = '<div class="empty-state"><p>Could not load notes for this workspace.</p></div>';
    }
  }

  /* ----------------------------------------------------------
     3. Note Viewer — Fetch & Render
     ---------------------------------------------------------- */
  const noteContentEl      = document.getElementById('note-content');
  const breadcrumbWorkspace = document.getElementById('breadcrumb-workspace');
  const breadcrumbNote      = document.getElementById('breadcrumb-note');

  if (noteContentEl) {
    const params    = new URLSearchParams(window.location.search);
    const workspace = params.get('workspace');
    const note      = params.get('note');

    if (workspace && note) {
      if (breadcrumbWorkspace) breadcrumbWorkspace.textContent = formatName(workspace);
      if (breadcrumbNote) breadcrumbNote.textContent = formatName(note.replace(/\.[^.]+$/, ''));
      document.title = `${formatName(note.replace(/\.[^.]+$/, ''))} — Analog Atlas`;
      loadNote(workspace, note);
    } else {
      noteContentEl.innerHTML = '<div class="empty-state"><p>No note specified. <a href="note-library.html">Go to the Note Library</a>.</p></div>';
    }
  }

  async function loadNote(workspace, note) {
    try {
      const ext = note.split('.').pop().toLowerCase();

      if (ext === 'html') {
        // For HTML notes, fetch raw content via GitHub API
        const res = await fetch(`${API_BASE}/notes/${workspace}/${encodeURIComponent(note)}`, {
          headers: { Accept: 'application/vnd.github.v3.raw' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();

        // Extract body content if it's a full HTML document
        const bodyContent = extractBody(html);
        noteContentEl.innerHTML = bodyContent;
      } else if (ext === 'md') {
        // For markdown, fetch raw and do a simple conversion
        const res = await fetch(`${API_BASE}/notes/${workspace}/${encodeURIComponent(note)}`, {
          headers: { Accept: 'application/vnd.github.v3.raw' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const md = await res.text();

        noteContentEl.innerHTML = simpleMarkdownToHtml(md);
      } else {
        noteContentEl.innerHTML = `<div class="empty-state"><p>Unsupported file type: .${ext}</p></div>`;
      }
    } catch (err) {
      console.error('Failed to load note', err);
      noteContentEl.innerHTML = '<div class="empty-state"><p>Could not load this note. It may not exist or the API rate limit may have been reached.</p></div>';
    }
  }

  /** Extract only the inner body content from a full HTML document string */
  function extractBody(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove the site's own nav/header/footer if present in the note HTML
    doc.querySelectorAll('header, nav, footer, script, link[rel="stylesheet"]').forEach(el => el.remove());

    // Try to grab .main-content or .content, fall back to body
    const main = doc.querySelector('.main-content') || doc.querySelector('.content') || doc.body;
    return main ? main.innerHTML : html;
  }

  /** Lightweight Markdown → HTML (covers the basics, no external dependency) */
  function simpleMarkdownToHtml(md) {
    let html = md
      // Code blocks (fenced)
      .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
        `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`)
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Headings
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // Horizontal rule
      .replace(/^---+$/gm, '<hr>')
      // Bold & italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Images
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      // Unordered list items
      .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
      // Ordered list items
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Wrap consecutive <li> in <ul>
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Paragraphs: wrap remaining lines
    html = html
      .split('\n\n')
      .map(block => {
        block = block.trim();
        if (!block) return '';
        if (/^<[hupol]|^<hr|^<img|^<pre|^<code|^<blockquote/i.test(block)) return block;
        return `<p>${block.replace(/\n/g, '<br>')}</p>`;
      })
      .join('\n');

    return html;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ----------------------------------------------------------
     4. Contact Form Handler
     ---------------------------------------------------------- */
  const contactForm = document.getElementById('contact-form');
  const formStatus  = document.getElementById('form-status');

  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();

      // Since this is a static site, show a friendly message.
      // Wire up to Formspree / Netlify Forms / your own endpoint later.
      if (formStatus) {
        formStatus.style.display = 'block';
        formStatus.textContent = 'Thanks for reaching out! (Note: The form backend is not yet configured — reach out via GitHub for now.)';
        formStatus.style.color = 'var(--clr-primary)';
      }
      contactForm.reset();
    });
  }

  /* ----------------------------------------------------------
     5. Utilities
     ---------------------------------------------------------- */

  /** Clean up a filename / directory name for display */
  function formatName(name) {
    return name
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

})();
