# Bundled documentation seeding

## Purpose

Long-form **plugin authoring** and product documentation can live as **Markdown files in the repository** under `docs/bundled-plugin-authoring/`. On every **workspace notes bootstrap** (desktop project open) or when **sync-api** serves bundled docs from `NODEX_BUNDLED_DOCS_DIR`, the core layer **upserts** matching notes into the **in-memory notes graph** (Electron), then persists via **`WorkspaceStore.persist()`** when applicable so the renderer can open them like any other `markdown` note.

This keeps the **file tree** as the authoring source of truth while the **workspace JSON + in-memory store** is the runtime index for search, tree navigation, and Documentation shell views.

## Flow

1. [`bootstrapWorkspaceNotes`](../../src/core/notes-persistence.ts) finishes loading or seeding the in-memory notes graph and persisting the initial state when needed.
2. [`trySeedBundledDocsAndSave`](../../src/core/notes-persistence.ts) calls [`seedBundledDocumentationNotesFromDir`](../../src/core/bundled-docs-seed.ts).
3. The seed module reads [`manifest.json`](../../docs/bundled-plugin-authoring/manifest.json) and each listed `.md` file, then **creates or updates** notes with **stable ids** (see manifest). Titles and bodies are overwritten from disk so **restarting the API server** or **re-opening a project** refreshes content.
4. If any note changed, the active [`WorkspaceStore`](../../src/core/workspace-store.ts) **`persist()`** rewrites the workspace file (legacy tree + WPN sections as applicable).

## Configuration

| Input | Meaning |
|--------|---------|
| Default directory | `docs/bundled-plugin-authoring` relative to `process.cwd()` (repo root when running Electron or sync-api from the monorepo). |
| `NODEX_BUNDLED_DOCS_DIR` | Absolute path to a folder that contains `manifest.json` and markdown pages. |

If the directory or manifest is missing, seeding is a no-op (no error).

## Manifest

`manifest.json` defines:

- `version` — integer stored in note metadata as `manifestVersion` for future migrations.
- `folder` — `{ id, title }` for a **root-level** parent note (`type: markdown`) that groups all pages.
- `pages` — ordered list of `{ id, file, title }`; `file` is read as UTF-8 markdown body.

Note ids must remain stable across releases so upserts target the same rows.

## Note metadata

Seeded notes include:

- `bundledDoc: true`
- `manifestVersion`
- `bundledDocRole`: `"folder"` | `"page"`
- `sourceFile` on pages (original filename)

The Documentation UI can filter on `metadata.bundledDoc` to show a **read-only** markdown view separate from user-editable notes.

## Sync-api

When the Fastify image includes `docs/bundled-plugin-authoring`, anonymous **`GET /public/bundled-docs/notes/:id`** serves page bodies for the web Documentation shell without mutating a local workspace file.

## Desktop (Electron)

The same `bootstrapWorkspaceNotes` path runs when a project workspace is activated, so bundled docs stay in sync when opening a folder, not only when using the HTTP API.

## Related

- [Workspace, project, and notes model](./workspace-project-notes-model.md) — WPN vs legacy tree.
- [Modular plugins architecture](./modular-plugins-architecture.md) — shell vs marketplace plugins.
- Planned: Documentation shell views that list `bundledDoc` notes and render markdown read-only.
