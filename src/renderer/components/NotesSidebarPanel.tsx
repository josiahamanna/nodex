import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CreateNoteRelation,
  NoteListItem,
  NoteMovePlacement,
  PasteSubtreePayload,
} from "../../preload";
import { noteTypeInitials } from "../utils/note-type-initials";
import {
  buildWorkspaceSidebarSections,
  type SidebarAssetsRow,
} from "../../shared/sidebar-assets-rows";
import { useNodexDialog } from "../dialog/NodexDialogProvider";
import ProjectAssetsInline from "./ProjectAssetsInline";
import WorkspaceMountHeaderSurface from "./WorkspaceMountHeaderSurface";
import SectionLabel from "../notes-sidebar/SectionLabel";
import {
  clipboardTouchesDeleted,
  ctxBtn,
  DND_NOTE_IDS_MIME,
  DND_NOTE_MIME,
  folderDisplayName,
  isStrictAncestor,
  minimalSelectedRoots,
  parentMapFromNotes,
  parseDragIds,
  readCollapsedIds,
  readWorkspaceSectionExpandedMap,
  visibleNotesList,
  writeCollapsedIds,
  writeWorkspaceSectionExpandedMap,
  WORKSPACE_MOUNT_ROW_RE,
  type ClipboardState,
  type ContextMenuState,
  type DropHint,
} from "../notes-sidebar/notes-sidebar-utils";

export interface NotesSidebarPanelProps {
  notes: NoteListItem[];
  registeredTypes: string[];
  currentNoteId?: string;
  onNoteSelect: (noteId: string) => void;
  onCreateNote: (payload: {
    anchorId?: string;
    relation: CreateNoteRelation;
    type: string;
  }) => Promise<void>;
  onRenameNote: (id: string, title: string) => Promise<void>;
  onMoveNote: (payload: {
    draggedId: string;
    targetId: string;
    placement: NoteMovePlacement;
  }) => Promise<void>;
  onMoveNotesBulk: (payload: {
    ids: string[];
    targetId: string;
    placement: NoteMovePlacement;
  }) => Promise<void>;
  onDeleteNotes: (ids: string[]) => Promise<void>;
  onPasteSubtree: (payload: PasteSubtreePayload) => Promise<void>;
  /** Adds another on-disk project folder; notes trees are merged under the sidebar. */
  onAddWorkspaceFolder?: () => void;
  /** Opens the on-disk project folder that owns this note (file manager). */
  onRevealProjectFolder?: (noteId: string) => void;
  /** Reload merged notes from every open project folder. */
  onRefreshWorkspace?: () => void;
  /** Open disk `assets/` files in the main pane (per project folder). */
  workspaceRoots: string[];
  onOpenProjectAsset: (projectRoot: string, relativePath: string) => void;
  /** Bumps to refresh inline asset trees after global undo/redo. */
  assetFsTick?: number;
}

const NotesSidebarPanel: React.FC<NotesSidebarPanelProps> = ({
  notes,
  registeredTypes,
  currentNoteId,
  onNoteSelect,
  onCreateNote,
  onRenameNote,
  onMoveNote,
  onMoveNotesBulk,
  onDeleteNotes,
  onPasteSubtree,
  onAddWorkspaceFolder,
  onRevealProjectFolder,
  onRefreshWorkspace,
  workspaceRoots,
  onOpenProjectAsset,
  assetFsTick = 0,
}) => {
  const { confirm, alert } = useNodexDialog();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(readCollapsedIds);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(() => new Set());
  const selectionAnchorRef = useRef<string | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState>(null);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [workspaceSectionExpanded, setWorkspaceSectionExpanded] = useState<
    Record<string, boolean>
  >(() => readWorkspaceSectionExpandedMap());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingBulkCount, setDraggingBulkCount] = useState(0);
  const draggingRef = useRef<string | null>(null);
  const draggingIdsRef = useRef<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const parents = useMemo(() => parentMapFromNotes(notes), [notes]);

  /** Last top-level note in outline order — paste “into workspace” appends after this sibling. */
  const lastTopLevelId = useMemo(() => {
    let last: string | null = null;
    for (const n of notes) {
      if (n.depth === 0 && !WORKSPACE_MOUNT_ROW_RE.test(n.id)) {
        last = n.id;
      }
    }
    return last;
  }, [notes]);

  const noteIdSet = useMemo(() => new Set(notes.map((n) => n.id)), [notes]);

  const hasChildrenMap = useMemo(() => {
    const m = new Set<string>();
    for (const n of notes) {
      if (n.parentId) {
        m.add(n.parentId);
      }
    }
    return m;
  }, [notes]);

  const visibleNotes = useMemo(
    () => visibleNotesList(notes, collapsedIds, parents),
    [notes, collapsedIds, parents],
  );

  useEffect(() => {
    setCollapsedIds((prev) => {
      const next = new Set([...prev].filter((id) => noteIdSet.has(id)));
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) {
        return prev;
      }
      writeCollapsedIds(next);
      return next;
    });
  }, [noteIdSet]);

  useEffect(() => {
    setSelectedNoteIds((prev) => {
      const next = new Set([...prev].filter((id) => noteIdSet.has(id)));
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) {
        return prev;
      }
      return next;
    });
  }, [noteIdSet]);

  useEffect(() => {
    if (!currentNoteId || !noteIdSet.has(currentNoteId)) {
      return;
    }
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      let p = parents.get(currentNoteId) ?? null;
      let changed = false;
      while (p) {
        if (next.has(p)) {
          next.delete(p);
          changed = true;
        }
        p = parents.get(p) ?? null;
      }
      if (!changed) {
        return prev;
      }
      writeCollapsedIds(next);
      return next;
    });
  }, [currentNoteId, parents, noteIdSet]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedNoteIds(new Set());
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const closeMenu = () => setMenu(null);

  useEffect(() => {
    if (!menu) {
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) {
        return;
      }
      setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const toggleCollapsed = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      writeCollapsedIds(next);
      return next;
    });
  };

  const toggleWorkspaceSection = useCallback((sectionKey: string) => {
    setWorkspaceSectionExpanded((prev) => {
      const wasOpen = prev[sectionKey] !== false;
      const next = { ...prev };
      if (wasOpen) {
        next[sectionKey] = false;
      } else {
        delete next[sectionKey];
      }
      writeWorkspaceSectionExpandedMap(next);
      return next;
    });
  }, []);

  const getTypeBadgeClass = (type: string): string => {
    switch (type) {
      case "markdown":
        return "bg-badge-markdown-bg text-badge-markdown-fg";
      case "text":
        return "bg-badge-text-bg text-badge-text-fg";
      case "code":
        return "bg-badge-code-bg text-badge-code-fg";
      default:
        return "bg-badge-default-bg text-badge-default-fg";
    }
  };

  const openRename = (id: string, title: string) => {
    closeMenu();
    setRenameTarget({ id, title });
    setRenameDraft(title);
  };

  const submitRename = async () => {
    if (!renameTarget) {
      return;
    }
    const t = renameDraft.trim();
    if (!t) {
      return;
    }
    await onRenameNote(renameTarget.id, t);
    setRenameTarget(null);
  };

  const placementFromPointer = (
    e: React.DragEvent,
    el: HTMLElement,
  ): NoteMovePlacement => {
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const frac = rect.height > 0 ? y / rect.height : 0.5;
    // Wider “into” band reduces placement flip-flop at row boundaries while dragging.
    if (frac < 0.25) {
      return "before";
    }
    if (frac > 0.75) {
      return "after";
    }
    return "into";
  };

  const dropAllowedOne = (
    draggedId: string,
    targetId: string,
    placement: NoteMovePlacement,
  ): boolean => {
    if (draggedId === targetId) {
      return false;
    }
    if (
      WORKSPACE_MOUNT_ROW_RE.test(targetId) &&
      (placement === "before" || placement === "after")
    ) {
      return false;
    }
    if (isStrictAncestor(draggedId, targetId, parents)) {
      return false;
    }
    if (placement === "into" && targetId === draggedId) {
      return false;
    }
    return true;
  };

  const dropAllowedMany = (
    draggedIds: string[],
    targetId: string,
    placement: NoteMovePlacement,
  ): boolean => {
    if (draggedIds.length === 0) {
      return false;
    }
    const dragSet = new Set(draggedIds);
    for (const d of draggedIds) {
      if (!dropAllowedOne(d, targetId, placement)) {
        return false;
      }
    }
    if (dragSet.has(targetId)) {
      return false;
    }
    return true;
  };

  const idsToDragForRow = (noteId: string): string[] => {
    if (WORKSPACE_MOUNT_ROW_RE.test(noteId)) {
      return [];
    }
    const sel = selectedNoteIds;
    if (sel.has(noteId) && sel.size > 1) {
      const bulk = new Set(sel);
      return minimalSelectedRoots(bulk, parents).filter(
        (id) => !WORKSPACE_MOUNT_ROW_RE.test(id),
      );
    }
    return [noteId];
  };

  const workspaceSections = useMemo(
    () => buildWorkspaceSidebarSections(visibleNotes, workspaceRoots),
    [visibleNotes, workspaceRoots],
  );

  const padForSectionNote = (note: NoteListItem, depthTrim: number) =>
    6 + Math.max(0, note.depth - depthTrim) * 12;

  const assetsDepthInSection = (row: SidebarAssetsRow, depthTrim: number) =>
    Math.max(0, row.depth - depthTrim);

  const multiSelectCount = selectedNoteIds.size;
  const bulkDeleteRoots =
    multiSelectCount > 1
      ? minimalSelectedRoots(selectedNoteIds, parents)
      : [];

  const contextMenuPortal =
    menu &&
    createPortal(
      <div
        ref={menuRef}
        className="fixed z-[100] min-w-[220px] rounded-md border border-border bg-popover py-1 shadow-md"
        style={{ left: menu.x, top: menu.y }}
        role="menu"
      >
        {menu.step === "main" ? (
          <>
            {menu.workspaceProjectRoot ? (
              <>
                <button
                  type="button"
                  className={ctxBtn}
                  onClick={() => {
                    const p = menu.workspaceProjectRoot;
                    closeMenu();
                    if (p) {
                      void window.Nodex.revealProjectFolderInExplorer(p);
                    }
                  }}
                >
                  Open project folder…
                </button>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  className={ctxBtn}
                  onClick={() => {
                    const p = menu.workspaceProjectRoot;
                    if (!p) {
                      return;
                    }
                    const name = folderDisplayName(p);
                    closeMenu();
                    void (async () => {
                      const ok = await confirm({
                        title: "Remove from workspace",
                        message: `Remove “${name}” from this workspace?`,
                        detail:
                          "Notes and files on disk stay in the folder. You can add it again with Add folder.",
                        confirmLabel: "Remove",
                        cancelLabel: "Cancel",
                        variant: "default",
                      });
                      if (!ok) {
                        return;
                      }
                      const r = await window.Nodex.removeWorkspaceRoot(p, false);
                      if (!r.ok) {
                        void alert({
                          title: "Could not update workspace",
                          message: r.error,
                        });
                      }
                    })();
                  }}
                >
                  Remove from workspace…
                </button>
                <button
                  type="button"
                  className={`${ctxBtn} font-medium text-foreground/90 hover:text-foreground`}
                  onClick={() => {
                    const p = menu.workspaceProjectRoot;
                    if (!p) {
                      return;
                    }
                    const name = folderDisplayName(p);
                    closeMenu();
                    void (async () => {
                      const ok = await confirm({
                        title: "Move to Trash",
                        message: `Remove “${name}” from the workspace and move the folder to the Trash?`,
                        detail:
                          "The app detaches this project first, then asks the system to move the folder to Trash. You may be able to restore it from Trash depending on your OS.",
                        confirmLabel: "Move to Trash",
                        cancelLabel: "Cancel",
                        variant: "danger",
                      });
                      if (!ok) {
                        return;
                      }
                      const r = await window.Nodex.removeWorkspaceRoot(p, true);
                      if (!r.ok) {
                        void alert({
                          title: "Could not update workspace",
                          message: r.error,
                        });
                        return;
                      }
                      if (r.trashError) {
                        void alert({
                          title: "Removed from workspace",
                          message:
                            "The folder was removed from the workspace, but moving it to Trash failed.",
                          detail: r.trashError,
                        });
                      }
                    })();
                  }}
                >
                  Move to Trash and remove…
                </button>
              </>
            ) : menu.anchorId ? (
              <>
                {multiSelectCount <= 1 ? (
                  <button
                    type="button"
                    className={ctxBtn}
                    onClick={() => {
                      const n = notes.find((x) => x.id === menu.anchorId);
                      if (n) {
                        openRename(n.id, n.title);
                      }
                    }}
                  >
                    Rename…
                  </button>
                ) : null}
                {multiSelectCount <= 1 &&
                menu.anchorId &&
                onRevealProjectFolder ? (
                  <button
                    type="button"
                    className={ctxBtn}
                    onClick={() => {
                      const id = menu.anchorId;
                      closeMenu();
                      if (id) {
                        void onRevealProjectFolder(id);
                      }
                    }}
                  >
                    Open project folder…
                  </button>
                ) : null}
                {multiSelectCount <= 1 ? (
                  <button
                    type="button"
                    className={ctxBtn}
                    onClick={() => {
                      if (menu.anchorId) {
                        setClipboard({ mode: "cut", sourceId: menu.anchorId });
                      }
                      closeMenu();
                    }}
                  >
                    Cut
                  </button>
                ) : null}
                {multiSelectCount <= 1 ? (
                  <button
                    type="button"
                    className={ctxBtn}
                    onClick={() => {
                      if (menu.anchorId) {
                        setClipboard({ mode: "copy", sourceId: menu.anchorId });
                      }
                      closeMenu();
                    }}
                  >
                    Copy
                  </button>
                ) : null}
                {bulkDeleteRoots.length > 0 ? (
                  <button
                    type="button"
                    className={ctxBtn}
                    onClick={() => {
                      const n = bulkDeleteRoots.length;
                      void (async () => {
                        const ok = await confirm({
                          title: "Delete notes",
                          message: `Delete ${n} note${n === 1 ? "" : "s"} and their subtrees?`,
                          confirmLabel: "Delete",
                          variant: "danger",
                        });
                        if (!ok) {
                          return;
                        }
                        closeMenu();
                        try {
                          await onDeleteNotes(bulkDeleteRoots);
                          setSelectedNoteIds(new Set());
                          setClipboard((c) =>
                            c &&
                            clipboardTouchesDeleted(
                              c.sourceId,
                              bulkDeleteRoots,
                              parents,
                            )
                              ? null
                              : c,
                          );
                        } catch {
                          /* app error state */
                        }
                      })();
                    }}
                  >
                    Delete {bulkDeleteRoots.length}…
                  </button>
                ) : null}
                {multiSelectCount <= 1 ? (
                  <button
                    type="button"
                    className={ctxBtn}
                    onClick={() => {
                      if (!menu.anchorId) {
                        return;
                      }
                      const id = menu.anchorId;
                      void (async () => {
                        const ok = await confirm({
                          title: "Delete note",
                          message: "Delete this note and all notes under it?",
                          confirmLabel: "Delete",
                          variant: "danger",
                        });
                        if (!ok) {
                          return;
                        }
                        closeMenu();
                        try {
                          await onDeleteNotes([id]);
                          setSelectedNoteIds(new Set());
                          setClipboard((c) =>
                            c &&
                            clipboardTouchesDeleted(c.sourceId, [id], parents)
                              ? null
                              : c,
                          );
                        } catch {
                          /* app error state */
                        }
                      })();
                    }}
                  >
                    Delete…
                  </button>
                ) : null}
                {clipboard && multiSelectCount <= 1 ? (
                  <>
                    <div className="my-1 h-px bg-border" />
                    <button
                      type="button"
                      className={ctxBtn}
                      onClick={async () => {
                        if (!clipboard || !menu.anchorId) {
                          return;
                        }
                        try {
                          await onPasteSubtree({
                            ...clipboard,
                            targetId: menu.anchorId,
                            placement: "into",
                          });
                          if (clipboard.mode === "cut") {
                            setClipboard(null);
                          }
                        } catch {
                          /* surfaced in app */
                        }
                        closeMenu();
                      }}
                    >
                      Paste as child
                    </button>
                    <button
                      type="button"
                      className={ctxBtn}
                      onClick={async () => {
                        if (!clipboard || !menu.anchorId) {
                          return;
                        }
                        try {
                          await onPasteSubtree({
                            ...clipboard,
                            targetId: menu.anchorId,
                            placement: "after",
                          });
                          if (clipboard.mode === "cut") {
                            setClipboard(null);
                          }
                        } catch {
                          /* surfaced in app */
                        }
                        closeMenu();
                      }}
                    >
                      Paste as sibling
                    </button>
                  </>
                ) : null}
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  className={ctxBtn}
                  onClick={() =>
                    setMenu({
                      ...menu,
                      step: "pickType",
                      pickRelation: "child",
                    })
                  }
                >
                  New child…
                </button>
                <button
                  type="button"
                  className={ctxBtn}
                  onClick={() =>
                    setMenu({
                      ...menu,
                      step: "pickType",
                      pickRelation: "sibling",
                    })
                  }
                >
                  New sibling…
                </button>
              </>
            ) : (
              <>
                {clipboard && lastTopLevelId ? (
                  <>
                    <button
                      type="button"
                      className={ctxBtn}
                      onClick={async () => {
                        if (!clipboard) {
                          return;
                        }
                        try {
                          await onPasteSubtree({
                            ...clipboard,
                            targetId: lastTopLevelId,
                            placement: "after",
                          });
                          if (clipboard.mode === "cut") {
                            setClipboard(null);
                          }
                        } catch {
                          /* surfaced in app */
                        }
                        closeMenu();
                      }}
                    >
                      Paste into workspace
                    </button>
                    <div className="my-1 h-px bg-border" />
                  </>
                ) : null}
                <button
                  type="button"
                  className={ctxBtn}
                  onClick={() =>
                    setMenu({
                      ...menu,
                      step: "pickType",
                      pickRelation: "root",
                    })
                  }
                >
                  New top-level note…
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              className={ctxBtn}
              onClick={() =>
                setMenu({
                  ...menu,
                  step: "main",
                  pickRelation: undefined,
                })
              }
            >
              ← Back
            </button>
            <div className="my-1 h-px bg-border" />
            <p className="px-2.5 pb-1 text-[11px] text-muted-foreground">
              Note type
            </p>
            <div className="max-h-48 overflow-y-auto px-1">
              {registeredTypes.filter((t) => t !== "root").length === 0 ? (
                <p className="px-2 py-1 text-[11px] text-muted-foreground">
                  No types loaded
                </p>
              ) : (
                registeredTypes
                  .filter((t) => t !== "root")
                  .map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={ctxBtn}
                      onClick={async () => {
                        const rel = menu.pickRelation ?? "root";
                        const anchorId =
                          rel === "root"
                            ? undefined
                            : menu.anchorId ?? undefined;
                        try {
                          await onCreateNote({
                            relation: rel,
                            type,
                            anchorId,
                          });
                          closeMenu();
                        } catch {
                          /* surfaced in app */
                        }
                      }}
                    >
                      {type}
                    </button>
                  ))
              )}
            </div>
          </>
        )}
      </div>,
      document.body,
    );

  const renamePortal =
    renameTarget &&
    createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Rename note"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setRenameTarget(null);
          }
        }}
      >
        <div className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg">
          <p className="text-[13px] font-medium text-foreground">Rename note</p>
          <input
            type="text"
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitRename();
              }
              if (e.key === "Escape") {
                setRenameTarget(null);
              }
            }}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted/60"
              onClick={() => setRenameTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="nodex-btn-neutral rounded-md px-3 py-1.5 text-[12px] font-semibold"
              disabled={!renameDraft.trim()}
              onClick={() => void submitRename()}
            >
              Save
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  const handleRowClick = (
    noteId: string,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const idx = visibleNotes.findIndex((n) => n.id === noteId);
    if (e.shiftKey && selectionAnchorRef.current) {
      const a = visibleNotes.findIndex((n) => n.id === selectionAnchorRef.current);
      if (a >= 0 && idx >= 0) {
        const lo = Math.min(a, idx);
        const hi = Math.max(a, idx);
        const next = new Set<string>();
        for (let i = lo; i <= hi; i++) {
          next.add(visibleNotes[i]!.id);
        }
        setSelectedNoteIds(next);
        void onNoteSelect(noteId);
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      setSelectedNoteIds((prev) => {
        const next = new Set(prev);
        if (next.has(noteId)) {
          next.delete(noteId);
        } else {
          next.add(noteId);
        }
        return next;
      });
      selectionAnchorRef.current = noteId;
      void onNoteSelect(noteId);
      return;
    }
    setSelectedNoteIds(new Set([noteId]));
    selectionAnchorRef.current = noteId;
    void onNoteSelect(noteId);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col bg-sidebar text-sidebar-foreground">
      {contextMenuPortal}
      {renamePortal}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <div className="mb-1 flex items-center justify-between gap-2 px-1">
          <SectionLabel>Notes</SectionLabel>
          <div className="flex min-w-0 shrink-0 items-center gap-1">
            {onRefreshWorkspace ? (
              <button
                type="button"
                className="rounded-sm border border-sidebar-border bg-sidebar-accent/40 px-1.5 py-0.5 text-[10px] font-medium text-sidebar-foreground/90 shadow-sm hover:bg-sidebar-accent"
                title="Reload notes from all open project folders"
                onClick={onRefreshWorkspace}
              >
                Refresh
              </button>
            ) : null}
            {onAddWorkspaceFolder ? (
              <button
                type="button"
                className="rounded-sm border border-sidebar-border bg-sidebar-accent/40 px-1.5 py-0.5 text-[10px] font-medium text-sidebar-foreground/90 shadow-sm hover:bg-sidebar-accent"
                title="Add another project folder and merge its notes here"
                onClick={onAddWorkspaceFolder}
              >
                Add folder
              </button>
            ) : null}
            {selectedNoteIds.size > 1 ? (
              <button
                type="button"
                className="rounded-sm px-1.5 py-0.5 text-[10px] font-medium text-sidebar-foreground/60 underline-offset-2 hover:text-sidebar-foreground hover:underline"
                onClick={() => setSelectedNoteIds(new Set())}
              >
                Clear ({selectedNoteIds.size})
              </button>
            ) : !onAddWorkspaceFolder && !onRefreshWorkspace ? (
              <span className="w-px shrink-0" aria-hidden />
            ) : null}
          </div>
        </div>
        <div
          className="min-h-[120px] rounded-md transition-shadow duration-150"
          onContextMenu={(e) => {
            const el = e.target as HTMLElement;
            if (el.closest("[data-note-row]")) {
              return;
            }
            if (el.closest("[data-workspace-section-header]")) {
              return;
            }
            e.preventDefault();
            setSelectedNoteIds(new Set());
            setMenu({
              x: e.clientX,
              y: e.clientY,
              anchorId: null,
              step: "main",
            });
          }}
        >
          {workspaceSections.map((sec) => {
            const sectionOpen =
              workspaceSectionExpanded[sec.sectionKey] !== false;
            const headerMount = sec.mountNote;
            return (
              <section
                key={sec.sectionKey}
                className="mb-2 overflow-hidden rounded-lg border border-sidebar-border/50 bg-sidebar/15"
              >
                <div
                  className="flex min-h-8 items-stretch border-b border-sidebar-border/50 bg-sidebar-accent/30"
                  data-workspace-section-header
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedNoteIds(new Set());
                    setMenu({
                      x: e.clientX,
                      y: e.clientY,
                      anchorId: null,
                      workspaceProjectRoot: sec.projectRoot,
                      step: "main",
                    });
                  }}
                >
                  <button
                    type="button"
                    aria-expanded={sectionOpen}
                    aria-label={
                      sectionOpen ? "Collapse project" : "Expand project"
                    }
                    className="flex w-7 shrink-0 items-center justify-center border-r border-sidebar-border/40 text-sidebar-foreground/60 outline-none hover:bg-sidebar-accent/40 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                    onClick={() => toggleWorkspaceSection(sec.sectionKey)}
                  >
                    <span className="text-[10px] leading-none">
                      {sectionOpen ? "▾" : "▸"}
                    </span>
                  </button>
                  {headerMount ? (
                    <WorkspaceMountHeaderSurface
                      plainHeader
                      folderLabel={folderDisplayName(sec.projectRoot)}
                      mount={headerMount}
                      draggingId={draggingId}
                      currentNoteId={currentNoteId}
                      selectedNoteIds={selectedNoteIds}
                      dropHint={dropHint}
                      setDropHint={setDropHint}
                      draggingRef={draggingRef}
                      draggingIdsRef={draggingIdsRef}
                      setDraggingId={setDraggingId}
                      setDraggingBulkCount={setDraggingBulkCount}
                      parseDragIds={parseDragIds}
                      placementFromPointer={placementFromPointer}
                      dropAllowedOne={dropAllowedOne}
                      dropAllowedMany={dropAllowedMany}
                      onMoveNote={onMoveNote}
                      onMoveNotesBulk={onMoveNotesBulk}
                      handleRowClick={handleRowClick}
                      onNoteSelect={onNoteSelect}
                      setMenu={setMenu}
                      getTypeBadgeClass={getTypeBadgeClass}
                    />
                  ) : (
                    <div
                      className="flex min-w-0 flex-1 items-center truncate px-2 py-1 font-mono text-[11px] text-sidebar-foreground/90"
                      title={sec.projectRoot}
                    >
                      {folderDisplayName(sec.projectRoot)}
                    </div>
                  )}
                </div>
                {sectionOpen ? (
                  <ul
                    className={`m-0 flex list-none flex-col gap-px p-0 ${
                      draggingId ? "select-none" : ""
                    }`}
                    role="list"
                  >
                    {sec.innerRows.map((row) => {
                      if (row.kind === "assets") {
                        return (
                          <ProjectAssetsInline
                            key={`${row.key}-${assetFsTick}`}
                            projectRoot={row.projectRoot}
                            depth={assetsDepthInSection(row, sec.depthTrim)}
                            storageKey={row.key}
                            onOpenFile={(rel) =>
                              onOpenProjectAsset(row.projectRoot, rel)
                            }
                          />
                        );
                      }
                      const note = row.note;
                      const primarySelected = currentNoteId === note.id;
                      const inMulti = selectedNoteIds.has(note.id);
                      const selected = primarySelected || inMulti;
                      const pad = padForSectionNote(note, sec.depthTrim);
              const hint =
                dropHint?.targetId === note.id ? dropHint.placement : null;
              const showChevron = hasChildrenMap.has(note.id);
              const collapsed = collapsedIds.has(note.id);
              const isDraggingRow = draggingId === note.id;
              const initials = noteTypeInitials(note.type);

              return (
                <li
                  key={note.id}
                  draggable={!WORKSPACE_MOUNT_ROW_RE.test(note.id)}
                  onDragStart={(e) => {
                    const dragIds = idsToDragForRow(note.id);
                    if (dragIds.length === 0) {
                      e.preventDefault();
                      return;
                    }
                    draggingIdsRef.current = dragIds;
                    draggingRef.current = dragIds[0]!;
                    setDraggingId(note.id);
                    setDraggingBulkCount(dragIds.length);
                    if (dragIds.length > 1) {
                      e.dataTransfer.setData(
                        DND_NOTE_IDS_MIME,
                        JSON.stringify(dragIds),
                      );
                    }
                    e.dataTransfer.setData(DND_NOTE_MIME, dragIds[0]!);
                    e.dataTransfer.setData("text/plain", dragIds[0]!);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    draggingRef.current = null;
                    draggingIdsRef.current = [];
                    setDraggingId(null);
                    setDraggingBulkCount(0);
                    setDropHint(null);
                  }}
                  onDragOver={(e) => {
                    const fromMime =
                      e.dataTransfer.types.includes(DND_NOTE_IDS_MIME) ||
                      e.dataTransfer.types.includes(DND_NOTE_MIME) ||
                      e.dataTransfer.types.includes("text/plain");
                    if (!fromMime) {
                      return;
                    }
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const raw = draggingIdsRef.current.length
                      ? draggingIdsRef.current
                      : draggingRef.current
                        ? [draggingRef.current]
                        : parseDragIds(e);
                    if (raw.length === 0) {
                      return;
                    }
                    const placement = placementFromPointer(
                      e,
                      e.currentTarget as HTMLElement,
                    );
                    const ok =
                      raw.length === 1
                        ? dropAllowedOne(raw[0]!, note.id, placement)
                        : dropAllowedMany(raw, note.id, placement);
                    if (ok) {
                      setDropHint((h) =>
                        h?.targetId === note.id && h?.placement === placement
                          ? h
                          : { targetId: note.id, placement },
                      );
                    } else {
                      setDropHint(null);
                    }
                  }}
                  onDragLeave={(e) => {
                    const rel = e.relatedTarget as Node | null;
                    const cur = e.currentTarget as HTMLElement;
                    if (rel && cur.contains(rel)) {
                      return;
                    }
                    setDropHint((h) =>
                      h?.targetId === note.id ? null : h,
                    );
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropHint(null);
                    const raw = parseDragIds(e);
                    draggingRef.current = null;
                    draggingIdsRef.current = [];
                    setDraggingId(null);
                    setDraggingBulkCount(0);
                    if (raw.length === 0) {
                      return;
                    }
                    const placement = placementFromPointer(
                      e,
                      e.currentTarget as HTMLElement,
                    );
                    const ok =
                      raw.length === 1
                        ? dropAllowedOne(raw[0]!, note.id, placement)
                        : dropAllowedMany(raw, note.id, placement);
                    if (!ok) {
                      return;
                    }
                    if (raw.length === 1) {
                      void onMoveNote({
                        draggedId: raw[0]!,
                        targetId: note.id,
                        placement,
                      });
                    } else {
                      void onMoveNotesBulk({
                        ids: raw,
                        targetId: note.id,
                        placement,
                      });
                    }
                  }}
                  className={`relative rounded-md transition-[box-shadow,background-color] duration-150 ${
                    isDraggingRow ? "opacity-55" : ""
                  }`}
                >
                  {hint ? (
                    <span
                      className="pointer-events-none absolute right-1 top-1/2 z-30 -translate-y-1/2 whitespace-nowrap rounded border border-border bg-popover px-1 py-px text-[8px] font-medium leading-tight text-foreground shadow-sm"
                      aria-live="polite"
                    >
                      {hint === "before"
                        ? "above (sibling)"
                        : hint === "after"
                          ? "below (sibling)"
                          : "child"}
                    </span>
                  ) : null}
                  {hint === "before" ? (
                    <div
                      className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-center justify-center"
                      aria-hidden
                    >
                      <div className="h-[2px] w-full rounded-full bg-foreground shadow-[0_0_0_1px_hsl(var(--background))]" />
                    </div>
                  ) : null}
                  {hint === "after" ? (
                    <div
                      className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center"
                      aria-hidden
                    >
                      <div className="h-[2px] w-full rounded-full bg-foreground shadow-[0_0_0_1px_hsl(var(--background))]" />
                    </div>
                  ) : null}
                  {hint === "into" ? (
                    <div
                      className="pointer-events-none absolute inset-1 z-10 rounded-md border-2 border-dotted border-foreground/60 bg-foreground/5 dark:bg-foreground/12"
                      aria-hidden
                    />
                  ) : null}
                  <div
                    className="flex min-h-8 items-stretch rounded-md transition-colors duration-150"
                    style={{ paddingLeft: pad }}
                  >
                    {showChevron ? (
                      <button
                        type="button"
                        aria-expanded={!collapsed}
                        aria-label={collapsed ? "Expand" : "Collapse"}
                        className="flex w-6 shrink-0 items-center justify-center rounded-l-md text-sidebar-foreground/55 outline-none hover:bg-sidebar-accent/50 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          toggleCollapsed(note.id);
                        }}
                      >
                        <span className="text-[10px] leading-none">
                          {collapsed ? "▸" : "▾"}
                        </span>
                      </button>
                    ) : (
                      <span className="w-6 shrink-0" aria-hidden />
                    )}
                    <button
                      type="button"
                      data-note-row
                      onClick={(ev) => handleRowClick(note.id, ev)}
                      onContextMenu={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        void onNoteSelect(note.id);
                        setMenu({
                          x: ev.clientX,
                          y: ev.clientY,
                          anchorId: note.id,
                          step: "main",
                        });
                      }}
                      className={`relative flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-r-md py-1 text-left outline-none transition-colors duration-150 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--sidebar-background))] ${
                        selected
                          ? inMulti && !primarySelected
                            ? "bg-foreground/10 text-sidebar-foreground ring-1 ring-inset ring-foreground/20 hover:bg-foreground/14"
                            : "bg-sidebar-accent text-sidebar-foreground before:pointer-events-none before:absolute before:left-1 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-foreground/55 before:content-[''] hover:bg-sidebar-accent"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/70"
                      } ${
                        draggingId === note.id
                          ? "cursor-grabbing"
                          : "cursor-default"
                      }`}
                    >
                      {draggingBulkCount > 1 && draggingId === note.id ? (
                        <span className="absolute right-2 top-1/2 z-[5] -translate-y-1/2 rounded-full bg-foreground px-1.5 py-0.5 text-[9px] font-bold text-background shadow-sm">
                          {draggingBulkCount}
                        </span>
                      ) : null}
                      <span
                        className={`inline-flex h-5 min-w-[1.75rem] shrink-0 items-center justify-center rounded px-0.5 font-mono text-[9px] font-semibold leading-none ring-1 ring-inset ring-foreground/10 dark:ring-white/15 ${getTypeBadgeClass(note.type)}`}
                      >
                        {initials}
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate text-[12px] leading-tight ${
                          primarySelected ? "font-medium" : "font-normal"
                        }`}
                      >
                        {note.title}
                      </span>
                    </button>
                  </div>
                </li>
              );
                    })}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
        <p className="mt-2 px-1 text-[10px] leading-snug text-sidebar-foreground/40">
          Each project section can be collapsed (chevron). Note chevrons remember
          their state when you reopen a section. Assets live under each project
          (only under <span className="font-mono">assets/</span>). ⌘/Ctrl+Z undo
          · ⌘/Ctrl+Shift+Z redo. Right-click notes for menu.
        </p>
        {clipboard ? (
          <p className="mt-1 px-1 text-[10px] text-sidebar-foreground/50">
            Clipboard: {clipboard.mode} — use right-click to paste.
          </p>
        ) : null}
        <p className="mt-2 px-1 text-[10px] text-sidebar-foreground/40">
          {notes.length} {notes.length === 1 ? "note" : "notes"}
        </p>
      </div>
    </div>
  );
};

export default NotesSidebarPanel;
