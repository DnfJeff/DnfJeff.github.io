#!/usr/bin/env python3
"""
DNF Content Studio — Local Site Manager (Pass 2)
A lightweight, offline browser-based dashboard for managing Feed dispatches,
surfacing In-Motion / Done tags, author addendums, library writings,
Excalidraw attachments, and one-click site rebuilds.

Run:
    python tools/studio.py
"""

import http.server
import json
import os
import re
import socketserver
import subprocess
import sys
import urllib.parse
import urllib.request
import webbrowser
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTS = ROOT / "posts"
NOTES = ROOT / "notes"
DATA = ROOT / "data"
PORT = 4040


def run_command(cmd, cwd=ROOT):
    try:
        env = os.environ.copy()
        env.update({
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "safe.directory",
            "GIT_CONFIG_VALUE_0": ROOT.as_posix(),
        })
        res = subprocess.run(
            cmd, cwd=cwd, capture_output=True, text=True, timeout=45, shell=True,
            env=env,
        )
        return {
            "success": res.returncode == 0,
            "stdout": res.stdout.strip(),
            "stderr": res.stderr.strip(),
        }
    except Exception as e:
        return {"success": False, "stdout": "", "stderr": str(e)}


def rebuild_all():
    out_lines = []
    # 1. Build library
    lib_res = run_command(f'"{sys.executable}" tools/build-library.py')
    out_lines.append(f"build-library: {lib_res['stdout'] or lib_res['stderr']}")

    # 2. Build feed
    feed_res = run_command(f'"{sys.executable}" tools/build-feed.py')
    out_lines.append(f"build-feed: {feed_res['stdout'] or feed_res['stderr']}")

    success = lib_res["success"] and feed_res["success"]
    return success, "\n".join(out_lines)


class StudioHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)

        if url.path == "/api/status":
            self.send_json(self.get_status())
            return
        elif url.path == "/api/posts":
            self.send_json(self.get_posts())
            return
        elif url.path == "/api/get-post":
            params = urllib.parse.parse_qs(url.query)
            p_id = params.get("id", [""])[0]
            self.send_json(self.get_single_post(p_id))
            return
        elif url.path == "/api/library":
            self.send_json(self.get_library())
            return
        elif url.path == "/" or url.path == "/studio":
            self.send_html(self.render_dashboard())
            return

        super().do_GET()

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8", errors="replace")

        try:
            data = json.loads(body) if body else {}
        except Exception:
            data = {}

        if url.path == "/api/rebuild":
            ok, msg = rebuild_all()
            self.send_json({"success": ok, "message": msg})
        elif url.path == "/api/save-post":
            self.send_json(self.save_post(data))
        elif url.path == "/api/update-status":
            self.send_json(self.update_status(data))
        elif url.path == "/api/add-addendum":
            self.send_json(self.add_addendum(data))
        elif url.path == "/api/save-note":
            self.send_json(self.save_note(data))
        elif url.path == "/api/git-commit":
            msg = data.get("message") or "Update feed and library dispatches"
            cmd = f'git add . && git commit -m "{msg}"'
            res = run_command(cmd)
            self.send_json(res)
        elif url.path == "/api/git-push":
            res = run_command("git push")
            self.send_json(res)
        else:
            self.send_response(404)
            self.end_headers()

    def send_json(self, obj, code=200):
        raw = json.dumps(obj, indent=2).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(raw)

    def send_html(self, html_str, code=200):
        raw = html_str.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(raw)

    def get_status(self):
        git_res = run_command("git status --short")
        feed_count = 0
        feed_file = DATA / "feed.json"
        if feed_file.exists():
            try:
                feed_count = json.loads(feed_file.read_text(encoding="utf-8")).get(
                    "count", 0
                )
            except Exception:
                pass

        lib_count = 0
        lib_file = DATA / "library.json"
        if lib_file.exists():
            try:
                lib_count = json.loads(lib_file.read_text(encoding="utf-8")).get(
                    "count", 0
                )
            except Exception:
                pass

        return {
            "feed_count": feed_count,
            "library_count": lib_count,
            "git_changed": bool(git_res["stdout"]),
            "git_status": git_res["stdout"],
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }

    def get_posts(self):
        feed_file = DATA / "feed.json"
        if feed_file.exists():
            try:
                return json.loads(feed_file.read_text(encoding="utf-8"))
            except Exception:
                pass
        return {"posts": [], "count": 0}

    def get_single_post(self, post_id):
        feed = self.get_posts()
        for p in feed.get("posts", []):
            if p.get("id") == post_id:
                return {"success": True, "post": p}
        return {"success": False, "error": "Post not found"}

    def get_library(self):
        lib_file = DATA / "library.json"
        if lib_file.exists():
            try:
                return json.loads(lib_file.read_text(encoding="utf-8"))
            except Exception:
                pass
        return {"entries": [], "count": 0}

    def update_status(self, data):
        post_id = data.get("post_id")
        new_status = data.get("status")
        if not post_id or not new_status:
            return {"success": False, "error": "post_id and status required"}

        file_path = POSTS / f"{post_id}.md"
        if not file_path.exists():
            return {"success": False, "error": "File not found"}

        content = file_path.read_text(encoding="utf-8")
        if re.search(r"status:\s*.*", content):
            content = re.sub(r'status:\s*["\']?.*?["\']?\n', f'status: "{new_status}"\n', content, count=1)
        else:
            content = re.sub(r"---\n", f'---\nstatus: "{new_status}"\n', content, count=1)

        file_path.write_text(content, encoding="utf-8")
        run_command(f'"{sys.executable}" tools/build-feed.py')
        return {"success": True, "status": new_status}

    def save_post(self, data):
        title = data.get("title", "").strip()
        if not title:
            return {"success": False, "error": "Title is required"}

        post_id = data.get("id")
        d_str = data.get("date") or date.today().isoformat()
        if not post_id:
            slug = re.sub(r"[^\w]+", "-", title.lower()).strip("-")
            post_id = f"{d_str}-{slug}"

        file_path = POSTS / f"{post_id}.md"

        frontmatter = {
            "title": title,
            "date": d_str,
            "project": data.get("project") or "General",
            "status": data.get("status") or "in motion",
            "tags": data.get("tags") or [],
            "summary": data.get("summary") or "",
            "related_notes": data.get("related_notes") or [],
            "attachments": data.get("attachments") or [],
            "addendums": data.get("addendums") or [],
        }

        body = data.get("body", "").strip()
        raw_lines = ["---"]
        for k, v in frontmatter.items():
            if isinstance(v, list):
                if not v:
                    raw_lines.append(f"{k}: []")
                elif k in ("attachments", "addendums"):
                    raw_lines.append(f"{k}:")
                    for item in v:
                        raw_lines.append("  -")
                        for ik, iv in item.items():
                            raw_lines.append(f'    {ik}: "{iv}"')
                else:
                    raw_lines.append(f"{k}:")
                    for item in v:
                        raw_lines.append(f'  - "{item}"')
            elif isinstance(v, str):
                raw_lines.append(f'{k}: "{v}"')
            else:
                raw_lines.append(f"{k}: {v}")
        raw_lines.append("---")
        raw_lines.append("")
        raw_lines.append(body)
        raw_lines.append("")

        POSTS.mkdir(parents=True, exist_ok=True)
        file_path.write_text("\n".join(raw_lines), encoding="utf-8")

        run_command(f'"{sys.executable}" tools/build-feed.py')
        return {"success": True, "id": post_id, "path": file_path.as_posix()}

    def add_addendum(self, data):
        post_id = data.get("post_id")
        note_text = data.get("note", "").strip()
        if not post_id or not note_text:
            return {"success": False, "error": "Post ID and Note are required"}

        file_path = POSTS / f"{post_id}.md"
        if not file_path.exists():
            return {"success": False, "error": f"Post file not found: {post_id}.md"}

        content = file_path.read_text(encoding="utf-8")
        date_str = (
            data.get("date") or datetime.now().strftime("%Y-%m-%d %H:%M")
        )

        parts = content.split("---", 2)
        if len(parts) < 3:
            return {"success": False, "error": "Invalid frontmatter in post"}

        raw_fm = parts[1]
        body = parts[2]

        new_entry = f'  - date: "{date_str}"\n    note: "{note_text}"\n'

        if "addendums:" in raw_fm:
            raw_fm = re.sub(
                r"(addendums:\s*(\[\])?)", r"addendums:\n" + new_entry, raw_fm
            )
        else:
            raw_fm = raw_fm.rstrip() + f"\naddendums:\n{new_entry}"

        new_content = f"---{raw_fm}---{body}"
        file_path.write_text(new_content, encoding="utf-8")

        run_command(f'"{sys.executable}" tools/build-feed.py')
        return {"success": True, "date": date_str}

    def save_note(self, data):
        title = data.get("title", "").strip()
        section = data.get("section") or "projects"
        summary = data.get("summary", "").strip()
        tags = data.get("tags") or []
        body = data.get("body", "").strip()

        if not title:
            return {"success": False, "error": "Note title is required"}

        slug = re.sub(r"[^\w]+", "-", title.lower()).strip("-")
        folder = NOTES / section
        folder.mkdir(parents=True, exist_ok=True)
        file_path = folder / f"{slug}.md"

        tag_str = ", ".join(tags) if isinstance(tags, list) else str(tags)
        date_str = date.today().isoformat()

        content = f"<!-- summary: {summary} -->\n"
        content += f"<!-- tags: {tag_str} -->\n"
        content += f"<!-- date: {date_str} -->\n\n"
        content += f"# {title}\n\n"
        content += body + "\n"

        file_path.write_text(content, encoding="utf-8")

        run_command(f'"{sys.executable}" tools/build-library.py')
        return {"success": True, "path": file_path.as_posix()}

    def render_dashboard(self):
        return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>DNF Content Studio</title>
  <link rel="stylesheet" href="css/site.css?v=2"/>
  <style>
    .studio-container { max-width: 1320px; margin: var(--s5) auto; padding: 0 var(--s5); }
    .studio-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--line); padding-bottom: var(--s4); margin-bottom: var(--s5); flex-wrap: wrap; gap: var(--s3); }
    .studio-tabs { display: flex; gap: var(--s2); margin-bottom: var(--s5); flex-wrap: wrap; }
    .tab-btn { font-family: var(--display); font-size: 1.05rem; padding: var(--s2) var(--s4); border: 1px solid var(--line); background: var(--surface); border-radius: var(--r-card); cursor: pointer; color: var(--ink); }
    .tab-btn.active { background: var(--accent-wash); border-color: var(--accent); color: var(--accent-ink); font-weight: 600; }
    .studio-form { display: grid; gap: var(--s4); }
    .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--s4); }
    .field { display: flex; flex-direction: column; gap: var(--s1); }
    .field label { font-family: var(--mono); font-size: 0.76rem; text-transform: uppercase; color: var(--ink-faint); font-weight: 600; }
    .field input, .field select, .field textarea { padding: var(--s3); border: 1px solid var(--line-strong); border-radius: 6px; font-family: inherit; font-size: 0.95rem; background: var(--surface); color: var(--ink); }
    .field textarea { font-family: var(--mono); font-size: 0.9rem; line-height: 1.5; min-height: 240px; }
    .split-editor { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s4); }
    .preview-box { border: 1px solid var(--line); border-radius: 6px; padding: var(--s4); background: var(--surface); overflow-y: auto; max-height: 400px; }
    .attach-row { display: flex; gap: var(--s2); align-items: center; margin-top: var(--s2); flex-wrap: wrap; }
    .status-badge { display: inline-flex; align-items: center; gap: var(--s2); padding: var(--s1) var(--s3); border-radius: var(--r-pill); font-family: var(--mono); font-size: 0.78rem; background: var(--surface-2); border: 1px solid var(--line); }
    .status-badge.clean { color: var(--done); border-color: var(--done); }
    .status-badge.dirty { color: var(--brand); border-color: var(--brand); }
    .action-bar { display: flex; gap: var(--s3); align-items: center; justify-content: flex-end; margin-top: var(--s4); }
    .post-table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    .post-table th, .post-table td { padding: var(--s3); border-bottom: 1px solid var(--line); text-align: left; }
    .post-table th { font-family: var(--mono); font-size: 0.76rem; text-transform: uppercase; color: var(--ink-faint); }
  </style>
</head>
<body>
  <div class="studio-container">
    <header class="studio-header">
      <div>
        <span class="eyebrow">Local Site Manager</span>
        <h1 style="margin:0;font-size:2rem">DNF Studio</h1>
      </div>
      <div style="display:flex;align-items:center;gap:var(--s3)">
        <span id="git-indicator" class="status-badge clean">Git: Clean</span>
        <button type="button" class="btn btn-solid" id="btn-rebuild-all">⚡ Rebuild All</button>
        <a href="feed.html" target="_blank" class="btn btn-ghost">Open Feed ↗</a>
      </div>
    </header>

    <div class="studio-tabs">
      <button class="tab-btn active" data-tab="tab-manage">Dispatches Manager</button>
      <button class="tab-btn" data-tab="tab-composer">Feed Composer</button>
      <button class="tab-btn" data-tab="tab-addendums">Field Notes &amp; Updates</button>
      <button class="tab-btn" data-tab="tab-library">Library Notes</button>
      <button class="tab-btn" data-tab="tab-sync">Git &amp; Sync</button>
      <button class="tab-btn" data-tab="tab-obsidian">Obsidian Guide</button>
    </div>

    <!-- TAB 0: DISPATCHES MANAGER -->
    <section id="tab-manage" class="studio-tab-content">
      <div class="card" style="padding:var(--s5)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--s4);flex-wrap:wrap;gap:var(--s3)">
          <div>
            <h3 style="margin:0">Dispatches &amp; Timeline Feed</h3>
            <span class="stamp" id="manage-count">Loading dispatches...</span>
          </div>
          <div style="display:flex;gap:var(--s2);align-items:center">
            <input type="search" id="manage-search" placeholder="Search dispatches, project, tags..." style="padding:6px 12px;border:1px solid var(--line-strong);border-radius:6px;font-size:0.88rem;width:240px"/>
            <button type="button" class="btn btn-solid" onclick="switchTab('tab-composer'); resetForm();">+ New Dispatch</button>
          </div>
        </div>

        <!-- Prominently Surfaced Status Filter Chips -->
        <div class="status-filter-bar" style="display:flex;gap:var(--s2);margin-bottom:var(--s4);flex-wrap:wrap;align-items:center">
          <span class="eyebrow" style="margin:0">Status Filter:</span>
          <button type="button" class="chip here" data-manage-filter="all" id="mf-all">All (<span id="count-all">0</span>)</button>
          <button type="button" class="chip" data-manage-filter="in motion" id="mf-in-motion">In Motion (<span id="count-in-motion">0</span>)</button>
          <button type="button" class="chip" data-manage-filter="done" id="mf-done">Done (<span id="count-done">0</span>)</button>
          <button type="button" class="chip" data-manage-filter="ahead" id="mf-ahead">Ahead (<span id="count-ahead">0</span>)</button>
          <button type="button" class="chip" data-manage-filter="shelf" id="mf-shelf">Shelved (<span id="count-shelf">0</span>)</button>
        </div>

        <div style="overflow-x:auto">
          <table class="post-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Title</th>
                <th>Status (Instant Change)</th>
                <th>Attachments</th>
                <th>Field Updates</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="dispatches-table-body">
              <tr><td colspan="7" class="soft">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- TAB 1: FEED COMPOSER -->
    <section id="tab-composer" class="studio-tab-content" hidden>
      <div class="card" style="padding:var(--s5)">
        <form id="post-form" class="studio-form">
          <input type="hidden" id="p-id"/>
          <div class="form-row">
            <div class="field" style="grid-column: span 2">
              <label>Dispatch Title</label>
              <input type="text" id="p-title" placeholder="e.g. Save Editor: Parsing Sims 1 IFF Chunks" required/>
            </div>
            <div class="field">
              <label>Project</label>
              <select id="p-project">
                <option value="Hod">Hod</option>
                <option value="Attack of the Show">Attack of the Show</option>
                <option value="Tools">Tools</option>
                <option value="Research">Research</option>
                <option value="General">General</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label>Status Pill</label>
              <select id="p-status">
                <option value="in motion">in motion</option>
                <option value="done">done</option>
                <option value="ahead">ahead</option>
                <option value="shelf">shelved</option>
              </select>
            </div>
            <div class="field">
              <label>Tags (comma separated)</label>
              <input type="text" id="p-tags" placeholder="Sims 1, Reverse engineering, Hod"/>
            </div>
            <div class="field">
              <label>Date</label>
              <input type="date" id="p-date"/>
            </div>
          </div>

          <div class="field">
            <label>One-Line Summary</label>
            <input type="text" id="p-summary" placeholder="Brief lede summary shown on preview cards..."/>
          </div>

          <div class="field">
            <label>Link to Library Notes</label>
            <select id="p-related-notes" multiple style="min-height:90px"></select>
            <span class="stamp">Hold Ctrl / Cmd to select multiple notes</span>
          </div>

          <div class="field">
            <label>Bundled Attachments (Images, GIFs, .excalidraw Drawings)</label>
            <div id="attachments-list"></div>
            <button type="button" class="btn btn-ghost" id="btn-add-att" style="align-self:flex-start;margin-top:var(--s2)">+ Add Attachment</button>
          </div>

          <div class="field">
            <label>Dispatch Body (Markdown)</label>
            <div class="split-editor">
              <textarea id="p-body" placeholder="Write in Markdown. Bold **text**, `code`, lists, and quotes work seamlessly..."></textarea>
              <div class="preview-box feed-prose" id="p-preview">
                <p class="soft">Live preview will appear here...</p>
              </div>
            </div>
          </div>

          <div class="action-bar">
            <span id="save-msg" class="stamp"></span>
            <button type="submit" class="btn btn-solid">Save &amp; Publish Dispatch</button>
          </div>
        </form>
      </div>
    </section>

    <!-- TAB 2: ADDENDUMS -->
    <section id="tab-addendums" class="studio-tab-content" hidden>
      <div class="card" style="padding:var(--s5)">
        <h3 style="margin-top:0">Append Field Note / Update</h3>
        <p class="soft">
          Add timestamped progress logs or follow-ups to an existing dispatch without mutating the original body text.
        </p>

        <form id="addendum-form" class="studio-form">
          <div class="field">
            <label>Select Target Dispatch</label>
            <select id="a-post-select"></select>
          </div>

          <div id="a-existing-list" style="margin:var(--s3) 0"></div>

          <div class="field">
            <label>New Addendum / Field Note</label>
            <textarea id="a-note" style="min-height:100px" placeholder="e.g. Tested on real save. Verified endianness difference in Mac PowerPC release." required></textarea>
          </div>

          <div class="action-bar">
            <span id="addendum-msg" class="stamp"></span>
            <button type="submit" class="btn btn-solid">Append Field Note</button>
          </div>
        </form>
      </div>
    </section>

    <!-- TAB 3: LIBRARY -->
    <section id="tab-library" class="studio-tab-content" hidden>
      <div class="card" style="padding:var(--s5)">
        <h3 style="margin-top:0">Add New Library Note</h3>
        <p class="soft">Create a guide, checklist, or research document under <code>notes/</code>.</p>
        <form id="note-form" class="studio-form">
          <div class="form-row">
            <div class="field" style="grid-column: span 2">
              <label>Note Title</label>
              <input type="text" id="n-title" placeholder="e.g. Sims 1 — Hex Offsets Reference" required/>
            </div>
            <div class="field">
              <label>Section</label>
              <select id="n-section">
                <option value="projects">Projects</option>
                <option value="sims-guides">Sims Guides</option>
                <option value="tools">Tools</option>
                <option value="writing">Writing</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="field" style="grid-column: span 2">
              <label>Tags</label>
              <input type="text" id="n-tags" placeholder="Sims 1, Reverse engineering, Reference"/>
            </div>
            <div class="field">
              <label>Summary</label>
              <input type="text" id="n-summary" placeholder="One or two sentences for the library card"/>
            </div>
          </div>
          <div class="field">
            <label>Markdown Content</label>
            <textarea id="n-body" placeholder="Note content in Markdown..."></textarea>
          </div>
          <div class="action-bar">
            <span id="note-msg" class="stamp"></span>
            <button type="submit" class="btn btn-solid">Save Note to Library</button>
          </div>
        </form>
      </div>
    </section>

    <!-- TAB 4: GIT & SYNC -->
    <section id="tab-sync" class="studio-tab-content" hidden>
      <div class="card" style="padding:var(--s5)">
        <h3 style="margin-top:0">GitHub Pages Sync</h3>
        <p class="soft">Review changes and push to GitHub Pages in one click.</p>
        <div class="field">
          <label>Uncommitted Git Changes</label>
          <pre id="git-output" style="background:var(--code-bg);padding:var(--s3);border-radius:6px;max-height:220px;overflow-y:auto">Checking git status...</pre>
        </div>
        <div class="action-bar" style="justify-content:flex-start">
          <button type="button" class="btn btn-solid" id="btn-git-commit">Commit All Changes</button>
          <button type="button" class="btn btn-ghost" id="btn-git-push">Push to GitHub</button>
        </div>
      </div>
    </section>

    <!-- TAB 5: OBSIDIAN GUIDE -->
    <section id="tab-obsidian" class="studio-tab-content" hidden>
      <div class="card" style="padding:var(--s5)">
        <h3 style="margin-top:0">Integrating with Obsidian</h3>
        <p class="soft">
          You can seamlessly pair your Obsidian vault with DNF Content Studio:
        </p>
        <ol style="padding-left:1.4rem;line-height:1.7" class="soft">
          <li><strong>Direct Vault Folder:</strong> Add the <code>posts/</code> and <code>notes/</code> directories directly as folders in your Obsidian vault. Any <code>.md</code> note or <code>.excalidraw</code> drawing you drop here is immediately recognized by the site!</li>
          <li><strong>Obsidian Webview Panel:</strong> Install the community plugin <em>Custom Frames</em> or <em>Webviewer</em> in Obsidian and add <code>http://localhost:4040</code> as a frame. You will have this entire Studio UI open right in an Obsidian tab!</li>
          <li><strong>Excalidraw Drawings:</strong> Simply draw in Obsidian Excalidraw and save the <code>.excalidraw</code> file directly into <code>posts/assets/</code>. The build script automatically turns it into a responsive vector diagram.</li>
        </ol>
      </div>
    </section>
  </div>

  <script>
    let globalPosts = [];

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
        .replace(/\\*\\*(.*?)\\*\\*/gim, '<strong>$1</strong>')
        .replace(/`([^`]+)`/gim, '<code>$1</code>')
        .replace(/\\n\\n/gim, '<p></p>')
        .replace(/\\n/gim, '<br>');
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
      document.getElementById('p-project').value = 'Hod';
      document.getElementById('p-status').value = 'in motion';
      document.getElementById('p-tags').value = '';
      document.getElementById('p-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('p-summary').value = '';
      document.getElementById('p-body').value = '';
      document.getElementById('attachments-list').innerHTML = '';
      previewBox.innerHTML = '<p class="soft">Live preview will appear here...</p>';
      document.getElementById('save-msg').textContent = '';
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
        renderExistingAddendums();
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
        tbody.innerHTML = '<tr><td colspan="7" class="soft" style="text-align:center;padding:var(--s4)">No dispatches match the current filter.</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(p => `
        <tr>
          <td class="mono" style="font-size:0.84rem;white-space:nowrap">${p.date}</td>
          <td><b>${p.project}</b></td>
          <td>
            <a href="post.html?p=${encodeURIComponent(p.id)}" target="_blank" style="color:var(--ink);text-decoration:none;font-weight:600">${p.title}</a>
            ${p.summary ? `<p class="soft" style="font-size:0.82rem;margin:2px 0 0">${p.summary}</p>` : ''}
          </td>
          <td>
            <select class="pill ${p.status}" onchange="changeStatus('${p.id}', this.value)" style="cursor:pointer;border:none;outline:none" title="Change status instantly">
              <option value="in motion" ${p.status === 'in motion' ? 'selected' : ''}>in motion</option>
              <option value="done" ${p.status === 'done' ? 'selected' : ''}>done</option>
              <option value="ahead" ${p.status === 'ahead' ? 'selected' : ''}>ahead</option>
              <option value="shelf" ${p.status === 'shelf' ? 'selected' : ''}>shelved</option>
            </select>
          </td>
          <td class="stamp">${(p.attachments||[]).length} atts</td>
          <td class="stamp">${(p.addendums||[]).length} updates</td>
          <td style="white-space:nowrap">
            <button type="button" class="btn btn-ghost" style="padding:2px 8px;font-size:0.8rem" onclick="editPost('${p.id}')">Edit</button>
            <button type="button" class="btn btn-ghost" style="padding:2px 8px;font-size:0.8rem" onclick="quickAddAddendum('${p.id}')">+ Note</button>
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
        const countMotion = globalPosts.filter(p => p.status === 'in motion').length;
        const countDone = globalPosts.filter(p => p.status === 'done').length;
        const countAhead = globalPosts.filter(p => p.status === 'ahead').length;
        const countShelf = globalPosts.filter(p => p.status === 'shelf').length;

        const countEl = document.getElementById('manage-count');
        if (countEl) countEl.textContent = `${countAll} total dispatches`;

        if (document.getElementById('count-all')) document.getElementById('count-all').textContent = countAll;
        if (document.getElementById('count-in-motion')) document.getElementById('count-in-motion').textContent = countMotion;
        if (document.getElementById('count-done')) document.getElementById('count-done').textContent = countDone;
        if (document.getElementById('count-ahead')) document.getElementById('count-ahead').textContent = countAhead;
        if (document.getElementById('count-shelf')) document.getElementById('count-shelf').textContent = countShelf;

        renderDispatchesTable();
        loadPostsForAddendums();
      } catch(e){}
    }

    document.querySelectorAll('[data-manage-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-manage-filter]').forEach(b => b.classList.remove('here'));
        btn.classList.add('here');
        activeManageFilter = btn.dataset.manageFilter;
        renderDispatchesTable();
      });
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
      saveMsg.textContent = 'Saving dispatch...';

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
          saveMsg.textContent = '✓ Dispatch saved & published!';
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
        sel.innerHTML = (data.entries || []).map(n => `
          <option value="${n.path}">${n.section}: ${n.title}</option>
        `).join('');
      } catch(e){}
    }

    async function loadPostsForAddendums() {
      const sel = document.getElementById('a-post-select');
      sel.innerHTML = globalPosts.map(p => `
        <option value="${p.id}">${p.date} — [${p.project}] ${p.title} (${(p.addendums||[]).length} updates)</option>
      `).join('');
      renderExistingAddendums();
    }

    function renderExistingAddendums() {
      const selId = document.getElementById('a-post-select').value;
      const listEl = document.getElementById('a-existing-list');
      const post = globalPosts.find(p => p.id === selId);
      if (!post || !post.addendums || !post.addendums.length) {
        listEl.innerHTML = '<span class="stamp">No existing field notes on this post yet.</span>';
        return;
      }
      listEl.innerHTML = '<span class="eyebrow">Existing Addendums:</span><ul style="padding-left:1.2rem;margin:var(--s1) 0" class="soft">' +
        post.addendums.map(a => `<li><b>${a.date}:</b> ${a.note}</li>`).join('') + '</ul>';
    }

    document.getElementById('a-post-select').addEventListener('change', renderExistingAddendums);

    document.getElementById('addendum-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('addendum-msg');
      msg.textContent = 'Appending update...';
      const payload = {
        post_id: document.getElementById('a-post-select').value,
        note: document.getElementById('a-note').value.trim()
      };
      try {
        const res = await fetch('/api/add-addendum', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          msg.textContent = '✓ Field note logged & site rebuilt!';
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
      const msg = prompt('Commit message:', 'Update feed dispatches & site');
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

    loadStatus();
    loadLibraryOptions();
    loadDispatchesTable();
  </script>
</body>
</html>"""


class StudioServer(socketserver.TCPServer):
    allow_reuse_address = True


def main():
    url = f"http://127.0.0.1:{PORT}"
    print(f"Starting DNF Content Studio at {url}")
    try:
        server = StudioServer(("127.0.0.1", PORT), StudioHandler)
    except OSError as exc:
        # Reopening the desktop shortcut should bring back an existing Studio.
        try:
            with urllib.request.urlopen(f"{url}/api/status", timeout=2) as response:
                status = json.load(response)
            if "feed_count" in status and "library_count" in status:
                if "--no-browser" not in sys.argv:
                    webbrowser.open(url)
                return
        except (OSError, ValueError, KeyError):
            pass
        raise RuntimeError(f"Cannot start Studio on port {PORT}: {exc}") from exc

    if "--no-browser" not in sys.argv:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down DNF Content Studio.")
        server.server_close()


if __name__ == "__main__":
    main()
