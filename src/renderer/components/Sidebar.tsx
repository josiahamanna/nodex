import React from "react";
import { NoteListItem } from "../../preload";
import { useTheme } from "../theme/ThemeContext";

type SidebarActiveTool = "plugin-ide" | "plugin-manager" | null;

interface SidebarProps {
  notes: NoteListItem[];
  currentNoteId?: string;
  /** Which footer tool panel is open in the main area (notes view = null). */
  activeSidebarTool?: SidebarActiveTool;
  onNoteSelect: (noteId: string) => void;
  onPluginManagerOpen: () => void;
  onPluginIdeOpen: () => void;
}

const sidebarFooterBtnBase =
  "flex min-h-8 w-full items-center justify-center rounded-sm border px-3 py-2 text-center text-[12px] font-medium transition-colors";
const sidebarFooterBtnIdle =
  "border-sidebar-border bg-background text-foreground hover:bg-muted/50 dark:bg-transparent dark:hover:bg-sidebar-accent/40";
/** Strong VS Code–style active row: tinted fill + thick inset primary bar */
const sidebarFooterBtnSelected =
  "border-sidebar-border bg-primary/[0.14] font-semibold text-foreground shadow-[inset_4px_0_0_0_hsl(var(--primary))] dark:bg-primary/[0.22]";

/** VS Code–style section label */
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/45">
    {children}
  </p>
);

const Sidebar: React.FC<SidebarProps> = ({
  notes,
  currentNoteId,
  activeSidebarTool = null,
  onNoteSelect,
  onPluginManagerOpen,
  onPluginIdeOpen,
}) => {
  const { colorMode, setColorMode } = useTheme();

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

  return (
    <aside className="flex h-full min-h-0 min-w-0 w-full flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground">
      <header className="border-sidebar-border border-b px-4 py-3">
        <h1 className="text-[13px] font-semibold leading-tight text-sidebar-foreground">
          Nodex
        </h1>
        <p className="mt-1.5 text-sidebar-foreground/55 text-[11px] leading-snug">
          Programmable Knowledge System
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <SectionLabel>Notes</SectionLabel>
        <ul className="flex flex-col gap-px" role="list">
          {notes.map((note) => {
            const selected = currentNoteId === note.id;
            return (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => onNoteSelect(note.id)}
                  className={`w-full rounded-sm border border-transparent py-2 pl-3 pr-3 text-left transition-colors ${
                    selected
                      ? "bg-primary/[0.12] font-medium text-sidebar-foreground shadow-[inset_4px_0_0_0_hsl(var(--primary))] dark:bg-primary/[0.18]"
                      : "hover:bg-sidebar-accent/60"
                  }`}
                >
                  <span className="line-clamp-2 text-[13px] font-normal leading-snug">
                    {note.title}
                  </span>
                  <span
                    className={`mt-1.5 inline-flex rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-normal leading-none ${getTypeBadgeClass(note.type)}`}
                  >
                    {note.type}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <footer className="shrink-0 space-y-4 border-sidebar-border border-t px-4 py-4">
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
                className={`min-w-0 flex-1 rounded-sm px-2 py-1.5 text-center text-[11px] font-medium capitalize transition-colors ${
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
