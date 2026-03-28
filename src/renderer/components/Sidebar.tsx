import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CreateNoteRelation,
  NoteListItem,
  NoteMovePlacement,
  PasteSubtreePayload,
} from "../../preload";
import { useTheme } from "../theme/ThemeContext";
import { noteTypeInitials } from "../utils/note-type-initials";

const DND_NOTE_MIME = "application/x-nodex-note-id";
const DND_NOTE_IDS_MIME = "application/x-nodex-note-ids";
const COLLAPSED_STORAGE_KEY = "nodex-sidebar-collapsed-ids";

type SidebarActiveTool = "plugin-ide" | "plugin-manager" | null;

type ContextMenuState = {
  x: number;
  y: number;
  anchorId: string | null;
  step: "main" | "pickType";
  pickRelation?: CreateNoteRelation;
};

type ClipboardState = { mode: "cut" | "copy"; sourceId: string } | null;

type DropHint = { targetId: string; placement: NoteMovePlacement };

function parentMapFromNotes(notes: NoteListItem[]): Map<string, string | null> {
  return new Map(notes.map((n) => [n.id, n.parentId]));
}

function readCollapsedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (!raw) {
      return new Set();
    }
    const a = JSON.parse(raw) as unknown;
    if (!Array.isArray(a)) {
      return new Set();
    }
    return new Set(a.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeCollapsedIds(ids: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

/** Top-level selected nodes (no selected ancestor). */
function minimalSelectedRoots(
  selected: Set<string>,
  parents: Map<string, string | null>,
): string[] {
  const arr = [...selected];
  const out: string[] = [];
  for (const id of arr) {
    let p = parents.get(id) ?? null;
    let under = false;
    while (p) {
      if (selected.has(p)) {
        under = true;
        break;
      }
      p = parents.get(p) ?? null;
    }
    if (!under) {
      out.push(id);
    }
  }
  return [...new Set(out)];
}

function visibleNotesList(
  notes: NoteListItem[],
  collapsedIds: Set<string>,
  parents: Map<string, string | null>,
): NoteListItem[] {
  function anyAncestorCollapsed(id: string): boolean {
    let p = parents.get(id) ?? null;
    while (p) {
      if (collapsedIds.has(p)) {
        return true;
      }
      p = parents.get(p) ?? null;
    }
    return false;
  }
  return notes.filter((n) => !anyAncestorCollapsed(n.id));
}

/** True if `ancestorId` is a strict ancestor of `nodeId` in the tree. */
function isStrictAncestor(
  ancestorId: string,
  nodeId: string,
  parents: Map<string, string | null>,
): boolean {
  let cur: string | null = nodeId;
  while (cur != null) {
    const p = parents.get(cur);
    if (p === ancestorId) {
      return true;
    }
    cur = p ?? null;
  }
  return false;
}

function parseDragIds(e: React.DragEvent): string[] {
  const bulk = e.dataTransfer.getData(DND_NOTE_IDS_MIME);
  if (bulk) {
    try {
      const a = JSON.parse(bulk) as unknown;
      if (Array.isArray(a)) {
        return a.filter((x): x is string => typeof x === "string");
      }
    } catch {
      /* fall through */
    }
  }
  const one =
    e.dataTransfer.getData(DND_NOTE_MIME) ||
    e.dataTransfer.getData("text/plain");
  return one ? [one] : [];
}

function clipboardTouchesDeleted(
  sourceId: string,
  deletedRoots: string[],
  parents: Map<string, string | null>,
): boolean {
  for (const root of deletedRoots) {
    if (sourceId === root || isStrictAncestor(root, sourceId, parents)) {
      return true;
    }
  }
  return false;
}

interface SidebarProps {
  notes: NoteListItem[];
  registeredTypes: string[];
  workspaceRootId: string | null;
  currentNoteId?: string;
  activeSidebarTool?: SidebarActiveTool;
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
  onPluginManagerOpen: () => void;
  onPluginIdeOpen: () => void;
}

const sidebarFooterBtnBase =
  "flex min-h-9 w-full items-center justify-center rounded-sm border px-3 py-2.5 text-center text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--sidebar-background))]";
const sidebarFooterBtnIdle =
  "border-sidebar-border bg-background text-foreground hover:bg-muted/50 dark:bg-transparent dark:hover:bg-sidebar-accent/40";
const sidebarFooterBtnSelected =
  "relative border-sidebar-border bg-sidebar-accent font-semibold text-foreground before:pointer-events-none before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:bg-primary before:content-['']";

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/45">
    {children}
  </p>
);

const ctxBtn =
  "block w-full rounded-sm px-2.5 py-1.5 text-left text-[12px] text-popover-foreground outline-none hover:bg-accent hover:text-accent-foreground transition-colors duration-150";

const Sidebar: React.FC<SidebarProps> = ({
  notes,
  registeredTypes,
  workspaceRootId,
  currentNoteId,
  activeSidebarTool = null,
  onNoteSelect,
  onCreateNote,
  onRenameNote,
  onMoveNote,
  onMoveNotesBulk,
  onDeleteNotes,
  onPasteSubtree,
  onPluginManagerOpen,
  onPluginIdeOpen,
}) => {
  const { colorMode, setColorMode } = useTheme();
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingBulkCount, setDraggingBulkCount] = useState(0);
  const draggingRef = useRef<string | null>(null);
  const draggingIdsRef = useRef<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const parents = useMemo(() => parentMapFromNotes(notes), [notes]);

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
    if (frac < 0.33) {
      return "before";
    }
    if (frac > 0.66) {
      return "after";
    }
    return "into";
  };

  const dropAllowedOne = (
    draggedId: string,
    targetId: string,
    placement: NoteMovePlacement,
  ): boolean => {
    if (!workspaceRootId || draggedId === targetId) {
      return false;
    }
    if (draggedId === workspaceRootId) {
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
    if (noteId === workspaceRootId) {
      return [];
    }
    const sel = selectedNoteIds;
    if (sel.has(noteId) && sel.size > 1) {
      const bulk = new Set(sel);
      if (workspaceRootId) {
        bulk.delete(workspaceRootId);
      }
      return minimalSelectedRoots(bulk, parents);
    }
    return [noteId];
  };

  const multiSelectCount = selectedNoteIds.size;
  const bulkDeleteRoots =
    multiSelectCount > 1
      ? minimalSelectedRoots(selectedNoteIds, parents).filter(
          (id) => id !== workspaceRootId,
        )
      : [];

  const dropHintLabel = (() => {
    if (!dropHint) {
      return null;
    }
    const p = dropHint.placement;
    if (p === "before") {
      return "Insert above (sibling)";
    }
    if (p === "after") {
      return "Insert below (sibling)";
    }
    return "Nest inside (child)";
  })();

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
            {menu.anchorId ? (
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
                {multiSelectCount <= 1 && menu.anchorId !== workspaceRootId ? (
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
                      if (
                        !window.confirm(
                          `Delete ${n} note${n === 1 ? "" : "s"} and their subtrees?`,
                        )
                      ) {
                        return;
                      }
                      closeMenu();
                      void (async () => {
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
                {multiSelectCount <= 1 &&
                menu.anchorId !== workspaceRootId ? (
                  <button
                    type="button"
                    className={ctxBtn}
                    onClick={() => {
                      if (!menu.anchorId) {
                        return;
                      }
                      if (
                        !window.confirm(
                          "Delete this note and all notes under it?",
                        )
                      ) {
                        return;
                      }
                      const id = menu.anchorId;
                      closeMenu();
                      void (async () => {
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
                    {menu.anchorId !== workspaceRootId ? (
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
                    ) : null}
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
                {menu.anchorId !== workspaceRootId ? (
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
                ) : null}
              </>
            ) : (
              <>
                {clipboard && workspaceRootId ? (
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
                            targetId: workspaceRootId,
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
                  New note under workspace…
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
              {registeredTypes.length === 0 ? (
                <p className="px-2 py-1 text-[11px] text-muted-foreground">
                  No types loaded
                </p>
              ) : (
                registeredTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={ctxBtn}
                    onClick={async () => {
                      const rel = menu.pickRelation ?? "root";
                      const anchorId =
                        rel === "root" ? undefined : menu.anchorId ?? undefined;
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
              className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
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
          const id = visibleNotes[i]!.id;
          if (id !== workspaceRootId) {
            next.add(id);
          }
        }
        setSelectedNoteIds(next);
        void onNoteSelect(noteId);
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      if (noteId === workspaceRootId) {
        void onNoteSelect(noteId);
        return;
      }
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
    <aside className="flex h-full min-h-0 min-w-0 w-full flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground">
      {contextMenuPortal}
      {renamePortal}

      <header className="border-sidebar-border border-b px-3 py-3">
        <h1 className="text-[13px] font-semibold leading-tight text-sidebar-foreground">
          Nodex
        </h1>
        <p className="mt-1.5 text-sidebar-foreground/55 text-[11px] leading-snug">
          Programmable Knowledge System
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-1 flex items-center justify-between gap-2 px-1">
          <SectionLabel>Notes</SectionLabel>
          {selectedNoteIds.size > 1 ? (
            <button
              type="button"
              className="shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium text-sidebar-foreground/60 underline-offset-2 hover:text-sidebar-foreground hover:underline"
              onClick={() => setSelectedNoteIds(new Set())}
            >
              Clear ({selectedNoteIds.size})
            </button>
          ) : (
            <span className="w-px shrink-0" aria-hidden />
          )}
        </div>
        <div
          className="min-h-[120px] rounded-md transition-shadow duration-150"
          onContextMenu={(e) => {
            if ((e.target as HTMLElement).closest("[data-note-row]")) {
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
          {dropHintLabel ? (
            <p className="mb-1.5 rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary transition-colors duration-150 dark:bg-primary/15">
              {dropHintLabel}
            </p>
          ) : null}
          <ul className="flex flex-col gap-px" role="list">
            {visibleNotes.map((note) => {
              const primarySelected = currentNoteId === note.id;
              const inMulti = selectedNoteIds.has(note.id);
              const selected = primarySelected || inMulti;
              const pad = 6 + note.depth * 12;
              const isRoot = note.id === workspaceRootId;
              const hint =
                dropHint?.targetId === note.id ? dropHint.placement : null;
              const showChevron = hasChildrenMap.has(note.id);
              const collapsed = collapsedIds.has(note.id);
              const isDraggingRow = draggingId === note.id;
              const initials = noteTypeInitials(note.type);

              return (
                <li
                  key={note.id}
                  draggable={!isRoot}
                  onDragStart={(e) => {
                    if (isRoot) {
                      return;
                    }
                    const dragIds = idsToDragForRow(note.id);
                    if (dragIds.length === 0) {
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
                      setDropHint({ targetId: note.id, placement });
                    } else {
                      setDropHint(null);
                    }
                  }}
                  onDragLeave={() => {
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
                  {hint === "before" ? (
                    <div
                      className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-center justify-center"
                      aria-hidden
                    >
                      <div className="h-0.5 w-full rounded-full bg-primary shadow-[0_0_0_1px_hsl(var(--background))]" />
                      <span className="absolute right-1 rounded bg-primary px-1 py-px text-[9px] font-semibold text-primary-foreground">
                        Above
                      </span>
                    </div>
                  ) : null}
                  {hint === "after" ? (
                    <div
                      className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center"
                      aria-hidden
                    >
                      <div className="h-0.5 w-full rounded-full bg-primary shadow-[0_0_0_1px_hsl(var(--background))]" />
                      <span className="absolute right-1 rounded bg-primary px-1 py-px text-[9px] font-semibold text-primary-foreground">
                        Below
                      </span>
                    </div>
                  ) : null}
                  {hint === "into" ? (
                    <div
                      className="pointer-events-none absolute inset-1 z-10 rounded-md border-2 border-dashed border-primary/70 bg-primary/10 dark:bg-primary/20"
                      aria-hidden
                    >
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-primary/90 px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground">
                        Nest inside
                      </span>
                    </div>
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
                      className={`relative flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-r-md py-1 pr-2 text-left outline-none transition-colors duration-150 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--sidebar-background))] ${
                        selected
                          ? inMulti && !primarySelected
                            ? "bg-primary/15 text-sidebar-foreground ring-1 ring-inset ring-primary/35 hover:bg-primary/20"
                            : "bg-sidebar-accent text-sidebar-foreground before:pointer-events-none before:absolute before:left-1 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-primary before:content-[''] hover:bg-sidebar-accent"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/70"
                      } ${isRoot ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
                    >
                      {!isRoot && draggingBulkCount > 1 && draggingId === note.id ? (
                        <span className="absolute right-2 top-1/2 z-[5] -translate-y-1/2 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground shadow-sm">
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
                        {isRoot ? (
                          <span className="ml-1 text-[9px] font-normal text-sidebar-foreground/45">
                            (workspace)
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <p className="mt-2 px-1 text-[10px] leading-snug text-sidebar-foreground/40">
          Click: select · ⌘/Ctrl+click: multi · Shift+click: range · Drag: move
          (top/mid/bottom = sibling / child / sibling). Right-click for menu.
        </p>
        {clipboard ? (
          <p className="mt-1 px-1 text-[10px] text-sidebar-foreground/50">
            Clipboard: {clipboard.mode} — use right-click to paste.
          </p>
        ) : null}
      </div>

      <footer className="shrink-0 space-y-3 border-sidebar-border border-t px-3 py-3">
        <div>
          <p className="mb-2 text-[12px] font-semibold text-sidebar-foreground/80">
            Appearance
          </p>
          <SectionLabel>Mode</SectionLabel>
          <div
            className="flex rounded-sm border border-sidebar-border bg-muted/40 p-0.5 dark:bg-muted/20"
            role="group"
            aria-label="Color mode"
          >
            {(["light", "dark", "system"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setColorMode(m)}
                className={`min-w-0 flex-1 rounded-sm px-2 py-1.5 text-center text-[11px] font-medium capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1 focus-visible:ring-offset-[hsl(var(--sidebar-background))] ${
                  colorMode === m
                    ? "bg-background text-foreground shadow-sm dark:bg-sidebar-accent"
                    : "text-sidebar-foreground/55 hover:text-sidebar-foreground"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onPluginIdeOpen}
            aria-pressed={activeSidebarTool === "plugin-ide"}
            className={`${sidebarFooterBtnBase} ${
              activeSidebarTool === "plugin-ide"
                ? sidebarFooterBtnSelected
                : sidebarFooterBtnIdle
            }`}
          >
            Plugin IDE
          </button>
          <button
            type="button"
            onClick={onPluginManagerOpen}
            aria-pressed={activeSidebarTool === "plugin-manager"}
            className={`${sidebarFooterBtnBase} ${
              activeSidebarTool === "plugin-manager"
                ? sidebarFooterBtnSelected
                : sidebarFooterBtnIdle
            }`}
          >
            Manage Plugins
          </button>
        </div>

        <div className="text-sidebar-foreground/50 text-[11px] leading-relaxed">
          <p>Plugin-driven architecture</p>
          <p className="mt-1.5 text-sidebar-foreground/40">
            {notes.length} {notes.length === 1 ? "note" : "notes"}
          </p>
        </div>
      </footer>
    </aside>
  );
};

export default Sidebar;
