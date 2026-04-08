# Nodex project layout and notes model

## Vocabulary

- **Project folder** — A directory the user opens in Nodex. It is the unit of backup, git, and sharing. It is **not** the same as “a root note” in the outline.
- **Outline / note forest** — Logical notes held in the workspace store (legacy tree in `nodex-workspace.json` + in-memory graph): any number of **top-level** notes (`parentId === null`), each of which can have children. This is the **hierarchy inside one project**, not separate projects.
- **Project root (storage)** — Inside the project folder:
  - `data/nodex-workspace.json` — Workspace file: WPN workspaces/projects/notes, explorer state, legacy notes serialization, and metadata.
  - `assets/` — Real files and subfolders; **not** mirrored as note rows. Notes reference files by path (e.g. `assets/...`).
- **Electron `userData`** — Holds app preferences (e.g. last opened project path), plugin workspaces, caches—not the canonical notes DB once a project is in use.

## Assets

- The sidebar shows an **Assets** section that lists `assets/` like a file browser (**dotfiles and dot-directories hidden**).
- Opening a file uses a built-in preview when available; otherwise **Open in system viewer** (and later, plugin-registered viewers).

## Migration

- Older installs may have referenced `data/nodex.sqlite`; current code persists workspace state under **`data/nodex-workspace.json`**. Follow project-specific migration notes in the main repo if upgrading from a SQLite-only layout.
