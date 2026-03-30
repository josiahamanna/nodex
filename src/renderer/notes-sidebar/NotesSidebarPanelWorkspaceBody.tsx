import React from "react";
import type { NoteListItem, NoteMovePlacement } from "../../preload";
import type { SidebarAssetsRow, SidebarWorkspaceSection } from "../../shared/sidebar-assets-rows";
import { noteTypeInitials } from "../utils/note-type-initials";
import ProjectAssetsInline from "../components/ProjectAssetsInline";
import WorkspaceMountHeaderSurface from "../components/WorkspaceMountHeaderSurface";
import NotesSidebarPanelWorkspaceToolbar from "./NotesSidebarPanelWorkspaceToolbar";
import {
  DND_NOTE_IDS_MIME,
  DND_NOTE_MIME,
  folderDisplayName,
  parseDragIds,
  WORKSPACE_MOUNT_ROW_RE,
  type ClipboardState,
  type ContextMenuState,
  type DropHint,
} from "./notes-sidebar-utils";

export interface NotesSidebarPanelWorkspaceBodyProps {
  notes: NoteListItem[];
  onRefreshWorkspace?: () => void;
  onAddWorkspaceFolder?: () => void;
  selectedNoteIds: Set<string>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>;
  workspaceSections: SidebarWorkspaceSection[];
  workspaceSectionExpanded: Record<string, boolean>;
  toggleWorkspaceSection: (sectionKey: string) => void;
  assetFsTick: number;
  onOpenProjectAsset: (projectRoot: string, relativePath: string) => void;
  currentNoteId?: string;
  collapsedIds: Set<string>;
  draggingId: string | null;
  draggingBulkCount: number;
  dropHint: DropHint | null;
  setDropHint: React.Dispatch<React.SetStateAction<DropHint | null>>;
  hasChildrenMap: Set<string>;
  draggingRef: React.MutableRefObject<string | null>;
  draggingIdsRef: React.MutableRefObject<string[]>;
  setDraggingId: React.Dispatch<React.SetStateAction<string | null>>;
  setDraggingBulkCount: React.Dispatch<React.SetStateAction<number>>;
  placementFromPointer: (e: React.DragEvent, el: HTMLElement) => NoteMovePlacement;
  dropAllowedOne: (
    draggedId: string,
    targetId: string,
    placement: NoteMovePlacement,
  ) => boolean;
  dropAllowedMany: (
    draggedIds: string[],
    targetId: string,
    placement: NoteMovePlacement,
  ) => boolean;
  idsToDragForRow: (noteId: string) => string[];
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
  handleRowClick: (
    noteId: string,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => void;
  onNoteSelect: (noteId: string) => void;
  getTypeBadgeClass: (type: string) => string;
  toggleCollapsed: (id: string) => void;
  padForSectionNote: (note: NoteListItem, depthTrim: number) => number;
  clipboard: ClipboardState;
}

const NotesSidebarPanelWorkspaceBody: React.FC<NotesSidebarPanelWorkspaceBodyProps> = ({
  notes,
  onRefreshWorkspace,
  onAddWorkspaceFolder,
  selectedNoteIds,
  setSelectedNoteIds,
  setMenu,
  workspaceSections,
  workspaceSectionExpanded,
  toggleWorkspaceSection,
  assetFsTick,
  onOpenProjectAsset,
  currentNoteId,
  collapsedIds,
  draggingId,
  draggingBulkCount,
  dropHint,
  setDropHint,
  hasChildrenMap,
  draggingRef,
  draggingIdsRef,
  setDraggingId,
  setDraggingBulkCount,
  placementFromPointer,
  dropAllowedOne,
  dropAllowedMany,
  idsToDragForRow,
  onMoveNote,
  onMoveNotesBulk,
  handleRowClick,
  onNoteSelect,
  getTypeBadgeClass,
  toggleCollapsed,
  padForSectionNote,
  clipboard,
}) => {
  const assetsDepthInSection = (row: SidebarAssetsRow, depthTrim: number) =>
    Math.max(0, row.depth - depthTrim);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      <NotesSidebarPanelWorkspaceToolbar
        onRefreshWorkspace={onRefreshWorkspace}
        onAddWorkspaceFolder={onAddWorkspaceFolder}
        selectedNoteIds={selectedNoteIds}
        setSelectedNoteIds={setSelectedNoteIds}
      />
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
        Collapse projects and notes with chevrons. Assets under{" "}
        <span className="font-mono">assets/</span>. Undo/redo ⌘/Ctrl+Z ·
        ⌘/Ctrl+Shift+Z. Right-click for menu.
        {clipboard ? (
          <span className="mt-1 block text-sidebar-foreground/50">
            Clipboard: {clipboard.mode} — right-click to paste.
          </span>
        ) : null}
        <span className="mt-1 block">
          {notes.length} {notes.length === 1 ? "note" : "notes"}
        </span>
      </p>
    </div>
  );
};

export default NotesSidebarPanelWorkspaceBody;
