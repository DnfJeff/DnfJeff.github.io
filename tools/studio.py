#!/usr/bin/env python3
"""
DNF Content Studio — Local Site Manager (Pass 2)
A lightweight, offline browser-based dashboard for managing Feed posts,
project/status choices, author comments, library writings,
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
from uuid import uuid4
from frontmatter import parse as parse_frontmatter, dump as dump_frontmatter
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
        elif url.path == "/api/feed-options":
            self.send_json(self.get_feed_options())
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
        elif url.path == "/api/save-comment":
            self.send_json(self.save_comment(data))
        elif url.path == "/api/delete-comment":
            self.send_json(self.delete_comment(data))
        elif url.path == "/api/add-feed-option":
            self.send_json(self.add_feed_option(data))
        elif url.path == "/api/save-note":
            self.send_json(self.save_note(data))
        elif url.path == "/api/import-notes":
            self.send_json(self.import_notes(data))
        elif url.path == "/api/git-commit":
            msg = data.get("message") or "Update posts and library notes"
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

    def get_feed_options(self):
        path = DATA / "feed-options.json"
        saved = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        feed = self.get_posts()
        return {key: sorted(set(saved.get(key, [])) | set(feed.get(key, [])), key=str.casefold)
                for key in ("projects", "statuses")}

    def add_feed_option(self, data):
        key = {"project": "projects", "status": "statuses"}.get(data.get("kind"))
        value = str(data.get("value") or "").strip()
        if not key or not value or len(value) > 60 or any(c in value for c in "<>\n\r"):
            return {"success": False, "error": "Enter a project or status of up to 60 characters."}
        path = DATA / "feed-options.json"
        saved = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"projects": [], "statuses": []}
        match = next((item for item in self.get_feed_options()[key] if item.casefold() == value.casefold()), None)
        if match:
            return {"success": True, "value": match}
        saved.setdefault(key, []).append(value)
        path.write_text(json.dumps(saved, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        run_command(f'"{sys.executable}" tools/build-feed.py')
        return {"success": True, "value": value}

    def update_status(self, data):
        post_id = data.get("post_id")
        new_status = data.get("status")
        if not post_id or not re.fullmatch(r"[\w-]+", str(post_id)) or not new_status:
            return {"success": False, "error": "post_id and status required"}

        file_path = POSTS / f"{post_id}.md"
        if not file_path.exists():
            return {"success": False, "error": "File not found"}

        meta, body = parse_frontmatter(file_path.read_text(encoding="utf-8"))
        meta["status"] = new_status
        file_path.write_text(dump_frontmatter(meta, body), encoding="utf-8")
        run_command(f'"{sys.executable}" tools/build-feed.py')
        return {"success": True, "status": new_status}

    def save_post(self, data):
        title = data.get("title", "").strip()
        if not title:
            return {"success": False, "error": "Title is required"}

        post_id = data.get("id")
        if post_id and not re.fullmatch(r"[\w-]+", str(post_id)):
            return {"success": False, "error": "Invalid post ID"}
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
            "comments": (parse_frontmatter(file_path.read_text(encoding="utf-8"))[0].get("comments") or []) if file_path.exists() else [],
        }

        body = data.get("body", "").strip()
        POSTS.mkdir(parents=True, exist_ok=True)
        file_path.write_text(dump_frontmatter(frontmatter, body), encoding="utf-8")

        run_command(f'"{sys.executable}" tools/build-feed.py')
        return {"success": True, "id": post_id, "path": file_path.as_posix()}

    def comment_change(self, data, delete=False):
        post_id = str(data.get("post_id") or "")
        if not re.fullmatch(r"[\w-]+", post_id):
            return {"success": False, "error": "Invalid post ID"}
        path = POSTS / f"{post_id}.md"
        if not path.exists():
            return {"success": False, "error": "Post not found"}
        meta, body = parse_frontmatter(path.read_text(encoding="utf-8"))
        comments = meta.get("comments") or meta.get("addendums") or []
        meta.pop("addendums", None)
        comment_id = str(data.get("id") or "")
        existing = next((c for c in comments if c.get("id") == comment_id), None)
        if delete:
            if not existing:
                return {"success": False, "error": "Comment not found"}
            comments.remove(existing)
        else:
            comment_body = str(data.get("body") or "").strip()
            if not comment_body:
                return {"success": False, "error": "Comment cannot be empty"}
            if comment_id and not existing:
                return {"success": False, "error": "Comment not found"}
            if existing:
                existing["body"] = comment_body
            else:
                existing = {"id": uuid4().hex, "date": datetime.now().strftime("%Y-%m-%d %H:%M"), "body": comment_body}
                comments.append(existing)
        meta["comments"] = comments
        path.write_text(dump_frontmatter(meta, body), encoding="utf-8")
        ok = run_command(f'"{sys.executable}" tools/build-feed.py')
        return {"success": ok["success"], "comment": existing if not delete else None, "error": ok["stderr"] if not ok["success"] else ""}

    def save_comment(self, data):
        return self.comment_change(data)

    def delete_comment(self, data):
        return self.comment_change(data, delete=True)

    def save_note(self, data):
        title = data.get("title", "").strip()
        section = data.get("section") or "projects"
        summary = data.get("summary", "").strip()
        tags = data.get("tags") or []
        body = data.get("body", "").strip()

        if not title:
            return {"success": False, "error": "Note title is required"}
        if not re.fullmatch(r"[\w-]+", section):
            return {"success": False, "error": "Invalid section"}

        slug = re.sub(r"[^\w]+", "-", title.lower()).strip("-")
        folder = NOTES / section
        folder.mkdir(parents=True, exist_ok=True)
        file_path = self.unique_note_path(folder, slug or "note")

        tag_str = ", ".join(tags) if isinstance(tags, list) else str(tags)
        project = str(data.get("project") or "").strip()
        if project:
            tag_str = ", ".join(filter(None, [project, tag_str]))
        date_str = date.today().isoformat()

        content = f"<!-- summary: {summary} -->\n"
        content += f"<!-- tags: {tag_str} -->\n"
        content += f"<!-- date: {date_str} -->\n\n"
        content += f"# {title}\n\n"
        content += body + "\n"

        file_path.write_text(content, encoding="utf-8")

        result = run_command(f'"{sys.executable}" tools/build-library.py')
        return {"success": result["success"], "path": file_path.relative_to(ROOT).as_posix(), "error": result["stderr"]}

    @staticmethod
    def unique_note_path(folder, stem):
        path = folder / f"{stem}.md"
        suffix = 2
        while path.exists():
            path = folder / f"{stem}-{suffix}.md"
            suffix += 1
        return path

    def import_notes(self, data):
        section = str(data.get("section") or "projects")
        files = data.get("files") or []
        if not re.fullmatch(r"[\w-]+", section) or not isinstance(files, list) or not 1 <= len(files) <= 30:
            return {"success": False, "error": "Choose a section and 1–30 Markdown files."}
        for item in files:
            if not isinstance(item, dict) or not str(item.get("name", "")).lower().endswith(".md") or not isinstance(item.get("content"), str) or len(item["content"].encode("utf-8")) > 2_000_000:
                return {"success": False, "error": "Use .md files smaller than 2 MB each."}
        folder = NOTES / section
        folder.mkdir(parents=True, exist_ok=True)
        project = str(data.get("project") or "").strip()
        paths = []
        for item in files:
            stem = re.sub(r"[^\w-]+", "-", Path(item["name"]).stem).strip("-") or "note"
            path = self.unique_note_path(folder, stem)
            content = item["content"].lstrip("\ufeff")
            if project:
                match = re.search(r"<!--\s*tags:\s*(.*?)\s*-->", content, re.I)
                tags = [project] + ([t.strip() for t in match.group(1).split(",") if t.strip() != project] if match else [])
                comment = "<!-- tags: " + ", ".join(tags).replace("-->", "") + " -->"
                if match:
                    content = content[:match.start()] + comment + content[match.end():]
                else:
                    frontmatter = re.match(r"\A---\r?\n.*?\r?\n---(?:\r?\n|$)", content, re.S)
                    position = frontmatter.end() if frontmatter else 0
                    content = content[:position] + comment + "\n" + content[position:]
            path.write_text(content, encoding="utf-8")
            paths.append(path.relative_to(ROOT).as_posix())
        result = run_command(f'"{sys.executable}" tools/build-library.py')
        return {"success": result["success"], "paths": paths, "error": result["stderr"]}

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
  <link rel="stylesheet" href="tools/studio.css"/>
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
      <button class="tab-btn active" data-tab="tab-manage">Posts</button>
      <button class="tab-btn" data-tab="tab-composer">Post Composer</button>
      <button class="tab-btn" data-tab="tab-addendums">Comments</button>
      <button class="tab-btn" data-tab="tab-library">Library Notes</button>
      <button class="tab-btn" data-tab="tab-sync">Git &amp; Sync</button>
      <button class="tab-btn" data-tab="tab-obsidian">Obsidian Guide</button>
    </div>
    <dialog id="feed-option-dialog" class="card" style="padding:var(--s5);width:min(420px,calc(100vw - 2rem));color:var(--ink);background:var(--surface);border:1px solid var(--line-strong);border-radius:var(--r-card)">
      <form id="feed-option-form" class="studio-form">
        <h3 id="feed-option-heading" style="margin:0">Add project</h3>
        <div class="field"><label for="feed-option-name">Name</label><input id="feed-option-name" maxlength="60" required autocomplete="off"></div>
        <div class="action-bar"><button type="button" class="btn btn-ghost" id="feed-option-cancel">Cancel</button><button type="submit" class="btn btn-solid">Add</button></div>
        <span id="feed-option-error" class="stamp" role="status"></span>
      </form>
    </dialog>

    <!-- TAB 0: DISPATCHES MANAGER -->
    <section id="tab-manage" class="studio-tab-content">
      <div class="card" style="padding:var(--s5)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--s4);flex-wrap:wrap;gap:var(--s3)">
          <div>
            <h3 style="margin:0">Posts &amp; Timeline Feed</h3>
            <span class="stamp" id="manage-count">Loading posts...</span>
          </div>
          <div style="display:flex;gap:var(--s2);align-items:center">
            <input type="search" id="manage-search" placeholder="Search posts, project, tags..." style="padding:6px 12px;border:1px solid var(--line-strong);border-radius:6px;font-size:0.88rem;width:240px"/>
            <button type="button" class="btn btn-solid" onclick="switchTab('tab-composer'); resetForm();">+ New Post</button>
          </div>
        </div>

        <!-- Prominently Surfaced Status Filter Chips -->
        <div class="status-filter-bar" style="display:flex;gap:var(--s2);margin-bottom:var(--s4);flex-wrap:wrap;align-items:center">
          <span class="eyebrow" style="margin:0">Status Filter:</span>
          <button type="button" class="chip here" data-manage-filter="all" id="mf-all">All (<span id="count-all">0</span>)</button>
          <span id="manage-status-filters"></span>
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
                <th>Comments</th>
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
      <div class="workspace-heading"><div><span class="eyebrow">From the workbench</span><h2>Post Composer</h2><p class="soft">Tell the story, then add the details.</p></div></div>
      <div class="card" style="padding:var(--s5)">
        <form id="post-form" class="studio-form">
          <input type="hidden" id="p-id"/>
          <div class="form-row">
            <div class="field" style="grid-column: span 2">
              <label>Post Title</label>
              <input type="text" id="p-title" placeholder="e.g. Save Editor: Parsing Sims 1 IFF Chunks" required/>
            </div>
            <div class="field">
              <div class="field-heading"><label for="p-project">Project</label><button type="button" class="text-action" data-add-option="project" data-option-target="p-project">+ New</button></div>
              <select id="p-project"></select>
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <div class="field-heading"><label for="p-status">Status</label><button type="button" class="text-action" data-add-option="status" data-option-target="p-status">+ New</button></div>
              <select id="p-status"></select>
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
            <details class="related-notes-picker"><summary>Related library notes <span id="related-note-count" class="stamp">None selected</span></summary>
              <input type="search" id="related-note-search" placeholder="Find a note…" aria-label="Find a related library note">
              <div id="related-note-choices"></div>
            </details>
            <select id="p-related-notes" multiple hidden aria-label="Selected library notes"></select>
          </div>

          <div class="field">
            <label>Bundled Attachments (Images, GIFs, .excalidraw Drawings)</label>
            <div id="attachments-list"></div>
            <button type="button" class="btn btn-ghost" id="btn-add-att" style="align-self:flex-start;margin-top:var(--s2)">+ Add Attachment</button>
          </div>

          <div class="field">
            <label>Post Body (Markdown)</label>
            <div class="split-editor">
              <textarea id="p-body" placeholder="Write in Markdown. Bold **text**, `code`, lists, and quotes work seamlessly..."></textarea>
              <div class="preview-box feed-prose" id="p-preview">
                <p class="soft">Live preview will appear here...</p>
              </div>
            </div>
          </div>

          <div class="action-bar">
            <span id="save-msg" class="stamp"></span>
            <button type="submit" class="btn btn-solid">Save Post</button>
          </div>
        </form>
      </div>
    </section>

    <!-- Comments workspace -->
    <section id="tab-addendums" class="studio-tab-content" hidden>
      <div class="workspace-heading"><div><span class="eyebrow">The conversation</span><h2>Comments</h2><p class="soft">Follow up on your work, one post at a time.</p></div><span class="workspace-kicker">AUTHOR ONLY</span></div>
      <div class="comments-workspace">
        <aside class="thread-sidebar">
          <label class="eyebrow" for="comment-search">Find a post</label>
          <input id="comment-search" type="search" placeholder="Search posts…" class="studio-input">
          <div id="comment-post-list" class="thread-list"></div>
          <select id="a-post-select" hidden aria-label="Selected post"></select>
        </aside>
        <div class="thread-pane">
          <header id="comment-thread-heading" class="thread-heading"></header>
          <div id="a-existing-list" class="comment-timeline"></div>
          <form id="addendum-form" class="comment-compose">
            <span class="author-avatar" aria-hidden="true">JA</span>
            <div class="comment-compose-body"><label for="a-note">Add to the conversation</label>
              <textarea id="a-note" class="studio-input" placeholder="A follow-up, a discovery, a next step…" required></textarea>
              <div class="comment-compose-footer"><span id="addendum-msg" role="status" class="soft"></span><button type="submit" class="btn btn-solid">Add comment →</button></div>
            </div>
          </form>
        </div>
      </div>
    </section>

    <!-- Library workspace -->
    <section id="tab-library" class="studio-tab-content" hidden>
      <div class="workspace-heading"><div><span class="eyebrow">Build your reference shelf</span><h2>Library Notes</h2><p class="soft">Write something new or bring in notes you already have.</p></div><a href="library.html" target="_blank" class="text-action">View library ↗</a></div>
      <div class="library-workspace">
        <div class="library-main">
          <div class="workspace-mode" role="group" aria-label="Create a note"><button type="button" class="active" data-library-mode="write" aria-pressed="true">Write a note</button><button type="button" data-library-mode="import" aria-pressed="false">Import Markdown</button></div>
          <form id="note-form" class="note-writing-pane">
            <label class="sr-only" for="n-title">Note title</label><input id="n-title" class="note-title-input" placeholder="Give your note a title" required>
            <label for="n-summary" class="eyebrow">A short introduction</label><input id="n-summary" class="studio-input" placeholder="What will someone find in this note?">
            <div class="editor-label"><label for="n-body" class="eyebrow">Your note</label><span class="stamp">MARKDOWN</span></div>
            <textarea id="n-body" class="studio-input note-body-input" placeholder="Start writing…" required></textarea>
            <div class="workspace-footer"><span id="note-msg" role="status" class="soft"></span><button type="submit" class="btn btn-solid">Save to library →</button></div>
          </form>
          <div id="library-import-pane" class="note-import-pane" hidden>
            <div id="note-dropzone" class="note-dropzone">
              <span class="drop-symbol" aria-hidden="true">↓</span><h3>Bring your notes with you</h3><p>Drop Markdown files here, or choose them from your computer.</p>
              <button type="button" id="choose-note-files" class="btn btn-ghost">Choose .md files</button><input type="file" id="note-files" accept=".md,text/markdown" multiple hidden>
              <span class="stamp">UP TO 30 FILES · 2 MB EACH</span>
            </div>
            <div id="note-import-queue" class="import-queue" aria-live="polite"></div>
            <div class="workspace-footer"><span id="import-msg" role="status" class="soft">Choose a section and project before importing.</span><button type="button" id="import-notes" class="btn btn-solid" disabled>Import notes →</button></div>
          </div>
        </div>
        <aside class="library-details">
          <h3>File it where it belongs</h3><p class="soft">These details apply to your note or the whole import.</p>
          <div class="field"><label for="n-section">Library section</label><select id="n-section"><option value="projects">Projects</option><option value="sims-guides">Sims Guides</option><option value="tools">Tools</option><option value="writing">Writing</option></select></div>
          <div class="field"><div class="field-heading"><label for="n-project">Project</label><button type="button" class="text-action" data-add-option="project" data-option-target="n-project">+ New</button></div><select id="n-project"><option value="">No project</option></select><span class="field-help">Shared with the feed. Find these notes by project in the library tags.</span></div>
          <div class="field" id="note-tags-field"><label for="n-tags">Tags</label><input id="n-tags" placeholder="Research, Reference…"><span class="field-help">Separate with commas.</span></div>
          <div class="filing-note"><span class="eyebrow">Ready when you are</span><p>Saving updates your local library. Use Git &amp; Sync to publish it to the site.</p></div>
        </aside>
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

  <script src="tools/studio.js"></script>
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
