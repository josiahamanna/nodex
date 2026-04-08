# Workspace → project → note model (v2)

This document describes the **logical data model** and **persistence** for the Nodex explorer (no user-facing “folders”; **project** is the unit under **workspace**).

It complements [chrome-shell-navigation-and-notes.md](./chrome-shell-navigation-and-notes.md) (shell tabs, hash URLs for notes today) and the Cursor plan **workspace_projects_explorer_v2**.

## Product decisions

| Topic | Decision |
|--------|-----------|
| Migration | **None** — v2 data is additive or lives alongside legacy `notes` / `child_order` in the same workspace file; no automatic import of old trees in this phase. |
| Folders | **No folder concept** in the product UI — only **workspace → project → note** (tree is notes within a project). |
| Move project | **Logical reassignment** — change `workspace_id` (or equivalent FK); **no** required on-disk folder move. |
| Electron | **JSON workspace file** — WPN rows and explorer state live in `{project}/data/nodex-workspace.json` via [`WorkspaceStore`](../../src/core/workspace-store.ts); legacy outline may still load into the in-memory notes graph from the same file. |
| Web / headless API | **Same JSON file** — requires **`NODEX_PROJECT_ROOT`** pointing at a project folder; WPN routes use `getNotesDatabase()` → `WorkspaceStore`. **PostgreSQL was removed**; there is no server-only DB mode for WPN. |

## Logical entities

- **Workspace** — `id`, `name`, `sort_index`, optional `color_token`, timestamps, **`owner_id`** (TEXT, default `jehu`) — scopes rows so multiple logical owners can coexist; JWT `sub` is used as owner when authenticated.
- **Project** — `id`, `workspace_id`, `name`, `sort_index`, optional `color_token`, timestamps.
- **Note (v2)** — `id`, `project_id`, optional `parent_id` (tree **within** project), `type`, `title`, `content`, optional `metadata_json`, `sibling_index`, timestamps.

**Color tokens** — small palette keys (e.g. `c01`…`c12`) for mild UI colors; resolved in the renderer.

**Explorer expand/collapse** — per-project list of expanded node ids in the workspace JSON (`GET/PATCH …/explorer-state` on the WPN API and `wpnGetExplorerState` / `wpnSetExplorerState` on `window.Nodex`). Workspace/project sections in the panel also use local UI state.

**Workspace / project settings** — arbitrary JSON blobs per workspace and per project, stored in `wpnWorkspaceSettings` / `wpnProjectSettings` inside `nodex-workspace.json`.

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
- `GET/PATCH /wpn/notes/:id` — read/update note (including `metadata` for plugin UI state on web); title changes trigger VFS link rewrites in markdown where applicable
- `POST /wpn/notes/delete` — body `{ ids: string[] }`
- `POST /wpn/notes/move` — body `{ projectId, draggedId, targetId, placement }`
- `GET/PATCH /wpn/workspaces/:workspaceId/settings` and `GET/PATCH /wpn/projects/:projectId/settings` — JSON settings merged into the workspace file

**Session (headless)** — `GET /api/v1/session` returns `{ wpnOwnerId: string }` from `NODEX_WPN_DEFAULT_OWNER` (default `jehu`) so the web shell can label the active WPN owner without duplicating env in the client.

On Electron, the same operations are available over IPC (`WPN_*` channels); **note body** reads/writes also go through existing `getNote` / `saveNoteContent` / `renameNote` / `saveNotePluginUiState` when the id exists in `wpn_note`.

Responses use JSON; errors use `{ error: string }` or `{ ok: false, error }` where aligned with existing API style.

## Authentication (headless)

Signup, login, refresh, and logout use **JSON files** under `{NODEX_USER_DATA_DIR or ~/.nodex-headless-data}/auth/` (`users.json`, `refresh_sessions.json`) — see [`auth-json-store.ts`](../../src/nodex-api-server/auth/auth-json-store.ts). No database driver is required.

## Code map

| Area | Location |
|------|-----------|
| Workspace file + slots | [`src/core/workspace-store.ts`](../../src/core/workspace-store.ts) — `nodex-workspace.json` under `{project}/data/` |
| Types (canonical) | [`src/shared/wpn-v2-types.ts`](../../src/shared/wpn-v2-types.ts) — re-exported from [`src/core/wpn/wpn-types.ts`](../../src/core/wpn/wpn-types.ts) |
| JSON WPN service | [`src/core/wpn/wpn-json-service.ts`](../../src/core/wpn/wpn-json-service.ts), notes: [`wpn-json-notes.ts`](../../src/core/wpn/wpn-json-notes.ts), settings: [`wpn-json-settings.ts`](../../src/core/wpn/wpn-json-settings.ts) |
| VFS rewrites after rename | [`src/core/wpn/wpn-rename-vfs-rewrite.ts`](../../src/core/wpn/wpn-rename-vfs-rewrite.ts) |
| Express routes | [`src/nodex-api-server/wpn-router.ts`](../../src/nodex-api-server/wpn-router.ts), mounted in [`api-router.ts`](../../src/nodex-api-server/api-router.ts) as `/wpn` |
| Electron IPC | [`src/main/register-static-ipc-wpn.ts`](../../src/main/register-static-ipc-wpn.ts) (`IPC_CHANNELS.WPN_*`) |
| Renderer contract | [`nodex-renderer-api.ts`](../../src/shared/nodex-renderer-api.ts) (`wpnListWorkspaces` … `wpnDeleteProject`), [`preload.ts`](../../src/preload.ts), web: [`nodex-web-shim.ts`](../../src/renderer/nodex-web-shim.ts) |

## Environment

| Variable | Purpose |
|----------|---------|
| `NODEX_PROJECT_ROOT` | **Required** for headless API: absolute path to the open project folder (`/workspace` in Docker). WPN + legacy routes use the workspace JSON and project `data/` tree. |
| `NODEX_USER_DATA_DIR` | Headless prefs, session plugins on disk, and **`auth/`** JSON files for `/api/v1/auth/*`. |
| `NODEX_WPN_DEFAULT_OWNER` | String owner id for WPN rows when unauthenticated (default **`jehu`**). |
| `NEXT_PUBLIC_NODEX_API_SAME_ORIGIN` | When `1` or `true`, the Next/web bundle uses **relative** `/api/v1/...` (same origin as the page). Use with **nginx gateway** (or Next rewrites via `NODEX_HEADLESS_API_ORIGIN`) so the browser does not need `?api=` / localStorage API base. |

## Docker / gateway

- **`docker-compose.yml`** — **`nodex-api`** binds `./.nodex-docker-workspace` (or `NODEX_HOST_PROJECT`) to `/workspace`, **`NODEX_WPN_DEFAULT_OWNER`**, optional marketplace mounts. **No Postgres service.**
- **`nodex-gateway`** — recommended access: UI + **`/api/v1/`** on one origin (e.g. port 8080) so `NEXT_PUBLIC_NODEX_API_SAME_ORIGIN=1` works without per-browser API configuration.

## Risks

- **Single-writer JSON** — do not run multiple `nodex-api` replicas against the same mounted project directory.
- **Legacy coexistence** — Legacy `notes` / `legacy` block in the workspace file remains for existing features until the explorer fully switches to WPN APIs everywhere.
- **Assets** — Binary attachments still need a clear **project-scoped** storage story (out of scope for the first schema slice).

## Maintenance

Update this file when changing workspace file shape, public routes, URL conventions, or preview/pin tab behavior.
