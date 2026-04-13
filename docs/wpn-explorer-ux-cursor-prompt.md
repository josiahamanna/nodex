# Cursor prompt: WPN Notes explorer — smooth interactions, correct Refresh, optional title sync

**How to use this document:** Paste the sections below (from “You are working in…” through “Acceptance criteria”) into a Cursor chat or Agent task, or attach this file. Implement in the Nodex repo; keep changes scoped to WPN explorer and related title UI unless shared state requires a thin shell/Redux addition.

---

## You are working in the Nodex monorepo

**Goal:** Improve the **WPN (workspace / project / notes) explorer** so drag-and-drop, moves, and renames feel responsive; make **Refresh** actually and quickly refresh what users see; **preserve** which workspaces, projects, and note folders are **expanded or collapsed**; on Refresh, update **note data** (new, removed, moved, renamed rows) **without** resetting that expansion state except where invalid (e.g. deleted node); optionally make **in-progress rename** mirror between the explorer row and the note title in the editor **letter-by-letter**.

**Primary file:** [`src/renderer/shell/first-party/plugins/notes-explorer/WpnExplorerPanelView.tsx`](../src/renderer/shell/first-party/plugins/notes-explorer/WpnExplorerPanelView.tsx)

**Related files:**

- [`src/renderer/components/NoteViewer.tsx`](../src/renderer/components/NoteViewer.tsx) — `contentEditable` title, commit on blur
- [`src/renderer/shell/first-party/NoteEditorShellView.tsx`](../src/renderer/shell/first-party/NoteEditorShellView.tsx) — wires `onTitleCommit` + `renameNote` / VFS flow
- [`src/renderer/components/InlineSingleLineEditable.tsx`](../src/renderer/components/InlineSingleLineEditable.tsx) — explorer inline rename
- [`src/renderer/notes-sidebar/notes-sidebar-panel-dnd.ts`](../src/renderer/notes-sidebar/notes-sidebar-panel-dnd.ts) — `placementFromPointer`, `dropAllowedOne`
- [`src/renderer/components/WorkspaceMountHeaderSurface.tsx`](../src/renderer/components/WorkspaceMountHeaderSurface.tsx) — **reference** for drop hint UI (lines before drop)
- [`src/renderer/store/notesSlice.ts`](../src/renderer/store/notesSlice.ts) — `renameNote.fulfilled` bumps `noteRenameEpoch`; explorer reloads tree on epoch change
- [`src/renderer/shell/first-party/plugins/notes-explorer/wpnExplorerEvents.ts`](../src/renderer/shell/first-party/plugins/notes-explorer/wpnExplorerEvents.ts) — `WPN_SYNC_REMOTE_POLL_INTERVAL_MS` (8000), `NODEX_WPN_TREE_CHANGED_EVENT`

**Constraints:**

- Match existing patterns (React hooks, `getNodex().wpn*`, no unrelated refactors).
- Preserve VFS-dependent rename flows (`runWpnNoteTitleRenameWithVfsDependentsFlow`, `useVfsDependentTitleRenameChoice`).
- Handle failure: optimistic updates must **revert** on error and surface a toast or existing error UX.
- **Expansion preservation:** Do not replace the user’s open/close state with a full reset on every `loadProjectTree` / Refresh unless necessary. Today `loadProjectTree` pairs `wpnListNotes` with `wpnGetExplorerState` and may **overwrite** `expandedNoteParents` from the server—treat Refresh as “reconcile note list + titles + structure” while **keeping** prior expansion for ids that still exist; **prune** expanded ids for notes that disappeared.

---

## Problem 1: Drag-and-drop does not feel smooth

### What the user sees

- While dragging a note, there is little visual feedback about **whether** the row will accept a drop and **where** (above / below / as child).
- After releasing, the tree often **stalls** until the network returns; the row order does not update instantly.

### Root cause (technical)

1. **Minimal drag-over UX:** In `WpnExplorerPanelView`, note rows use `onDragOver` to `preventDefault`, set `dropEffect`, and validate with `placementFromPointer` + `dropAllowedOne`, but they do **not** render insertion lines or a “before / after / into” hint. The folder-based notes UI does this in `WorkspaceMountHeaderSurface` via `dropHint` state and absolute-positioned indicators.
2. **Blocking full reload after drop:** `onDropOnNote` (and `runMoveNote`) `await getNodex().wpnMoveNote(...)` then `await loadProjectTree(projectId)`. `loadProjectTree` runs `wpnListNotes` and `wpnGetExplorerState` and replaces local state with `setNotes(n)` and `setExpandedNoteParents`. Until both complete, the UI shows the old order.
3. **Whole-list reconciliation:** Replacing the entire `notes` array forces React to reconcile many rows; with large trees or slow IPC/HTTP this amplifies jank.

### Available fixes (choose and combine)

| Fix | Description | Pros | Cons |
|-----|-------------|------|------|
| **A. Drop hint UI** | Track `{ targetNoteId, placement }` or similar during drag-over; render top/bottom/middle indicators like `WorkspaceMountHeaderSurface`. | Low risk, big perceived improvement | Small amount of new state/CSS |
| **B. Optimistic reorder** | After validating placement locally, patch `notes` in memory to match the move, then call `wpnMoveNote` and **background** `loadProjectTree` to reconcile | Instant feedback | Must implement correct tree patch or reuse server ordering logic; revert on failure |
| **C. Non-blocking reload** | Keep await on `wpnMoveNote` for correctness but avoid awaiting `loadProjectTree` before clearing drag state; or show skeleton only on row | Simpler than full optimistic | Brief wrong UI if server disagrees |
| **D. `drag image` / row highlight** | Custom drag preview or highlight source row | Polish | Optional, extra work |

**Recommended minimum:** **A** + **B** (or **A** + **C** if optimistic patch is too risky in v1).

---

## Problem 2: Moving (menus / keyboard) and renaming do not feel smooth

### What the user sees

- Reordering or moving via context menu feels like it “waits on the server” before the list updates.
- Renaming workspace/project/note triggers a full reload pattern; the UI can feel frozen or jumpy.

### Root cause (technical)

- Same **mutate → await → `loadProjectTree` / `loadWorkspaces`** pattern as DnD.
- `loadWorkspaces` sets **`setBusy(true)`** for the whole operation, which **disables** Refresh and other controls that use `disabled={busy}`.
- No **optimistic** title change on the explorer row after a successful local validation; title only updates after fetch returns.

### Available fixes

| Fix | Description | Pros | Cons |
|-----|-------------|------|------|
| **A. Optimistic title** | On successful `wpnPatchNote` (or immediately after user commits if you trust local title), update the matching row in `notes` before/without waiting for `loadProjectTree` | Snappy rename | Must stay in sync with VFS dialog cancellation |
| **B. Optimistic move** | Same as DnD optimistic patch for `runMoveNote` / paste / duplicate flows | Consistent | Shared helper recommended |
| **C. Scoped busy flags** | Use `busyWorkspaces` vs `busyNotes` vs per-operation spinner; do not block Refresh with workspace-load busy | Refresh usable during note ops | Slightly more state |
| **D. Background reconcile** | Always fire `loadProjectTree` in `void` after optimistic patch; on mismatch replace state | Correctness | Possible flicker if server differs—debounce optional |

**Recommended minimum:** **C** for Refresh usability + **A**/**B** where safe.

---

## Problem 3: Renaming in explorer vs note title does not sync letter-by-letter

### What the user sees

- Editing the title in the **explorer** does not update the **editor header** (and vice versa) until commit and refetch.

### Root cause (technical)

- **Two independent sources of truth while editing:**
  - Explorer: `renaming` state with `draft` in `WpnExplorerPanelView`; `InlineSingleLineEditable` drives DOM from user input; commit calls `commitRename` → `wpnPatchNote` / `loadProjectTree` / `fetchNote`.
  - Editor: `NoteViewer` uses `contentEditable`; while `titleEditing` is true, `useLayoutEffect` does **not** overwrite DOM from `note.title`; Redux `note.title` updates on `renameNote.fulfilled` after commit.
- There is **no shared store** for “ephemeral title string while editing.”
- `InlineSingleLineEditable` syncs initial `value` only on **mount** (`useLayoutEffect` with `[]`), not on every prop change—so a future cross-sync from props needs either **key remount** or **controlled sync effect**.

### Available fixes

| Fix | Description | Pros | Cons |
|-----|-------------|------|------|
| **A. Shared draft store** | Add `noteTitleDraftById: Record<string, string>` (Redux slice or React context under shell). On `input` from explorer and from `NoteViewer`, dispatch `setNoteTitleDraft({ id, text })`. Both UIs read: if draft exists for open note and that pane is active, show draft; else show committed title. Clear draft on successful commit or cancel. | True letter-by-letter sync | Design “both focused” policy; more plumbing |
| **B. Broadcast via custom event** | `window.dispatchEvent` on title input with `noteId` + string; other side listens and updates local display only | Decoupled | Easy to get out of sync; prefer A for maintainability |
| **C. Single edit surface** | Disable rename in explorer when tab open, or only allow rename in editor | Simple | Worse UX, not what users asked for |
| **D. Debounced server sync** | Save title every N ms while typing | “Sync” via server | Heavy, conflicts with VFS rename flow; **not recommended** |

**Recommended:** **A** if product requires live sync; document rule: e.g. **last focused surface wins**, or **lock**: opening rename in one place closes/blurs the other.

---

## Problem 4: Refresh does not refresh the list quickly (or the right data)

### What the user sees

- Clicking **Refresh** feels slow and sometimes the **note list** under the selected project does not change.

### Root cause (technical)

- The Refresh button calls **`loadWorkspaces()` only** (~lines 1135–1141). That:
  1. Sets **`setBusy(true)`** until **all** workspaces and all their projects are listed (`wpnListWorkspaces` + `Promise.all` of `wpnListProjects` per workspace).
  2. **Never calls `loadProjectTree(selectedProjectId)`**, so **note rows** for the current project are **not** reloaded by this button.
- Stale notes may only update via: initial select effect, `noteRenameEpoch` effect, post-mutation `loadProjectTree`, or **`refreshProjectNotesFromServer` every 8s** when `syncWpnNotesBackend()` is true.

### Expansion state vs “refreshing the tree”

- **User expectation:** **Refresh** means “pull the latest note list from the backend”: **added** notes appear, **removed** notes disappear, **renamed** titles and **moved** parentage/order update. It does **not** mean “collapse everything I had open” or “reset chevrons to a default.”
- **Current coupling:** `loadProjectTree` fetches `wpnGetExplorerState` and sets `expandedNoteParents` from `expanded_ids`. That can **clobber** the in-session expansion the user had before the fetch, or fight with local toggles, so the tree feels like it “jumps” after Refresh or poll.
- **Workspace/project rows:** `loadWorkspaces` already tries to **merge** `expandedWs` when workspace ids are stable; apply the same idea to **note** expansion: prefer **merging** with previous `expandedNoteParents` rather than blind replace from server on Refresh (server state can still be used for **initial** project open or explicit “reset expansion” if you add one later).

### Available fixes

| Fix | Description | Pros | Cons |
|-----|-------------|------|------|
| **A. Refresh notes + workspaces** | On Refresh: `void loadWorkspaces()` and, if `selectedProjectId`, `void loadProjectTree(selectedProjectId)` (parallel or sequential—prefer parallel with `Promise.all` where safe) | Matches user expectation | Two load phases; handle race if selection changes mid-flight |
| **B. Narrow busy** | Do not use global `busy` for refresh; use `isRefreshing` and allow clicks or show inline spinner on the button only | Feels faster | Prevent double-submit if needed |
| **C. Split buttons** | “Refresh folders” vs “Refresh notes” | Clear semantics | UI clutter |
| **D. Cache / incremental** | ETag or last-modified if API supports | Fewer bytes | Backend work |
| **E. Preserve expansion on data refresh** | After `wpnListNotes`, update `notes` but compute `setExpandedNoteParents` as: **previous** expanded set **intersected** with ids still present in the new list (optional: **union** with server `expanded_ids` if you want cross-device open folders). Never drop expansion for rows that still exist. | Refresh updates content without UI reset | Define policy when server and client disagree; prune ghosts for deleted ids |
| **F. Separate “fetch notes” from “fetch expansion”** | Refresh path calls `wpnListNotes` only; persist expansion via existing `persistExpandedNotes` / local state without re-reading `wpnGetExplorerState` on every refresh | Clear separation | Initial open may still need one `wpnGetExplorerState` read |

**Recommended minimum:** **A** + **B** + **E** (or **F** if it simplifies the code path).

### What “refresh tree state” means (data, not chrome)

- **In scope for Refresh:** Reflect **added / removed / updated / renamed** notes in `WpnNoteListItem[]` (titles, `parent_id`, order, depth as returned by the API).
- **Out of scope for collapsing:** Do **not** treat Refresh as collapsing workspaces, projects, or note subtrees the user had open.
- **Pruning:** If a note id was expanded but that note was **deleted**, remove that id from `expandedNoteParents` so the Set stays valid.

---

## Suggested implementation order

1. **Refresh correctness, feel, and expansion:** `loadWorkspaces` + `loadProjectTree` (or equivalent) when a project is selected; relax or scope `busy` for refresh-only path; **merge/prune** `expandedNoteParents` (and keep workspace/project expansion stable) so Refresh updates **note data** without resetting open folders.
2. **Drop hints:** State + UI on note rows during `application/nodex-wpn-note` drag (reuse `placementFromPointer` semantics).
3. **Optimistic updates:** Helper to patch `WpnNoteListItem[]` after move; optimistic title row update after rename commit (coordinate with VFS cancel).
4. **Optional — title draft sync:** Redux or context + `NoteViewer` / explorer `InlineSingleLineEditable` input handlers; edge cases for dual focus.
5. **QA:** Electron + web sync; invalid DnD; rename cancel; empty project; many workspaces; **Refresh with deep expansion** (folders stay open; new/removed/renamed notes correct).

---

## Acceptance criteria

- **Refresh:** With a project selected, one click refreshes **both** workspace/project metadata **and** the **note list data** for that project (additions, deletions, renames, moves reflected from the backend); the button does not unnecessarily block the entire panel for unrelated operations (or shows a clear local loading state).
- **Expansion preserved:** After Refresh, **workspaces, projects, and note rows** that were expanded stay expanded if those nodes still exist; **new** notes do not force unrelated branches closed; expanded ids for **deleted** notes are dropped. The user should not see the whole explorer “snap shut” solely because they clicked Refresh.
- **DnD:** While dragging, user sees **clear** indication of target placement (before / after / into) where drops are allowed.
- **Move/rename:** Perceived latency improves via optimistic updates or non-blocking reconcile, without leaving inconsistent state on errors.
- **Title sync (if implemented):** Typing in explorer inline title or editor title updates the other within the same frame tick, with defined behavior when both could be focused.

---

## Out of scope (unless explicitly requested)

- Changing `WPN_SYNC_REMOTE_POLL_INTERVAL_MS` or sync protocol.
- Rewriting the entire explorer as a virtualized tree (only if profiling proves necessary).
