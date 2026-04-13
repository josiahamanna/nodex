# nodex-create-child-note

## Purpose

Create a new Nodex note as a **direct child** of an existing parent. The user supplies the **parent** in one of three ways (exactly one per call) and the **child** `title` and `content` (same message or follow-up). Primary MCP tool: **`nodex_create_child_note`**.

## Parent selectors (exactly one)

1. **`parentNoteId`** — UUID of the parent note. Any workspace/project/path fields are ignored.
2. **`parentWpnPath`** — Single string: `"Workspace / Project / Title1 / Title2 / …"` where the first two segments are workspace and project names and the rest are note titles from a **project root** down to the **parent**. Split uses **` / `** (space-slash-space). Titles containing that substring cannot be represented reliably here; use structured fields or `parentNoteId`.
3. **`workspaceName` + `projectName` + `parentPathTitles`** — Same matching as (2) but `parentPathTitles` is an ordered array of note titles (root → parent). Each step resolves among **direct children** of the current node (trim + case-insensitive `norm`, same as `nodex_resolve_note`).

## Authenticate Nodex MCP (when tools return unauthenticated)

Use the browser device flow. Prerequisites: MCP is configured with `NODEX_MCP_CLOUD_SESSION=1`.

1. Call `nodex_login_browser_start` (no arguments). From the JSON response, read `verification_uri`, `device_code`, `user_code`, and `expires_in`.

2. Reply with one short message for the user: paste the full `verification_uri` as a clickable link (and optionally the `user_code` for reference). Tell them to open that URL, sign in if needed, and click Authorize — do not ask them to copy the `device_code` or run any commands.

3. Immediately start polling `nodex_login_browser_poll` with the `device_code` from step 1 (never print or paste the `device_code` in chat). Poll until the response status is `authorized`, or `expired`/`invalid`, or until roughly `expires_in` seconds have passed. Use a sensible delay between polls (e.g. 3–5 seconds; if the API returns `interval`, follow it). If status is `pending`, keep polling.

4. When status is `authorized`, call `nodex_auth_status` and briefly confirm authentication. If expired or invalid, say so and offer to restart from step 1.

Do not use `nodex_login` (password) unless the user explicitly prefers it.

## Steps

1. If any Nodex tool returns `unauthenticated`, run **Authenticate Nodex MCP** above, then retry.

2. Ensure you have **child** `title` and `content`. If either is missing, **ask the user once** or fail closed with a clear message — do not invent titles or body text.

3. Call **`nodex_create_child_note`** with:
   - exactly one parent selector (see above),
   - `title`, `content`,
   - optional `type` (defaults to `markdown` when omitted, same as write-back),
   - optional `metadata`.

4. Interpret the response:
   - **`ok: true`** — report `createdNoteId`, `parentNoteId`, `projectId`.
   - **`stage: "project_resolution"`** with `workspace_ambiguous`, `ambiguous`, or `none` — surface candidates (paths, ids) and ask the user to narrow or pass `parentNoteId`.
   - **`stage: "parent_path"`** with `reason: "ambiguous"` — list `candidates` (`noteId`, `path`); ask the user to pick a UUID and retry with **`parentNoteId`**.
   - **`stage: "parent_path"`** with `reason: "none"` — explain the missing segment; suggest `nodex_list_wpn` (`scope: "notes"` or `full_tree`) or `nodex_find_notes` to explore.

## MCP tool references

- **Primary:** `nodex_create_child_note`
- **Auth / diagnostics:** `nodex_auth_status`, `nodex_login_browser_start`, `nodex_login_browser_poll`
- **Fallback exploration:** `nodex_find_projects`, `nodex_find_notes`, `nodex_list_wpn` (when resolution fails or the user needs to see the tree)

## Clarifications

- **Nested path** = chain of **note titles under the project** (after workspace/project are fixed). It is not `Workspace / Project / …` inside `parentPathTitles`; those first two segments belong to project resolution only (or inside `parentWpnPath`).
- **Duplicate sibling titles** (same parent, same normalized title) → tool returns **ambiguous** with multiple `noteId`s; prefer **`parentNoteId`** after the user picks one.
- **Default type:** `markdown` when `type` is omitted.
- **Empty child title:** not silently defaulted; ask the user or error clearly.
- **Workspace/project names:** trim + case-insensitive, consistent with other WPN tools.
- When **`parentNoteId`** is set, extra workspace/project fields are ignored by design (simple API).
