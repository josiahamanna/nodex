## Summary

In the shell **Notes explorer** (`WpnExplorerPanelView`), a project’s note tree can appear to **open briefly then snap shut** when the user expands or selects a project **different** from the one that owns the **currently active note tab**. The UI is behaving as coded: selection is pulled back to the active note’s project whenever the workspace/project map (`projectsByWs`) refreshes.

---

## Root cause (with code references)

Repository: `nodex` — primary file [`src/renderer/shell/first-party/plugins/notes-explorer/WpnExplorerPanelView.tsx`](src/renderer/shell/first-party/plugins/notes-explorer/WpnExplorerPanelView.tsx).

### 1. Note subtree only renders when expansion **and** selection match

The project’s note list is gated on **both** `expandedProjects.has(p.id)` and `selectedProjectId === p.id`. If `selectedProjectId` moves to another project, this branch becomes `null` immediately; `expandedProjects` is not cleared, so the chevron can still show ▼ while the tree is hidden.

```1633:1655:src/renderer/shell/first-party/plugins/notes-explorer/WpnExplorerPanelView.tsx
                          {expandedProjects.has(p.id) && selectedProjectId === p.id ? (
                            <div className="border-l border-border/40 pl-1">
                              <div
                                className="min-h-6 py-1 pl-6 text-[10px] text-muted-foreground"
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setTypePicker(null);
                                  setMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    kind: "projectBody",
                                    id: p.id,
                                    workspaceId: w.id,
                                    projectId: p.id,
                                  });
                                }}
                              >
                                Right-click for new root note or paste.
                              </div>
                              {renderNoteRows(p.id)}
                            </div>
                          ) : null}
```

### 2. “Follow open note” effect depends on `projectsByWs`

Whenever **`projectsByWs`** gets a new object reference, this effect runs (if `currentNoteId` and `projectOpen` are set). It resolves the note’s `project_id` (`pid`), then forces `setSelectedProjectId(pid)`, clears search, and expands the workspace and project for that note.

```674:712:src/renderer/shell/first-party/plugins/notes-explorer/WpnExplorerPanelView.tsx
  // Follow the open note in the tree when the active note or workspace list changes — not when
  // `notes` alone changes (project switch clears the list briefly and would snap selection back).
  useEffect(() => {
    if (!currentNoteId || !projectOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const localRow = notes.find((n) => n.id === currentNoteId);
        let pid: string | undefined;
        if (localRow) {
          pid = localRow.project_id;
        } else {
          const r = await getNodex().wpnGetNote(currentNoteId);
          if (cancelled || !r?.note) return;
          pid = r.note.project_id;
        }
        if (!pid) return;
        const visible = Object.values(projectsByWs).some((arr) => arr.some((p) => p.id === pid));
        if (!visible) return;
        let wsId: string | null = null;
        for (const [w, arr] of Object.entries(projectsByWs)) {
          if (arr.some((p) => p.id === pid)) {
            wsId = w;
            break;
          }
        }
        if (!wsId) return;
        setSearch("");
        setSelectedProjectId(pid);
        setExpandedProjects((prev) => new Set(prev).add(pid));
        setExpandedWs((prev) => new Set(prev).add(wsId));
      } catch {
        /* wpnGetNote unavailable or network error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentNoteId, projectOpen, projectsByWs]);
```

`loadWorkspaces` always builds a fresh `nextProj` and calls `setProjectsByWs(nextProj)`, which changes `projectsByWs` identity and retriggers the effect:

```451:455:src/renderer/shell/first-party/plugins/notes-explorer/WpnExplorerPanelView.tsx
        const nextProj: Record<string, WpnProjectRow[]> = {};
        for (const [id, projects] of entries) {
          nextProj[id] = projects;
        }
        setProjectsByWs(nextProj);
```

**What triggers `loadWorkspaces` (and thus `projectsByWs` updates):**

```527:545:src/renderer/shell/first-party/plugins/notes-explorer/WpnExplorerPanelView.tsx
  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    const onWpnTreeChanged = (): void => {
      void loadWorkspaces({ force: true });
    };
    window.addEventListener(NODEX_WPN_TREE_CHANGED_EVENT, onWpnTreeChanged);
    return () => window.removeEventListener(NODEX_WPN_TREE_CHANGED_EVENT, onWpnTreeChanged);
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!projectOpen || !syncWpnNotesBackend()) return;
    const id = window.setInterval(() => {
      void loadWorkspaces({ manageBusy: false });
    }, WPN_SYNC_REMOTE_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [projectOpen, loadWorkspaces]);
```

Poll interval (when sync backend is active):

```8:13:src/renderer/shell/first-party/plugins/notes-explorer/wpnExplorerEvents.ts
/**
 * When WPN is backed by the sync HTTP API, remote changes (other devices/tabs) do not emit
 * {@link NODEX_WPN_TREE_CHANGED_EVENT}. The Notes explorer polls at this interval.
 * Tradeoff: request volume vs freshness (aligned with `useShellProjectWorkspace` project-state poll).
 */
export const WPN_SYNC_REMOTE_POLL_INTERVAL_MS = 8000;
```

**Chain:** User expands project **B** while a note tab from project **A** is active → `loadWorkspaces` completes → `setProjectsByWs` → follow effect runs → `setSelectedProjectId(A)` → gate in §1 fails for **B** → tree disappears.

### 3. Row click vs chevron (related UX)

Project **row** sets only `selectedProjectId` (no `expandedProjects` update):

```1571:1575:src/renderer/shell/first-party/plugins/notes-explorer/WpnExplorerPanelView.tsx
                            onClick={(e) => {
                              if (isRenamingProj) return;
                              if ((e.target as HTMLElement).closest("[data-wpn-tree-chevron]")) return;
                              setSelectedProjectId(p.id);
                            }}
```

Chevron, when expanding, adds the id to `expandedProjects` **and** selects the project:

```1601:1608:src/renderer/shell/first-party/plugins/notes-explorer/WpnExplorerPanelView.tsx
                              onClick={() => {
                                const n = new Set(expandedProjects);
                                if (n.has(p.id)) n.delete(p.id);
                                else {
                                  n.add(p.id);
                                  setSelectedProjectId(p.id);
                                }
                                setExpandedProjects(n);
                              }}
```

---

## Proposed fixes (choose one product direction)

### Option A — Narrow effect dependencies (preferred if we keep one `selectedProjectId`)

- Run the follow logic when **`currentNoteId`** changes (and on first successful resolution when the note’s project becomes visible), **not** on every `projectsByWs` identity change.
- Still need a path for **initial load**: e.g. depend on a stable signature (`workspaceIds` + `projectIds` joined) or a “map became non-empty” transition instead of the full object reference.

### Option B — User browse override

- Track a ref like `explorerBrowseLockProjectId` or `skipFollowUntilNoteActivated` set when the user explicitly selects another project; clear when they open a note from the explorer or explicitly “sync to open note”.

### Option C — Split state

- **`explorerSelectedProjectId`** (what the tree shows) vs **`followNoteProjectId`** (derived from `currentNoteId`), with explicit rules for when they converge.

---

## File changes (implementation checklist)

| Area | File(s) | Change |
|------|---------|--------|
| Core behavior | `src/renderer/shell/first-party/plugins/notes-explorer/WpnExplorerPanelView.tsx` | Adjust follow-note `useEffect` deps and/or guards; optionally align row-click with chevron (expand+select) if product wants row-open. |
| Events / timing context | `src/renderer/shell/first-party/plugins/notes-explorer/wpnExplorerEvents.ts` | Only if polling constants or event contract need documenting/tests; unlikely code change for Option A alone. |
| Tree refresh entrypoints | Same `WpnExplorerPanelView.tsx` (`loadWorkspaces`, listeners) | No change unless we add explicit “sync explorer to note” command. |
| Docs | `docs/wpn-explorer-ux-cursor-prompt.md`, `claude-docs/architecture/chrome-shell-navigation-and-notes.md` | Short note: explorer selection vs active note; when follow runs. |
| Tests | Search for existing renderer tests for shell/explorer; add regression if harness exists (`*.test.tsx` near shell). | Assert: with `currentNoteId` in project A, simulate `projectsByWs` refresh → selection must not leave B if Option B/C, or must follow A if product explicitly keeps current behavior. |

**Likely no changes** to packaged plugin manifests, `window.Nodex` IPC contracts, or WPN JSON persistence for **Option A** (pure React state / effect logic).

---

## Caveats

1. **Intentional behavior today:** Keeping the explorer aligned with the active note is useful when switching tabs; a naive “remove `projectsByWs` from deps” can regress “open explorer after sync / first load” unless first-load is handled.
2. **Chevron vs selection mismatch:** If we only fix the effect, expanded chevron state can still show ▼ while the note list is hidden because `selectedProjectId` moved — consider pruning `expandedProjects` when selection moves away, or decouple display from chevron semantics.
3. **Polling / tree-changed churn:** Any fix should be tested with `syncWpnNotesBackend()` on and with `dispatchWpnTreeChanged()` callers (scratch, notes shell plugin).
4. **Search:** The follow effect calls `setSearch("")`; preserving user search while browsing may be a separate product decision.

---

## Architectural impact

- **State model:** Today one `selectedProjectId` serves both “show this project’s tree” and “implicit follow of active note.” Splitting (Option C) clarifies responsibilities but touches more call sites (every `setSelectedProjectId` path).
- **Shell vs WPN:** No backend/WPN schema change; this is renderer synchronization policy.
- **Accessibility / commands:** If we add “Sync explorer to active note,” register via existing `useRegisterNotesExplorerPlugin` / command registry pattern.

---

## Related IDs / context

- Parent note id (this plan’s parent): `69d6dacb-cd57-49d3-827a-e463c3ea1bab`
- This note id: `c9e8923d-2f3a-48b2-89fb-e6d610cdfd0b`
- Other id from command context: `db1a1cce-c255-4ca3-8173-918147ec1f2f` (not used as parent for this child)
