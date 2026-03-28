# Plugin folder rules (current + intended)

## Current behavior (implemented)

Nodex does **not** ask for a plugin folder on startup. It loads plugins from **fixed locations**:

1. **Bundled mandatory plugins** — `plugins/core/<plugin-name>/` in the repo (dev: `../../plugins/core` from the main bundle), or **`Resources/core`** (basename of `extraResource`) when packaged. Example: `plugins/core/code/` for the `code` note type.
2. **User-installed plugins** — under `path.join(app.getPath("userData"), "plugins")` (e.g. on Linux `~/.config/<app-name>/plugins`). The loader prefers a **`sources/` + `bin/`** layout: editable trees live in **`plugins/sources/<name>/`** (manifest, `index.js`, `ui.jsx`, etc.), and **Bundle** writes production artifacts to **`plugins/bin/<name>/`**. The runtime loads from **`bin/<name>`** when present and valid, otherwise from **`sources/<name>`** (dev) or a **legacy** flat folder **`plugins/<name>`** for older installs. Sample plugins are seeded into **`sources/<name>`** on first run. Import / Plugin Manager still uses the same user plugins root; reserved top-level names are `sources` and `bin`.

**Precedence:** bundled core roots are scanned first, then the user plugins directory. If the same note type is registered again, the **later** registration wins (user plugin overrides bundled).

The repo folders `plugins/markdown`, `plugins/tiptap`, etc. are **samples** only until copied into `userData/plugins` (or imported as a zip).

---

## Intended follow-up (not implemented yet)

These items come from product notes; treat as backlog, not current spec.

- **Workspace vs global plugins:** Optionally treat a **user-chosen folder** as the plugin workspace (in addition to or instead of only `userData/plugins`).
- **Remember or prompt:** Persist the last-used workspace path (e.g. in user settings) **or** on startup, if nothing is configured, prompt / show UI to **open a folder**.
- **Empty state:** If no workspace is set, show a clear **“Open folder”** (or equivalent) action instead of failing silently.
- **Marker file:** Once a directory is accepted as the workspace, create a **`.Nodexplugin`** (or similarly named) marker file in that folder so it is recognizable as a Nodex plugin root.

When implementing, align naming with existing manifest / zip flows and avoid breaking `userData/plugins` for users who rely on the current model.
