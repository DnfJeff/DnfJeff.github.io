    let globalPosts = [];
    const commentDrafts = new Map();
    const commentCount = post => `${(post.comments || []).length} ${(post.comments || []).length === 1 ? 'comment' : 'comments'}`;
    let feedOptions = { projects: [], statuses: [] };
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    async function loadFeedOptions() {
      const response = await fetch('/api/feed-options');
      feedOptions = await response.json();
      [['p-project', 'projects'], ['p-status', 'statuses'], ['n-project', 'projects']].forEach(([id, key]) => {
        const select = document.getElementById(id);
        const previous = select.value;
        select.innerHTML = (id === 'n-project' ? '<option value="">No project</option>' : '') + feedOptions[key].map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
        const preferred = key === 'projects' ? 'Hod' : 'in motion';
        select.value = id === 'n-project' && !previous ? '' : feedOptions[key].includes(previous) ? previous : (feedOptions[key].includes(preferred) ? preferred : (feedOptions[key][0] || ''));
      });
    }

    const optionDialog = document.getElementById('feed-option-dialog');
    let optionKind = 'project';
    let optionTarget = 'p-project';
    document.querySelectorAll('[data-add-option]').forEach(button => button.addEventListener('click', () => {
      optionKind = button.dataset.addOption;
      optionTarget = button.dataset.optionTarget || (optionKind === 'project' ? 'p-project' : 'p-status');
      document.getElementById('feed-option-heading').textContent = `Add ${optionKind}`;
      document.getElementById('feed-option-name').value = '';
      document.getElementById('feed-option-error').textContent = '';
      optionDialog.showModal();
      document.getElementById('feed-option-name').focus();
    }));
    document.getElementById('feed-option-cancel').addEventListener('click', () => optionDialog.close());
    document.getElementById('feed-option-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const kind = optionKind;
      const value = document.getElementById('feed-option-name').value.trim();
      if (!value) return;
      const response = await fetch('/api/add-feed-option', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({kind, value}) });
      const result = await response.json();
      if (!result.success) { document.getElementById('feed-option-error').textContent = result.error; return; }
      await loadFeedOptions();
      document.getElementById(optionTarget).value = result.value;
      await loadDispatchesTable();
      optionDialog.close();
    });

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tabId);
      });
      document.querySelectorAll('.studio-tab-content').forEach(c => c.hidden = true);
      const target = document.getElementById(tabId);
      if (target) target.hidden = false;
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.getElementById('p-date').value = new Date().toISOString().split('T')[0];

    const bodyInput = document.getElementById('p-body');
    const previewBox = document.getElementById('p-preview');
    bodyInput.addEventListener('input', () => {
      previewBox.innerHTML = bodyInput.value
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        .replace(/`([^`]+)`/gim, '<code>$1</code>')
        .replace(/\n\n/gim, '<p></p>')
        .replace(/\n/gim, '<br>');
    });

    function addAttachmentRow(type = 'drawing', file = '', title = '', caption = '') {
      const attList = document.getElementById('attachments-list');
      const row = document.createElement('div');
      row.className = 'attach-row';
      row.innerHTML = `
        <select class="att-type" style="width:130px">
          <option value="drawing" ${type === 'drawing' ? 'selected' : ''}>.excalidraw</option>
          <option value="image" ${type === 'image' ? 'selected' : ''}>Image/GIF</option>
        </select>
        <input type="text" class="att-file" placeholder="posts/assets/drawing.excalidraw" value="${file}" style="flex:1"/>
        <input type="text" class="att-title" placeholder="Drawing Title" value="${title}" style="flex:1"/>
        <input type="text" class="att-caption" placeholder="Caption (optional)" value="${caption}" style="flex:1"/>
        <button type="button" class="btn btn-ghost" onclick="this.parentElement.remove()">✕</button>`;

      const fInput = row.querySelector('.att-file');
      const tSelect = row.querySelector('.att-type');
      fInput.addEventListener('input', () => {
        const val = fInput.value.trim().toLowerCase();
        if (val.endsWith('.excalidraw') || val.endsWith('.svg')) {
          tSelect.value = 'drawing';
        } else if (val.endsWith('.png') || val.endsWith('.jpg') || val.endsWith('.jpeg') || val.endsWith('.webp') || val.endsWith('.gif')) {
          tSelect.value = 'image';
        }
      });

      attList.appendChild(row);
    }

    document.getElementById('btn-add-att').addEventListener('click', () => addAttachmentRow());

    function resetForm() {
      document.getElementById('p-id').value = '';
      document.getElementById('p-title').value = '';
      document.getElementById('p-project').value = feedOptions.projects.includes('Hod') ? 'Hod' : feedOptions.projects[0];
      document.getElementById('p-status').value = feedOptions.statuses.includes('in motion') ? 'in motion' : feedOptions.statuses[0];
      document.getElementById('p-tags').value = '';
      document.getElementById('p-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('p-summary').value = '';
      document.getElementById('p-body').value = '';
      document.getElementById('attachments-list').innerHTML = '';
      previewBox.innerHTML = '<p class="soft">Live preview will appear here...</p>';
      document.getElementById('save-msg').textContent = '';
      Array.from(document.getElementById('p-related-notes').options).forEach(option => { option.selected = false; });
      renderRelatedNoteChoices();
    }

    let activeManageFilter = 'all';
    let manageSearchQuery = '';

    function editPost(id) {
      const p = globalPosts.find(x => x.id === id);
      if (!p) return;
      document.getElementById('p-id').value = p.id;
      document.getElementById('p-title').value = p.title || '';
      document.getElementById('p-project').value = p.project || 'General';
      document.getElementById('p-status').value = p.status || 'in motion';
      document.getElementById('p-tags').value = (p.tags || []).join(', ');
      document.getElementById('p-date').value = p.date || '';
      document.getElementById('p-summary').value = p.summary || '';
      document.getElementById('p-body').value = p.body || '';
      Array.from(document.getElementById('p-related-notes').options).forEach(option => {
        option.selected = (p.linked_notes || []).some(note => note.path === option.value);
      });
      renderRelatedNoteChoices();

      const attList = document.getElementById('attachments-list');
      attList.innerHTML = '';
      (p.attachments || []).forEach(a => {
        addAttachmentRow(a.type, a.file, a.title, a.caption);
      });

      bodyInput.dispatchEvent(new Event('input'));
      switchTab('tab-composer');
    }

    function quickAddAddendum(postId) {
      switchTab('tab-addendums');
      const sel = document.getElementById('a-post-select');
      if (sel) {
        sel.value = postId;
        renderExistingComments();
      }
      const noteInput = document.getElementById('a-note');
      if (noteInput) noteInput.focus();
    }

    async function changeStatus(postId, newStatus) {
      try {
        const res = await fetch('/api/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post_id: postId, status: newStatus })
        });
        const data = await res.json();
        if (data.success) {
          loadDispatchesTable();
        } else {
          alert('Error updating status: ' + data.error);
        }
      } catch(e) {
        alert('Error: ' + e);
      }
    }

    function renderDispatchesTable() {
      const tbody = document.getElementById('dispatches-table-body');
      if (!tbody) return;

      const filtered = globalPosts.filter(p => {
        if (activeManageFilter !== 'all' && (p.status || '').toLowerCase() !== activeManageFilter) {
          return false;
        }
        if (manageSearchQuery) {
          const haystack = `${p.title} ${p.project} ${p.summary} ${(p.tags||[]).join(' ')}`.toLowerCase();
          if (!haystack.includes(manageSearchQuery)) return false;
        }
        return true;
      });

      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="soft" style="text-align:center;padding:var(--s4)">No posts match the current filter.</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(p => `
        <tr>
          <td class="mono" style="font-size:0.84rem;white-space:nowrap">${escapeHtml(p.date)}</td>
          <td><b>${escapeHtml(p.project)}</b></td>
          <td>
            <a href="post.html?p=${encodeURIComponent(p.id)}" target="_blank" style="color:var(--ink);text-decoration:none;font-weight:600">${escapeHtml(p.title)}</a>
            ${p.summary ? `<p class="soft" style="font-size:0.82rem;margin:2px 0 0">${escapeHtml(p.summary)}</p>` : ''}
          </td>
          <td>
            <select class="pill" onchange="changeStatus('${p.id}', this.value)" style="cursor:pointer;border:none;outline:none" title="Change status instantly">
              ${feedOptions.statuses.map(status => `<option value="${escapeHtml(status)}" ${p.status === status ? 'selected' : ''}>${escapeHtml(status)}</option>`).join('')}
            </select>
          </td>
          <td class="stamp">${(p.attachments||[]).length} atts</td>
          <td class="stamp">${(p.comments||[]).length}</td>
          <td style="white-space:nowrap">
            <button type="button" class="btn btn-ghost" style="padding:2px 8px;font-size:0.8rem" onclick="editPost('${p.id}')">Edit</button>
            <button type="button" class="btn btn-ghost" style="padding:2px 8px;font-size:0.8rem" onclick="quickAddAddendum('${p.id}')">Comments</button>
            <a href="post.html?p=${encodeURIComponent(p.id)}" target="_blank" class="btn btn-ghost" style="padding:2px 8px;font-size:0.8rem;text-decoration:none">View ↗</a>
          </td>
        </tr>
      `).join('');
    }

    async function loadDispatchesTable() {
      try {
        const res = await fetch('/api/posts');
        const data = await res.json();
        globalPosts = data.posts || [];

        // Update counts
        const countAll = globalPosts.length;
        const countEl = document.getElementById('manage-count');
        if (countEl) countEl.textContent = `${countAll} total posts`;

        if (document.getElementById('count-all')) document.getElementById('count-all').textContent = countAll;
        document.getElementById('manage-status-filters').innerHTML = feedOptions.statuses.map(status =>
          `<button type="button" class="chip ${activeManageFilter === status ? 'here' : ''}" data-manage-filter="${escapeHtml(status)}">${escapeHtml(status)} (${globalPosts.filter(p => p.status === status).length})</button>`).join(' ');

        renderDispatchesTable();
        loadPostsForAddendums();
      } catch(e){}
    }

    document.querySelector('.status-filter-bar').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-manage-filter]');
      if (!btn) return;
        document.querySelectorAll('[data-manage-filter]').forEach(b => b.classList.remove('here'));
        btn.classList.add('here');
        activeManageFilter = btn.dataset.manageFilter;
        renderDispatchesTable();
    });

    document.getElementById('manage-search')?.addEventListener('input', (e) => {
      manageSearchQuery = e.target.value.toLowerCase().trim();
      renderDispatchesTable();
    });

    // Keyboard shortcut Ctrl+S / Cmd+S in composer
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        const composerTab = document.getElementById('tab-composer');
        if (composerTab && !composerTab.hidden) {
          e.preventDefault();
          document.getElementById('post-form').dispatchEvent(new Event('submit', { cancelable: true }));
        }
      }
    });

    document.getElementById('btn-rebuild-all').addEventListener('click', async () => {
      const btn = document.getElementById('btn-rebuild-all');
      btn.disabled = true;
      btn.textContent = 'Rebuilding...';
      try {
        const res = await fetch('/api/rebuild', { method: 'POST' });
        const data = await res.json();
        alert(data.message);
        loadStatus();
        loadDispatchesTable();
      } catch(e) {
        alert('Rebuild error: ' + e);
      } finally {
        btn.disabled = false;
        btn.textContent = '⚡ Rebuild All';
      }
    });

    document.getElementById('post-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveMsg = document.getElementById('save-msg');
      saveMsg.textContent = 'Saving post...';

      const attRows = Array.from(document.querySelectorAll('.attach-row'));
      const attachments = attRows.map(r => ({
        type: r.querySelector('.att-type').value,
        file: r.querySelector('.att-file').value.trim(),
        title: r.querySelector('.att-title').value.trim(),
        caption: r.querySelector('.att-caption').value.trim(),
      })).filter(a => a.file);

      const selNotes = Array.from(document.getElementById('p-related-notes').selectedOptions).map(o => o.value);

      const payload = {
        id: document.getElementById('p-id').value.trim() || undefined,
        title: document.getElementById('p-title').value.trim(),
        project: document.getElementById('p-project').value,
        status: document.getElementById('p-status').value,
        tags: document.getElementById('p-tags').value.split(',').map(t => t.trim()).filter(Boolean),
        date: document.getElementById('p-date').value,
        summary: document.getElementById('p-summary').value.trim(),
        related_notes: selNotes,
        attachments: attachments,
        body: document.getElementById('p-body').value.trim()
      };

      try {
        const res = await fetch('/api/save-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          saveMsg.textContent = '✓ Post saved & published!';
          loadDispatchesTable();
          setTimeout(() => switchTab('tab-manage'), 1200);
        } else {
          saveMsg.textContent = 'Error: ' + data.error;
        }
      } catch(e) {
        saveMsg.textContent = 'Error: ' + e;
      }
    });

    async function loadLibraryOptions() {
      try {
        const res = await fetch('/api/library');
        const data = await res.json();
        const sel = document.getElementById('p-related-notes');
        const selected = Array.from(sel.selectedOptions).map(option => option.value);
        sel.innerHTML = (data.entries || []).map(n => `
          <option value="${escapeHtml(n.path)}" ${selected.includes(n.path) ? 'selected' : ''}>${escapeHtml(n.section)}: ${escapeHtml(n.title)}</option>
        `).join('');
        renderRelatedNoteChoices();
      } catch(e){}
    }

    function renderRelatedNoteChoices() {
      const select = document.getElementById('p-related-notes');
      const query = document.getElementById('related-note-search').value.toLowerCase();
      document.getElementById('related-note-count').textContent = select.selectedOptions.length ? `${select.selectedOptions.length} selected` : 'None selected';
      const matches = Array.from(select.options).filter(option => option.textContent.toLowerCase().includes(query));
      document.getElementById('related-note-choices').innerHTML = matches.map(option => `<label class="related-note-choice"><input type="checkbox" value="${escapeHtml(option.value)}" ${option.selected ? 'checked' : ''}><span>${escapeHtml(option.textContent)}</span></label>`).join('') || '<p class="soft">No matching notes.</p>';
    }
    document.getElementById('related-note-search').addEventListener('input', renderRelatedNoteChoices);
    document.getElementById('related-note-choices').addEventListener('change', event => {
      const option = Array.from(document.getElementById('p-related-notes').options).find(option => option.value === event.target.value);
      if (option) option.selected = event.target.checked;
      document.getElementById('related-note-count').textContent = `${document.getElementById('p-related-notes').selectedOptions.length} selected`;
    });

    async function loadPostsForAddendums() {
      const sel = document.getElementById('a-post-select');
      const previous = sel.value;
      sel.innerHTML = globalPosts.map(p => `
        <option value="${escapeHtml(p.id)}">${escapeHtml(p.date)} — [${escapeHtml(p.project)}] ${escapeHtml(p.title)} (${(p.comments||[]).length} ${(p.comments||[]).length === 1 ? 'comment' : 'comments'})</option>
      `).join('');
      if (globalPosts.some(p => p.id === previous)) sel.value = previous;
      renderExistingComments();
    }

    function renderExistingComments() {
      const selId = document.getElementById('a-post-select').value;
      const listEl = document.getElementById('a-existing-list');
      const post = globalPosts.find(p => p.id === selId);
      renderCommentPostList();
      document.getElementById('comment-thread-heading').innerHTML = post ? `<span class="eyebrow">${escapeHtml(post.project)} · ${commentCount(post)}</span><h3>${escapeHtml(post.title)}</h3><div class="thread-choice-meta"><span>Posted ${escapeHtml(post.date)}</span><a class="text-action" target="_blank" href="post.html?p=${encodeURIComponent(post.id)}">Open post ↗</a></div>` : '<h3>Select a post</h3>';
      document.getElementById('a-note').value = commentDrafts.get(selId) || '';
      document.querySelector('#addendum-form button[type="submit"]').disabled = !post;
      if (!post || !post.comments || !post.comments.length) {
        listEl.innerHTML = '<div class="thread-empty"><h4>A little room for what comes next.</h4><p>No comments yet. Add the first follow-up below.</p></div>';
        return;
      }
      listEl.innerHTML = post.comments.map(c => `
        <article class="comment-entry" data-comment-id="${escapeHtml(c.id)}">
          <span class="author-avatar" aria-hidden="true">JA</span><div>
            <div class="comment-meta"><strong>Jeff Adkins</strong><time>${escapeHtml(c.date)}</time></div>
            <div class="comment-reading"><p class="comment-copy">${escapeHtml(c.body)}</p><div class="comment-actions"><button type="button" class="text-action" data-comment-action="edit">Edit</button><button type="button" class="text-action delete-action" data-comment-action="delete">Delete</button></div></div>
            <div class="comment-edit" hidden><textarea aria-label="Edit comment">${escapeHtml(c.body)}</textarea><div class="comment-actions"><button type="button" class="text-action" data-comment-action="cancel">Cancel</button><button type="button" class="btn btn-solid" data-comment-action="save">Save changes</button></div></div>
          </div>
        </article>`).join('');
    }

    function renderCommentPostList() {
      const selected = document.getElementById('a-post-select').value;
      const query = document.getElementById('comment-search').value.toLowerCase().trim();
      const posts = globalPosts.filter(p => `${p.title} ${p.project}`.toLowerCase().includes(query));
      document.getElementById('comment-post-list').innerHTML = posts.length ? posts.map(p => `<button type="button" class="thread-choice ${p.id === selected ? 'selected' : ''}" aria-pressed="${p.id === selected}" data-thread="${escapeHtml(p.id)}"><span class="thread-choice-meta">${escapeHtml(p.project)}</span><strong>${escapeHtml(p.title)}</strong><span class="thread-choice-meta"><span>${escapeHtml(p.date)}</span><span>${commentCount(p)}</span></span></button>`).join('') : '<p class="soft">No matching posts.</p>';
    }
    document.getElementById('comment-search').addEventListener('input', renderCommentPostList);
    document.getElementById('a-note').addEventListener('input', event => commentDrafts.set(document.getElementById('a-post-select').value, event.target.value));
    document.getElementById('comment-post-list').addEventListener('click', event => {
      const choice = event.target.closest('[data-thread]');
      if (!choice) return;
      document.getElementById('a-post-select').value = choice.dataset.thread;
      document.getElementById('a-note').value = '';
      document.getElementById('addendum-msg').textContent = '';
      renderExistingComments();
    });

    document.getElementById('a-post-select').addEventListener('change', renderExistingComments);
    document.getElementById('a-existing-list').addEventListener('click', async (event) => {
      const button = event.target.closest('[data-comment-action]');
      if (!button) return;
      const item = button.closest('[data-comment-id]');
      if (button.dataset.commentAction === 'edit' || button.dataset.commentAction === 'cancel') {
        const editing = button.dataset.commentAction === 'edit';
        item.querySelector('.comment-reading').hidden = editing;
        item.querySelector('.comment-edit').hidden = !editing;
        item.querySelector('textarea').value = item.querySelector('.comment-copy').textContent;
        if (editing) item.querySelector('textarea').focus();
        return;
      }
      const deleting = button.dataset.commentAction === 'delete';
      if (deleting && !confirm('Delete this comment?')) return;
      const response = await fetch(deleting ? '/api/delete-comment' : '/api/save-comment', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ post_id: document.getElementById('a-post-select').value, id: item.dataset.commentId, body: item.querySelector('textarea').value })
      });
      const result = await response.json();
      document.getElementById('addendum-msg').textContent = result.success ? (deleting ? 'Comment deleted.' : 'Comment updated.') : result.error;
      if (result.success) await loadDispatchesTable();
    });

    document.getElementById('addendum-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('addendum-msg');
      msg.textContent = 'Adding comment...';
      const payload = {
        post_id: document.getElementById('a-post-select').value,
        body: document.getElementById('a-note').value.trim()
      };
      try {
        const res = await fetch('/api/save-comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          msg.textContent = '✓ Comment added.';
          commentDrafts.delete(payload.post_id);
          document.getElementById('a-note').value = '';
          loadDispatchesTable();
        } else {
          msg.textContent = 'Error: ' + data.error;
        }
      } catch(e) {
        msg.textContent = 'Error: ' + e;
      }
    });

    async function loadStatus() {
      try {
        const res = await fetch('/api/status');
        const d = await res.json();
        const ind = document.getElementById('git-indicator');
        if (d.git_changed) {
          ind.className = 'status-badge dirty';
          ind.textContent = 'Git: Changes Pending';
        } else {
          ind.className = 'status-badge clean';
          ind.textContent = 'Git: Clean';
        }
        document.getElementById('git-output').textContent = d.git_status || 'Working tree clean. All files committed.';
      } catch(e){}
    }

    document.getElementById('btn-git-commit').addEventListener('click', async () => {
      const msg = prompt('Commit message:', 'Update posts and site');
      if (!msg) return;
      const res = await fetch('/api/git-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      const data = await res.json();
      alert(data.stdout || data.stderr || 'Committed.');
      loadStatus();
    });

    document.getElementById('btn-git-push').addEventListener('click', async () => {
      const btn = document.getElementById('btn-git-push');
      btn.disabled = true;
      btn.textContent = 'Pushing...';
      try {
        const res = await fetch('/api/git-push', { method: 'POST' });
        const data = await res.json();
        alert(data.stdout || data.stderr || 'Pushed to GitHub Pages.');
        loadStatus();
      } catch(e) {
        alert('Push failed: ' + e);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Push to GitHub';
      }
    });

    // Library writing and import share filing controls and project names.
    const filing = () => ({ section: document.getElementById('n-section').value, project: document.getElementById('n-project').value });
    document.querySelectorAll('[data-library-mode]').forEach(button => button.addEventListener('click', () => {
      const writing = button.dataset.libraryMode === 'write';
      document.getElementById('note-form').hidden = !writing;
      document.getElementById('library-import-pane').hidden = writing;
      document.getElementById('note-tags-field').hidden = !writing;
      document.querySelectorAll('[data-library-mode]').forEach(item => {
        item.classList.toggle('active', item === button);
        item.setAttribute('aria-pressed', String(item === button));
      });
    }));

    document.getElementById('note-form').addEventListener('submit', async event => {
      event.preventDefault();
      const button = event.submitter || event.target.querySelector('[type="submit"]');
      const message = document.getElementById('note-msg');
      button.disabled = true;
      message.textContent = 'Saving your note…';
      try {
        const response = await fetch('/api/save-note', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({
          ...filing(), title: document.getElementById('n-title').value.trim(), summary: document.getElementById('n-summary').value.trim(),
          tags: document.getElementById('n-tags').value.split(',').map(t => t.trim()).filter(Boolean), body: document.getElementById('n-body').value
        }) });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Could not save note.');
        message.innerHTML = `Saved locally. <a href="note.html?n=${encodeURIComponent(result.path)}" target="_blank">Read note ↗</a>`;
        event.target.reset();
        await loadLibraryOptions();
        loadStatus();
      } catch (error) { message.textContent = error.message; }
      finally { button.disabled = false; }
    });

    let importFiles = [];
    let importing = false;
    function renderImportQueue() {
      document.getElementById('note-import-queue').innerHTML = importFiles.map((file, index) => `<div class="import-file"><span class="stamp">MD</span><div><strong>${escapeHtml(file.name)}</strong><span class="stamp">${Math.max(1, Math.round(file.size / 1024))} KB · Ready to import</span></div><button type="button" class="text-action" data-remove-import="${index}" aria-label="Remove ${escapeHtml(file.name)}">Remove</button></div>`).join('');
      const button = document.getElementById('import-notes');
      button.disabled = !importFiles.length;
      button.textContent = importFiles.length ? `Import ${importFiles.length} note${importFiles.length === 1 ? '' : 's'} →` : 'Import notes →';
    }
    function queueFiles(files) {
      if (importing) return;
      const errors = [];
      for (const file of files) {
        if (!/\.md$/i.test(file.name)) { errors.push(`${file.name}: choose a .md file.`); continue; }
        if (file.size > 2000000) { errors.push(`${file.name}: exceeds 2 MB.`); continue; }
        if (importFiles.length >= 30) { errors.push('A batch can contain up to 30 notes.'); break; }
        if (!importFiles.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) importFiles.push(file);
      }
      renderImportQueue();
      document.getElementById('import-msg').textContent = errors.length ? errors.join(' ') : 'Ready to import. Existing notes are kept; matching filenames get a number.';
    }
    const dropzone = document.getElementById('note-dropzone');
    ['dragenter', 'dragover'].forEach(name => dropzone.addEventListener(name, event => { event.preventDefault(); dropzone.classList.add('drag-over'); }));
    dropzone.addEventListener('dragleave', event => { if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove('drag-over'); });
    dropzone.addEventListener('drop', event => { event.preventDefault(); dropzone.classList.remove('drag-over'); queueFiles(event.dataTransfer.files); });
    document.getElementById('choose-note-files').addEventListener('click', () => document.getElementById('note-files').click());
    document.getElementById('note-files').addEventListener('change', event => { queueFiles(event.target.files); event.target.value = ''; });
    document.getElementById('note-import-queue').addEventListener('click', event => {
      const button = event.target.closest('[data-remove-import]');
      if (!button || importing) return;
      importFiles.splice(Number(button.dataset.removeImport), 1); renderImportQueue();
    });
    document.getElementById('import-notes').addEventListener('click', async event => {
      const button = event.currentTarget;
      const message = document.getElementById('import-msg');
      if (importing || !importFiles.length) return;
      importing = true;
      button.disabled = true;
      document.getElementById('choose-note-files').disabled = true;
      message.textContent = 'Importing notes…';
      try {
        const files = await Promise.all(importFiles.map(async file => ({ name: file.name, content: await file.text() })));
        const response = await fetch('/api/import-notes', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ...filing(), files }) });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Import failed.');
        message.textContent = `${result.paths.length} note${result.paths.length === 1 ? '' : 's'} added to your local library. Ready to publish in Git & Sync.`;
        importFiles = []; renderImportQueue();
        await loadLibraryOptions(); loadStatus();
      } catch (error) { message.textContent = error.message; }
      finally { importing = false; document.getElementById('choose-note-files').disabled = false; button.disabled = !importFiles.length; }
    });

    loadStatus();
    loadLibraryOptions();
    loadFeedOptions().then(loadDispatchesTable);
