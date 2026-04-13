# MCP: rename note by id (implementation plan)

## Goal

Support **arbitrary renames** of a note given its **note id** and a **new title** (full title string). Examples include prepending `DONE `, fixing typos, or any other title the model or user chooses.

**In scope beyond the two core tools:**

- **Model-owned naming (default):** The model may compose the final string using `nodex_get_note_title` + `nodex_note_rename` with no special server convention.
- **Server-assisted title operations:** Evaluate and optionally implement MCP-side helpers (e.g. optional `titlePrefix` / `titleSuffix` on rename, or a small “mark done” preset) with documented idempotency — only if product wants less prompt fragility than pure model composition.
- **WPN / HTTP API:** Evaluate whether existing GET/PATCH note routes are sufficient; if not (e.g. lighter read for title-only, or atomic prepend at the API layer), specify and track backend changes in the same delivery or as a follow-up milestone.

## Current capability

- There is no dedicated **rename** or **get title only** tool.
- **`nodex_get_note`** returns the full note; callers can read `title` from the payload.
- **`nodex_write_note`** with `mode: "patch_existing"` accepts `noteId` and optional `title` (full new title), and PATCHes via the WPN client.

**Supported workflow today:**

1. **`nodex_get_note`** — read current `title`.
2. **`nodex_write_note`** — `{ mode: "patch_existing", noteId, title: "<new full title>" }`.

Same **auth** as other reads/writes (cloud session / token as configured for `nodex-mcp`).

## Implementation map (backend + MCP)

This section lists **what must change** for the plan: sibling title validation on PATCH, new MCP tools, and docs. Paths are repo-relative.

### Next.js app (`apps/nodex-web`)

- **How it relates to WPN:** [`apps/nodex-web/app/api/v1/[[...path]]/route.ts`](apps/nodex-web/app/api/v1/[[...path]]/route.ts) and [`apps/nodex-web/lib/sync-api-route-handler.ts`](apps/nodex-web/lib/sync-api-route-handler.ts) forward requests into the same Fastify **`@nodex/sync-api`** app (`buildSyncApiApp`). **WPN logic is not implemented inside Next.js route files.**
- **Expected code changes for this feature:** Usually **none** in those Next.js files. Behavior changes ship by editing **`apps/nodex-sync-api`** (see below) and redeploying / bumping the workspace package so `nodex-web` bundles the updated sync API.

### Cloud WPN — sync API (`apps/nodex-sync-api`)

| Area | File | Change |
|------|------|--------|
| Mongo write | [`apps/nodex-sync-api/src/wpn-mongo-writes.ts`](apps/nodex-sync-api/src/wpn-mongo-writes.ts) | In **`mongoWpnUpdateNote`**, before `updateOne`, enforce sibling title uniqueness (same `project_id`, same `parent_id`, exclude `noteId`, rules in item **6**). On conflict, throw a dedicated error or return in a way the route can map to **409**. |
| HTTP | [`apps/nodex-sync-api/src/wpn-write-routes.ts`](apps/nodex-sync-api/src/wpn-write-routes.ts) | **`PATCH /wpn/notes/:id`**: catch conflict from `mongoWpnUpdateNote` and respond with **HTTP 409** and body `{ error: "Note title already exists. Try a different title." }` (or agreed `code` + message). |

Standalone **`nodex-sync-api`** (Docker / same package) uses these files; behavior stays aligned with Next-hosted API.

### Local WPN — Electron / file vault

| Area | File | Change |
|------|------|--------|
| JSON store | [`src/core/wpn/wpn-json-notes.ts`](src/core/wpn/wpn-json-notes.ts) | **`wpnJsonUpdateNote`**: apply the **same** sibling title rules as `mongoWpnUpdateNote` when `patch.title` is set. |
| Loopback HTTP | [`src/main/wpn-local-http-bridge.ts`](src/main/wpn-local-http-bridge.ts) | **`PATCH /wpn/notes/:id`**: if the update fails due to duplicate title, respond with **409** and the **same** `error` string as sync-api (so MCP and web clients see one contract). |

### MCP server (`packages/nodex-mcp`)

| Area | File | Change |
|------|------|--------|
| Tools + instructions | [`packages/nodex-mcp/src/server.ts`](packages/nodex-mcp/src/server.ts) | Register **`nodex_get_note_title`** (`noteId` → `getNote`, response `{ noteId, title }`). Register **`nodex_note_rename`** (`noteId`, `title` → `patchNote` with `{ title }`). Update the MCP **`serverUseInstructions`** / description string so agents discover the tools. |
| HTTP client | [`packages/nodex-mcp/src/wpn-client.ts`](packages/nodex-mcp/src/wpn-client.ts) | **`patchNote`** / **`getNote`** already call WPN; optional polish: on **409**, surface **`body.error`** as the tool error text (canonical message) instead of only the generic `WPN PATCH note failed (409): …` wrapper. |
| Docs | [`packages/nodex-mcp/README.md`](packages/nodex-mcp/README.md) | Tool table, rename flow, duplicate-title error behavior. |
| Tests | e.g. [`packages/nodex-mcp/src/server.ts`](packages/nodex-mcp/src/server.ts) (integration-style) or adjacent `*.test.ts` | Happy paths + **409** duplicate title for rename / `patch_existing` with `title`. |

**Note:** `nodex_write_note` with `patch_existing` and a `title` field **does not need a separate backend path**; it uses the same PATCH. Once sync + local WPN enforce uniqueness, both **`nodex_note_rename`** and **`patch_existing`** receive the same **409** / error body.

### Optional (non-MCP) UI

- [`src/renderer/nodex-web-shim.ts`](src/renderer/nodex-web-shim.ts) (and any rename UI) should handle **409** on PATCH and show `error` to the user if not already — product polish when renaming from the app, not strictly required for MCP-only delivery.

### Cursor MCP tool descriptors (if you sync them from the repo)

- Add JSON tool descriptors for **`nodex_get_note_title`** and **`nodex_note_rename`** wherever your Cursor project stores MCP tool schemas (often under `.cursor/projects/<name>/mcps/<server>/tools/`, driven by [`.cursor/mcp.json`](.cursor/mcp.json)).

## Options

### Option A — Document only (no code change)

- Document in [`packages/nodex-mcp/README.md`](packages/nodex-mcp/README.md) that rename = get note + `patch_existing` with `title`.
- **Pros:** No new tools.
- **Cons:** Full note payload on every “what is this called?” step; rename still requires remembering the `patch_existing` shape.

### Option B — Two small MCP tools (recommended shape)

Core tools stay **generic** (full-title rename). Any server-side prepend/suffix or preset semantics are an **optional extension** in scope (see [Extended scope](#extended-scope) below), not required for the first cut.

#### `nodex_get_note_title`

| Parameter | Behavior |
|-----------|----------|
| `noteId` (required) | `GET` the note (same as today’s note fetch path) and return **`{ noteId, title }`** (see [Recommended decisions](#recommended-decisions)). |

**Purpose:** Lets the model read the current title without pulling full `content` and unrelated fields into context when it only needs to build a new title (e.g. `DONE ` + previous title, or any other edit).

#### `nodex_note_rename`

| Parameter | Behavior |
|-----------|----------|
| `noteId` (required) | Target note. |
| `title` (required) | **Full** new title (same field name as WPN / `patch_existing`). |

**Behavior:** PATCH the note with `title` (same as `patch_existing` with only `title` set). Return shape should match **`patch_existing`** for parity (see [Recommended decisions](#recommended-decisions)).

**Duplicate title at the same tree level:** If the new title is already used by **another** note under the same parent in the same project (siblings), the operation must **fail** with a clear error. The canonical message exposed to agents (MCP tool error / API `error` string) should be:

`Note title already exists. Try a different title.`

(No rename occurs.) Renaming to the **same** title as the note already has is not a conflict (no-op success). Exact matching rules (trim, case sensitivity) are specified under [Recommended decisions](#recommended-decisions) item **6**.

If extended scope adds optional prefix/suffix parameters, use the mutual-exclusion rules in [Recommended decisions](#recommended-decisions).

**Overlap:** This is sugar over `nodex_write_note` (`patch_existing`). The value is a **clear, discoverable** API for agents (“rename” / “get title”) without discriminated `mode` or optional fields.

**Implementation sketch:**

- **Where:** [`packages/nodex-mcp/src/server.ts`](packages/nodex-mcp/src/server.ts) — register both tools next to existing note tools; delegate to `WpnHttpClient` (`getNote`, `patchNote`) or the same code paths as `nodex_get_note` / `patch_existing`.
- **Auth:** Reads → same as `nodex_get_note`; writes → same as `nodex_write_note` (`requireCloudAccess` where applicable).
- **Tests:** Rename happy path; get-title tool returns expected shape; **duplicate sibling title** returns the canonical error; error paths (unknown id) consistent with existing tools.
- **Docs:** README tool table + MCP server instruction blurb listing `nodex_get_note_title` and `nodex_note_rename`.

## Example flows (for agents)

- **Mark done by title:** `nodex_get_note_title` → model sets `nextTitle = "DONE " + title` (or any team convention) → `nodex_note_rename(noteId, nextTitle)`.
- **Any other rename:** `nodex_note_rename(noteId, title)` directly, or call `nodex_get_note_title` first if the new title depends on the old one.

## Recommended decisions

Suggested defaults so implementation can proceed without another design round. Change only if product explicitly prefers otherwise.

### 1. `nodex_get_note_title` response shape

**Recommend:** `{ noteId, title }` only on first ship.

- Matches the tool’s purpose (minimal context for composing a new title).
- **`path` omitted in v1:** Building `Workspace / Project / Title` usually means a notes-with-context lookup or extra round-trips; unless that is already available from the same GET handler with negligible cost, skip it. Agents that need disambiguation can use `nodex_find_notes` / `nodex_execute_note` as today.
- **Follow-up:** If profiling shows full GET bodies are too large, add `path` here only after a cheap source exists, or drive a WPN “title-only” read (see WPN alignment below).

### 2. Public parameter naming

**Recommend:** `noteId` + **`title`** on `nodex_note_rename`.

- Aligns with WPN note fields and existing MCP input `patch_existing.title` ([`packages/nodex-mcp/src/wpn-client.ts`](packages/nodex-mcp/src/wpn-client.ts) uses `title` on notes).
- Avoids `name` vs `title` drift between docs, Zod schema, and PATCH body.

### 3. `nodex_note_rename` response shape

**Recommend:** Same as `nodex_write_note` / `patch_existing`: `{ ok: true, note }` with the **full patched note** object.

- Consistent error handling and typing for agents already using `patch_existing`.
- A minimal `{ ok, noteId, title }` saves tokens but introduces a second response shape; revisit only if note payloads are proven too heavy in practice.

### 4. Server-assisted renames (extended scope, if shipped later)

**Recommend for v1 of the feature:** Ship **only** `nodex_get_note_title` + `nodex_note_rename` (full `title`); no prefix/suffix/preset parameters yet.

**If you add server-assisted behavior later:**

- **Inputs:** Prefer at most one transform per call, e.g. optional `titlePrefix` **or** optional `titleSuffix`, not both.
- **Mutual exclusion:** Schema must **reject** the same request if both full `title` and any transform field are set (Zod `.refine` or separate tool names).
- **Idempotency:** For prefix: if the current title **already equals** `prefix + remainder` with the same prefix string (define whether comparison is on raw string or `trimStart` of title — pick one and test), return success without PATCH and include `unchanged: true` or the current note so the call is safe to repeat.
- **Presets:** Avoid opaque enum presets in the server unless you have stable product copy; otherwise document string conventions in README and let the model pass an explicit `title`.

### 5. WPN alignment

**Recommend for first ship:** Keep existing **GET** and **PATCH** routes (no new URL needed). **`PATCH /wpn/notes/:id` must enforce sibling title uniqueness** when `title` is present in the body (see item **6**). Today [`mongoWpnUpdateNote`](apps/nodex-sync-api/src/wpn-mongo-writes.ts) and local [`wpnJsonUpdateNote`](src/core/wpn/wpn-json-notes.ts) **do not** check duplicates; implementation adds validation there (and the same rule anywhere else that applies title patches) so cloud and local file vault stay consistent. **Concrete file list:** [Implementation map](#implementation-map-backend--mcp).

**Return shape on conflict:** Prefer **HTTP 409** with a JSON body such as `{ error: "Note title already exists. Try a different title." }` (or a stable `code` plus the same human message — pick one pattern and use it across sync API).

**MCP:** Map that response in [`packages/nodex-mcp/src/wpn-client.ts`](packages/nodex-mcp/src/wpn-client.ts) / error mapping so `nodex_note_rename` and `nodex_write_note` (`patch_existing` with `title`) surface the same canonical message to the model.

**Other backend follow-ups (unchanged intent):** File additional tickets when you have evidence of:

- **Payload size:** GET returns large `content` and title-only reads matter at scale.
- **Concurrency:** Read-modify-write races on title need stronger guarantees than PATCH validation.
- **Auth or routing:** A dedicated micro-endpoint is needed for non-note clients.

### 6. Sibling title uniqueness rules

- **Scope:** Same `project_id`, same `parent_id` (same level in the tree). Exclude the note being updated from the check.
- **Normalization:** Apply the **same trim** as today’s update path before comparing (e.g. trimmed string; empty-after-trim behavior should match existing title PATCH semantics).
- **Case sensitivity:** **Case-sensitive** comparison unless product standardizes otherwise (document if you switch to case-insensitive).
- **Success when unchanged:** If the trimmed new title equals the note’s current title, skip the duplicate check or treat as success (no conflict with self).

## Extended scope

Same topics as items **4**, **5**, and **6** under [Recommended decisions](#recommended-decisions); this section is the **product backlog** framing.

### Server-side prepend / suffix / “mark done” semantics

- **First ship:** Model + `title` only; document conventions (e.g. `DONE `) in README.
- **Later:** Optional MCP transform fields or a small tool — follow idempotency and mutual-exclusion rules in item **4** above.

### WPN API changes

- **Required for rename safety:** Item **5** / **6** — validation on existing PATCH (409 + canonical error), implemented in sync API and local WPN JSON path.
- **Optional later:** New routes or response shapes only if a trigger in item **5** (payload size, concurrency, routing) applies; attach issue links here when opened.

## Recommended path

- Implement **Option B** when agent ergonomics matter; keep **`nodex_write_note`** unchanged for bulk/metadata edits.
- **Option A** remains valid if you want zero new tools.
- **Extended scope** items can ship after the two core tools, or in parallel if backend work is already scheduled.
