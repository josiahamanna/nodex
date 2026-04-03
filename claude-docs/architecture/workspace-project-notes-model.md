# Workspace → project → note model (v2)

This document describes the **logical data model** and **dual persistence** strategy for the next-generation Nodex explorer (no user-facing “folders”; **project** is the unit under **workspace**).

It complements [chrome-shell-navigation-and-notes.md](./chrome-shell-navigation-and-notes.md) (shell tabs, hash URLs for notes today) and the Cursor plan **workspace_projects_explorer_v2**.

## Product decisions

| Topic | Decision |
|--------|-----------|
| Migration | **None** — v2 tables are additive or live alongside legacy `notes` / `child_order`; no automatic import of old trees in this phase. |
| Folders | **No folder concept** in the product UI — only **workspace → project → note** (tree is notes within a project). |
| Move project | **Logical reassignment** — change `workspace_id` (or equivalent FK); **no** required on-disk folder move. |
| Electron | **SQLite** — same process as today; v2 tables live in the existing workspace `data/nodex.sqlite` (see `wpn_*` tables). |
| Web / headless API | **PostgreSQL** when `NODEX_PG_DATABASE_URL` is set; otherwise the API falls back to **SQLite** via `getNotesDatabase()` (same JSON contract). |

## Logical entities

- **Workspace** — `id`, `name`, `sort_index`, optional `color_token`, timestamps, **`owner_id`** (TEXT, server default `jehu`) — scopes rows in shared Postgres/SQLite so multiple logical owners can coexist in one DB without a login UI today.
- **Project** — `id`, `workspace_id`, `name`, `sort_index`, optional `color_token`, timestamps.
- **Note (v2)** — `id`, `project_id`, optional `parent_id` (tree **within** project), `type`, `title`, `content`, optional `metadata_json`, `sibling_index`, timestamps.

**Color tokens** — small palette keys (e.g. `c01`…`c12`) for mild UI colors; resolved in the renderer.

**Explorer expand/collapse** — per-project JSON list of expanded node ids in `wpn_explorer_state` (`GET/PATCH …/explorer-state` on the WPN API and `wpnGetExplorerState` / `wpnSetExplorerState` on `window.Nodex`). Workspace/project sections in the panel also use local UI state.

## URL / shell (target)

Hash routes (static-export friendly), aligned with shell work:

- `#/w/<workspaceId>`
- `#/p/<projectId>`
- `#/n/<noteId>`

### Internal links in markdown notes

- **Syntax:** `[link text](#/n/<noteId>)` in markdown content (same hash form as the shell).
- **Stable reference:** The **`noteId`** is the canonical target. Workspace, project, and note titles may change; the link keeps working as long as that note row exists.
- **Authoring:** The markdown editor’s **Link to note** action loads all WPN notes (every workspace and project, including Documentation), shows each row as **title** with a path line **`Workspace / Project / Title`** for disambiguation, and inserts the markdown link at the cursor (link text is selected so it can be edited).
- **Inline trigger:** Typing **`[[`** opens an autocomplete list under the editor (same data as the link picker). Characters after `[[` filter the list until `]` is typed or the segment is completed. **Enter** inserts `[text](#/n/<id>)`; **Escape** hides the list (the `[[` text stays; type more to filter again and reopen suggestions). Arrow keys move the selection. **M-x / minibuffer:** run **`nodex.notes.markdown.insertNoteLinkAtPoint`** to open the full link picker for the **current** markdown (or root) note; the link is inserted at the **last caret** in that editor (caret is saved when focus leaves the textarea, e.g. for the minibuffer).
- **Preview:** Rendered note links use the same `#/n/<noteId>` target; clicking opens the note via shell hash navigation.

**Preview vs pinned note tabs** (VS Code–style): one **preview** tab (`reuseKey` e.g. `note:preview`) until the user **double-clicks** the tab title (or explicit “Keep open”) to pin a dedicated tab per note.

## HTTP API (shared contract)

Mounted under **`/api/v1/wpn/…`** (see [`src/nodex-api-server/wpn-router.ts`](../../src/nodex-api-server/wpn-router.ts)).

Surface:

- `GET/POST /wpn/workspaces`, `PATCH/DELETE /wpn/workspaces/:id`
- `GET/POST /wpn/workspaces/:workspaceId/projects`, `PATCH/DELETE /wpn/projects/:id` (PATCH `workspace_id` = logical move)
- `GET /wpn/projects/:projectId/notes` — flat preorder list with `depth`
- `GET/PATCH /wpn/projects/:projectId/explorer-state` — `{ expanded_ids: string[] }`
- `POST /wpn/projects/:projectId/notes` — create (`relation` root|child|sibling, `type`, optional `anchorId`, …)
- `GET/PATCH /wpn/notes/:id` — read/update note (including `metadata` for plugin UI state on web)
- `POST /wpn/notes/delete` — body `{ ids: string[] }`
- `POST /wpn/notes/move` — body `{ projectId, draggedId, targetId, placement }`

**Session (headless)** — `GET /api/v1/session` returns `{ wpnOwnerId: string }` from `NODEX_WPN_DEFAULT_OWNER` (default `jehu`) so the web shell can label the active WPN owner without duplicating env in the client.

On Electron, the same operations are available over IPC (`WPN_*` channels); **note body** reads/writes also go through existing `getNote` / `saveNoteContent` / `renameNote` / `saveNotePluginUiState` when the id exists in `wpn_note`.

Responses use JSON; errors use `{ error: string }` or `{ ok: false, error }` where aligned with existing API style.

## Code map

| Area | Location |
|------|-----------|
| SQLite DDL + ensure | [`src/core/wpn/wpn-schema-sqlite.ts`](../../src/core/wpn-schema-sqlite.ts) (applied from [`notes-sqlite.ts`](../../src/core/notes-sqlite.ts) `ensureSchema`) |
| Types (canonical) | [`src/shared/wpn-v2-types.ts`](../../src/shared/wpn-v2-types.ts) — re-exported from [`src/core/wpn/wpn-types.ts`](../../src/core/wpn/wpn-types.ts) |
| SQLite service | [`src/core/wpn/wpn-sqlite-service.ts`](../../src/core/wpn/wpn-sqlite-service.ts), notes: [`wpn-sqlite-notes.ts`](../../src/core/wpn/wpn-sqlite-notes.ts), move helper: [`wpn-note-move.ts`](../../src/core/wpn/wpn-note-move.ts) |
| Postgres DDL + service | [`src/core/wpn/wpn-pg-schema.ts`](../../src/core/wpn/wpn-pg-schema.ts), [`src/core/wpn/wpn-pg-service.ts`](../../src/core/wpn/wpn-pg-service.ts), notes: [`wpn-pg-notes.ts`](../../src/core/wpn/wpn-pg-notes.ts) |
| Express routes | [`src/nodex-api-server/wpn-router.ts`](../../src/nodex-api-server/wpn-router.ts), mounted in [`api-router.ts`](../../src/nodex-api-server/api-router.ts) as `/wpn` |
| Electron IPC | [`src/main/register-static-ipc-wpn.ts`](../../src/main/register-static-ipc-wpn.ts) (`IPC_CHANNELS.WPN_*`) |
| Renderer contract | [`nodex-renderer-api.ts`](../../src/shared/nodex-renderer-api.ts) (`wpnListWorkspaces` … `wpnDeleteProject`), [`preload.ts`](../../src/preload.ts), web: [`nodex-web-shim.ts`](../../src/renderer/nodex-web-shim.ts) |

## Environment

| Variable | Purpose |
|----------|---------|
| `NODEX_PG_DATABASE_URL` | Optional Postgres connection string for **web** deployments. When unset, WPN routes use **SQLite** (`getNotesDatabase()`). |
| `NODEX_PROJECT_ROOT` | Headless folder project: when set and valid, opens SQLite under project `data/` and enables legacy `/notes`, assets, etc. When unset **and** `NODEX_PG_DATABASE_URL` is set, the API still starts and serves WPN on Postgres; folder-only routes stay unavailable until a project root is configured. |
| `NODEX_WPN_DEFAULT_OWNER` | String owner id for all WPN workspace rows (default **`jehu`**). Used by the HTTP WPN router and Electron IPC SQLite path. |
| `NEXT_PUBLIC_NODEX_API_SAME_ORIGIN` | When `1` or `true`, the Next/web bundle uses **relative** `/api/v1/...` (same origin as the page). Use with **nginx gateway** (or Next rewrites via `NODEX_HEADLESS_API_ORIGIN`) so the browser does not need `?api=` / localStorage API base. |

## Docker / gateway

- **`docker-compose.yml`** — optional **`postgres`** service (`--profile wpn-pg`), `NODEX_PG_DATABASE_URL` and `NODEX_WPN_DEFAULT_OWNER` on **`nodex-api`**, default workspace bind `./.nodex-docker-workspace` when `NODEX_HOST_PROJECT` is unset.
- **`nodex-gateway`** — recommended access: UI + **`/api/v1/`** on one origin (e.g. port 8080) so `NEXT_PUBLIC_NODEX_API_SAME_ORIGIN=1` works without per-browser API configuration.

## Risks

- **Dual-backend parity** — schema changes must be applied to **both** SQLite `ensureWpnV2Schema` and Postgres `ensureWpnPgSchema`.
- **Legacy coexistence** — Legacy `notes` table remains for existing features until the app fully switches the explorer to WPN APIs.
- **Assets** — Binary attachments still need a clear **project-scoped** storage story (out of scope for the first schema slice).

## Maintenance

Update this file when changing table columns, public routes, URL conventions, or preview/pin tab behavior.
