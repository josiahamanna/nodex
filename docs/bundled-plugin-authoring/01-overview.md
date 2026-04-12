# Plugin authoring overview

Nodex loads **first-party** features from the renderer shell (`src/renderer/shell/first-party/plugins/…`) and **third-party** packages from the plugin manager. This guide focuses on patterns that match the **Chrome shell** (React workbench, no iframe for core views).

## What a plugin can contribute

- **Menu rail** — optional icon that opens a tab and optional sidebar/secondary views.
- **Shell views** — React components registered per region (`mainArea`, `primarySidebar`, `companion`).
- **Commands** — palette / minibuffer entries with typed handlers (`NodexContributionRegistry`).
- **Note types** — editors or renderers for notes (system types like `markdown` vs marketplace ZIP plugins).

## This repository

Bundled documentation notes are created from files under `docs/bundled-plugin-authoring/` whenever the workspace notes database is bootstrapped (Electron **open project** or **sync-api** serving `GET /public/bundled-docs/notes/:id`). Override the directory with `NODEX_BUNDLED_DOCS_DIR` if needed. The same manifest seeds a **User guide** (application usage) alongside these **Plugin authoring** pages.

Metadata on seeded notes includes `bundledDoc: true` so the UI can filter them for a read-only Documentation experience.

## Next steps

- Read **Shell registration and commands** for `useRegister*Plugin` patterns.
- Read **Minimal code example** for a copy-paste starting point.
- Read **Plugin authoring — complete guide** for first-party vs packaged plugins, API surfaces, Hello World, and checklists.
