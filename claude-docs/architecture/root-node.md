# Nodex project layout and notes model

## Vocabulary

- **Project folder** — A directory the user opens in Nodex. It is the unit of backup, git, and sharing. It is **not** the same as “a root note” in the outline.
- **Outline / note forest** — Logical notes in SQLite: any number of **top-level** notes (`parentId === null`), each of which can have children. This is the **hierarchy inside one project**, not separate projects.
- **Project root (storage)** — Inside the project folder:
  - `data/nodex.sqlite` — Logical notes (titles, content, tree order, metadata).
  - `assets/` — Real files and subfolders; **not** mirrored as note rows. Notes reference files by path (e.g. `assets/...`).
- **Electron `userData`** — Holds app preferences (e.g. last opened project path), plugin workspaces, caches—not the canonical notes DB once a project is in use.

## Assets

- The sidebar shows an **Assets** section that lists `assets/` like a file browser (**dotfiles and dot-directories hidden**).
- Opening a file uses a built-in preview when available; otherwise **Open in system viewer** (and later, plugin-registered viewers).

## Migration

- If a legacy database existed under `userData/data/nodex.sqlite`, opening a **new** project folder copies it into `data/nodex.sqlite` once if that file does not yet exist.
