import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CreateNoteRelation,
  NoteListItem,
} from "../../preload";
import { useTheme } from "../theme/ThemeContext";

type SidebarActiveTool = "plugin-ide" | "plugin-manager" | null;

type ContextMenuState = {
  x: number;
  y: number;
  anchorId: string | null;
  step: "main" | "pickType";
  pickRelation?: CreateNoteRelation;
};

interface SidebarProps {
  notes: NoteListItem[];
  registeredTypes: string[];
  currentNoteId?: string;
  /** Which footer tool panel is open in the main area (notes view = null). */
  activeSidebarTool?: SidebarActiveTool;
  onNoteSelect: (noteId: string) => void;
  onCreateNote: (payload: {
    anchorId?: string;
    relation: CreateNoteRelation;
    type: string;
  }) => Promise<void>;
  onRenameNote: (id: string, title: string) => Promise<void>;
  onPluginManagerOpen: () => void;
  onPluginIdeOpen: () => void;
}

const sidebarFooterBtnBase =
  "flex min-h-9 w-full items-center justify-center rounded-sm border px-3 py-2.5 text-center text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--sidebar-background))]";
const sidebarFooterBtnIdle =
  "border-sidebar-border bg-background text-foreground hover:bg-muted/50 dark:bg-transparent dark:hover:bg-sidebar-accent/40";
/** Active tool: matches note row — accent + primary pill bar */
const sidebarFooterBtnSelected =
  "relative border-sidebar-border bg-sidebar-accent font-semibold text-foreground before:pointer-events-none before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:bg-primary before:content-['']";

/** VS Code–style section label */
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/45">
    {children}
  </p>
);

const ctxBtn =
  "block w-full rounded-sm px-2.5 py-1.5 text-left text-[12px] text-popover-foreground outline-none hover:bg-accent hover:text-accent-foreground";

const Sidebar: React.FC<SidebarProps> = ({
  notes,
  registeredTypes,
  currentNoteId,
  activeSidebarTool = null,
  onNoteSelect,
  onCreateNote,
  onRenameNote,
  onPluginManagerOpen,
  onPluginIdeOpen,
}) => {
  const { colorMode, setColorMode } = useTheme();
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setMenu(null), []);

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

  const contextMenuPortal =
    menu &&
    createPortal(
      <div
        ref={menuRef}
        className="fixed z-[100] min-w-[200px] rounded-md border border-border bg-popover py-1 shadow-md"
        style={{ left: menu.x, top: menu.y }}
        role="menu"
      >
        {menu.step === "main" ? (
          <>
            {menu.anchorId ? (
              <>
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
                New root note…
              </button>
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
                        /* Error surfaced via app state */
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
        <SectionLabel>Notes</SectionLabel>
        <div
          className="min-h-[120px] rounded-md"
          onContextMenu={(e) => {
            if ((e.target as HTMLElement).closest("[data-note-row]")) {
              return;
            }
            e.preventDefault();
            setMenu({
              x: e.clientX,
              y: e.clientY,
              anchorId: null,
              step: "main",
            });
          }}
        >
          <ul className="flex flex-col gap-px" role="list">
            {notes.map((note) => {
              const selected = currentNoteId === note.id;
              const pad = 10 + note.depth * 14;
              return (
                <li key={note.id}>
                  <button
                    type="button"
                    data-note-row
                    onClick={() => onNoteSelect(note.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenu({
                        x: e.clientX,
                        y: e.clientY,
                        anchorId: note.id,
                        step: "main",
                      });
                    }}
                    style={{ paddingLeft: pad }}
                    className={`relative flex w-full flex-col items-stretch gap-1.5 rounded-md py-2 pr-3 text-left outline-none transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--sidebar-background))] ${
                      selected
                        ? "bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent before:pointer-events-none before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:bg-primary before:content-['']"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/70"
                    }`}
                  >
                    <span
                      className={`line-clamp-2 text-[13px] leading-snug ${
                        selected ? "font-medium" : "font-normal"
                      }`}
                    >
                      {note.title}
                    </span>
                    <span
                      className={`inline-flex w-fit max-w-full shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none ring-1 ring-inset ring-foreground/10 dark:ring-white/15 ${getTypeBadgeClass(note.type)}`}
                    >
                      {note.type}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <p className="mt-2 px-1 text-[10px] leading-snug text-sidebar-foreground/40">
          Right-click a note for child, sibling, or rename. Right-click empty
          area for a new root note.
        </p>
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
