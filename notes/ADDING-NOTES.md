# Notes — How to Add & Manage

Quick reference for working with the Analog Atlas Note Library.

---

## Workspace Structure

```text
notes/
├── sims-guides/     # Sims installation guides & checklists
├── tools/           # Tool documentation & readmes
├── projects/        # Project plans, design docs, roadmaps
└── (new-folder)/    # Just create a folder — it auto-appears
```

## Adding a Note

1. **Create your file** as `.html` or `.md` (Markdown).
2. **Name it descriptively** — the filename becomes the display title.
   - Hyphens (`-`) and underscores (`_`) become spaces.
   - Each word is auto-capitalized.
   - Example: `Sims1-install-guide.html` → "Sims1 Install Guide"
3. **Drop it in a workspace folder** under `notes/`.
4. **Commit & push.** The Note Library auto-discovers via GitHub API.

## Creating a New Workspace

1. Add a new folder inside `notes/` (e.g., `notes/game-mods/`).
2. Place at least one note file inside it.
3. **(Optional)** Add metadata in `js/main.js` under `WORKSPACE_META`:

```js
"game-mods": {
  label: "Game Mods",
  desc: "Modding guides and resources.",
  icon: "🎯",
},
```

This gives it a custom label, description, and icon in the sidebar.
If you skip this step, the folder name is auto-formatted as the label.

## Supported File Types

| Extension | How it renders                                |
|-----------|-----------------------------------------------|
| `.html`   | Body content extracted and displayed inline   |
| `.md`     | Converted to HTML via built-in Markdown parser|

## HTML Note Template

If writing an HTML note, you can use your own markup. The viewer strips
`<header>`, `<nav>`, `<footer>`, `<script>`, and stylesheet links, then
looks for `.main-content` or `.content` divs. If none found, it uses the
full `<body>`.

Minimal template:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Note Title</title>
</head>
<body>
  <div class="main-content">
    <h1>My Note Title</h1>
    <p>Content goes here...</p>
  </div>
</body>
</html>
```

## Markdown Note Template

Just write standard Markdown:

```md
# My Note Title

Some intro text.

## Section One

- Bullet point
- Another point

## Section Two

More content with **bold** and *italic* text.
```

## Tips

- GitHub API has a rate limit of 60 requests/hour for unauthenticated users.
  The note library makes 1 request per workspace load + 1 per note view.
- Workspace selection is persisted in the URL (`?ws=sims-guides`) so
  you can bookmark or share direct links.
- The note viewer URL format is:
  `note-viewer.html?workspace=sims-guides&note=Sims1-install%20guide.html`
