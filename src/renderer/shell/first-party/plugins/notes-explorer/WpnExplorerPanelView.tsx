import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import type {
  CreateNoteRelation,
  NoteMovePlacement,
} from "@nodex/ui-types";
import type { WpnNoteListItem, WpnProjectRow, WpnWorkspaceRow } from "../../../../../shared/wpn-v2-types";
import type { RootState } from "../../../../store";
import { useShellNavigation } from "../../../useShellNavigation";
import { useShellProjectWorkspace } from "../../../useShellProjectWorkspace";
import type { ShellViewComponentProps } from "../../../views/ShellViewRegistry";

const WPN_COLOR_TOKENS = [
  "c01",
  "c02",
  "c03",
  "c04",
  "c05",
  "c06",
  "c07",
  "c08",
  "c09",
  "c10",
  "c11",
  "c12",
];

const DND_NOTE_MIME = "application/nodex-wpn-note";

export function WpnExplorerPanelView(_props: ShellViewComponentProps): React.ReactElement {
  const { openNoteById } = useShellNavigation();
  const { workspaceRoots } = useShellProjectWorkspace();
  const currentNoteId = useSelector((s: RootState) => s.notes.currentNote?.id);

  const [workspaces, setWorkspaces] = useState<WpnWorkspaceRow[]>([]);
  const [projectsByWs, setProjectsByWs] = useState<Record<string, WpnProjectRow[]>>({});
  const [expandedWs, setExpandedWs] = useState<Set<string>>(() => new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set());
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [notes, setNotes] = useState<WpnNoteListItem[]>([]);
  const [expandedNoteParents, setExpandedNoteParents] = useState<Set<string>>(() => new Set());
  const [selectableTypes, setSelectableTypes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    kind: "ws" | "project" | "note" | "no_project" | "panel_empty";
    id: string;
    workspaceId?: string;
    projectId?: string;
  } | null>(null);

  const projectOpen = workspaceRoots.length > 0;

  const loadWorkspaces = useCallback(async () => {
    if (!projectOpen) return;
    setBusy(true);
    try {
      const { workspaces: ws } = await window.Nodex.wpnListWorkspaces();
      setWorkspaces(ws);
      const nextProj: Record<string, WpnProjectRow[]> = {};
      for (const w of ws) {
        const { projects } = await window.Nodex.wpnListProjects(w.id);
        nextProj[w.id] = projects;
      }
      setProjectsByWs(nextProj);
      setExpandedWs(new Set(ws.map((w) => w.id)));
    } finally {
      setBusy(false);
    }
  }, [projectOpen]);

  useEffect(() => {
    void window.Nodex.getSelectableNoteTypes().then((t) => {
      setSelectableTypes(Array.isArray(t) ? t : []);
    });
  }, []);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  const loadProjectTree = useCallback(async (projectId: string) => {
    const [{ notes: n }, { expanded_ids }] = await Promise.all([
      window.Nodex.wpnListNotes(projectId),
      window.Nodex.wpnGetExplorerState(projectId),
    ]);
    setNotes(n);
    setExpandedNoteParents(new Set(expanded_ids));
    setSelectedProjectId(projectId);
  }, []);

  useEffect(() => {
    if (!selectedProjectId || !projectOpen) return;
    void loadProjectTree(selectedProjectId);
  }, [selectedProjectId, projectOpen, loadProjectTree]);

  const persistExpandedNotes = useCallback(
    async (projectId: string, next: Set<string>) => {
      setExpandedNoteParents(next);
      await window.Nodex.wpnSetExplorerState(projectId, [...next]);
    },
    [],
  );

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.type.toLowerCase().includes(q));
  }, [notes, search]);

  const noteHasVisibleChildren = useCallback(
    (id: string) => filteredNotes.some((n) => n.parent_id === id),
    [filteredNotes],
  );

  const onCreateWorkspace = async () => {
    await window.Nodex.wpnCreateWorkspace("Workspace");
    await loadWorkspaces();
    setMenu(null);
  };

  const openProjectFolder = useCallback(async () => {
    setMenu(null);
    await window.Nodex.selectProjectFolder();
  }, []);

  const onCreateProject = async (workspaceId: string) => {
    await window.Nodex.wpnCreateProject(workspaceId, "Project");
    await loadWorkspaces();
  };

  const onDeleteWorkspace = async (id: string) => {
    if (!window.confirm("Delete this workspace and all projects and notes inside it?")) return;
    await window.Nodex.wpnDeleteWorkspace(id);
    if (selectedProjectId) {
      const projs = projectsByWs[id] ?? [];
      if (projs.some((p) => p.id === selectedProjectId)) {
        setSelectedProjectId(null);
        setNotes([]);
      }
    }
    await loadWorkspaces();
    setMenu(null);
  };

  const onDeleteProject = async (id: string) => {
    if (!window.confirm("Delete this project and all its notes?")) return;
    await window.Nodex.wpnDeleteProject(id);
    if (selectedProjectId === id) {
      setSelectedProjectId(null);
      setNotes([]);
    }
    await loadWorkspaces();
    setMenu(null);
  };

  const onSetColor = async (
    kind: "ws" | "project",
    id: string,
    token: string | null,
    workspaceId?: string,
  ) => {
    if (kind === "ws") {
      await window.Nodex.wpnUpdateWorkspace(id, { color_token: token });
    } else {
      await window.Nodex.wpnUpdateProject(id, { color_token: token });
    }
    await loadWorkspaces();
    if (workspaceId && selectedProjectId) {
      const p = (projectsByWs[workspaceId] ?? []).find((x) => x.id === selectedProjectId);
      if (p) void loadProjectTree(selectedProjectId);
    }
    setMenu(null);
  };

  const onCreateNote = async (
    projectId: string,
    relation: CreateNoteRelation,
    type: string,
    anchorId?: string,
  ) => {
    await window.Nodex.wpnCreateNoteInProject(projectId, {
      relation,
      type,
      anchorId,
    });
    await loadProjectTree(projectId);
    setMenu(null);
  };

  const onDeleteNotes = async (projectId: string, ids: string[]) => {
    if (!window.confirm(`Delete ${ids.length} note(s)?`)) return;
    await window.Nodex.wpnDeleteNotes(ids);
    await loadProjectTree(projectId);
    setMenu(null);
  };

  const onDragStartNote = (e: React.DragEvent, projectId: string, noteId: string) => {
    e.dataTransfer.setData(DND_NOTE_MIME, JSON.stringify({ projectId, noteId }));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDropOnNote = async (
    e: React.DragEvent,
    projectId: string,
    targetId: string,
  ) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData(DND_NOTE_MIME);
    if (!raw) return;
    let parsed: { projectId: string; noteId: string };
    try {
      parsed = JSON.parse(raw) as { projectId: string; noteId: string };
    } catch {
      return;
    }
    if (parsed.projectId !== projectId || parsed.noteId === targetId) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const placement: NoteMovePlacement = e.clientY < mid ? "before" : "after";
    await window.Nodex.wpnMoveNote({
      projectId,
      draggedId: parsed.noteId,
      targetId,
      placement,
    });
    await loadProjectTree(projectId);
  };

  const renderNoteRows = (projectId: string) => {
    const rows: React.ReactNode[] = [];
    for (const n of filteredNotes) {
      if (n.depth > 0 && n.parent_id && !expandedNoteParents.has(n.parent_id)) {
        continue;
      }
      const hasKids = noteHasVisibleChildren(n.id);
      const pad = 10 + n.depth * 12;
      rows.push(
        <div
          key={n.id}
          className={`group flex min-h-7 items-center gap-0.5 border-b border-border/30 text-[11px] ${
            currentNoteId === n.id ? "bg-muted/50" : "hover:bg-muted/25"
          }`}
          style={{ paddingLeft: pad }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => void onDropOnNote(e, projectId, n.id)}
        >
          <span
            className="w-4 shrink-0 cursor-grab text-muted-foreground opacity-60"
            draggable
            onDragStart={(e) => onDragStartNote(e, projectId, n.id)}
            title="Drag to move among siblings"
          >
            ⣿
          </span>
          {hasKids ? (
            <button
              type="button"
              className="w-4 shrink-0 text-[10px] text-muted-foreground"
              onClick={() => {
                const next = new Set(expandedNoteParents);
                if (next.has(n.id)) next.delete(n.id);
                else next.add(n.id);
                void persistExpandedNotes(projectId, next);
              }}
            >
              {expandedNoteParents.has(n.id) ? "▼" : "▶"}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left"
            onClick={() => openNoteById(n.id)}
          >
            <span className="text-muted-foreground">[{n.type}]</span> {n.title}
          </button>
          <button
            type="button"
            className="opacity-0 group-hover:opacity-100 px-1 text-muted-foreground"
            onClick={(e) =>
              setMenu({
                x: e.clientX,
                y: e.clientY,
                kind: "note",
                id: n.id,
                projectId,
              })
            }
          >
            ⋯
          </button>
        </div>,
      );
    }
    return rows;
  };

  if (!projectOpen) {
    return (
      <div
        className="relative flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
        onClick={() => setMenu(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, kind: "no_project", id: "" });
        }}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-[12px] text-muted-foreground">
          <p className="font-medium text-foreground">No project open.</p>
          <p className="max-w-[14rem] text-[11px] leading-relaxed">
            Open a project folder to use the workspace → project → notes explorer.
          </p>
          <button
            type="button"
            className="rounded border border-border bg-muted/20 px-3 py-1.5 text-[11px] text-foreground hover:bg-muted/40"
            onClick={(e) => {
              e.stopPropagation();
              void openProjectFolder();
            }}
          >
            Open project folder…
          </button>
          <p className="text-[10px] opacity-70">Or right-click in this panel for the same action.</p>
        </div>
        {menu?.kind === "no_project" ? (
          <div
            className="fixed z-50 min-w-[10rem] rounded-md border border-border bg-popover p-1 text-[11px] shadow-md"
            style={{ left: menu.x, top: menu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
              onClick={() => void openProjectFolder()}
            >
              Open project folder…
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 min-w-0 w-full flex-col bg-sidebar text-sidebar-foreground"
      onClick={() => setMenu(null)}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-muted/10 px-2 py-1">
        <button
          type="button"
          className="rounded border border-border/60 px-2 py-0.5 text-[10px] hover:bg-muted/40"
          onClick={() => void loadWorkspaces()}
          disabled={busy}
        >
          Refresh
        </button>
        <button
          type="button"
          className="rounded border border-border/60 px-2 py-0.5 text-[10px] hover:bg-muted/40"
          onClick={() => void onCreateWorkspace()}
        >
          + Workspace
        </button>
        <input
          className="min-w-[6rem] flex-1 rounded border border-border/60 bg-background px-2 py-0.5 text-[10px]"
          placeholder="Search notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto text-[11px]"
        onContextMenu={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest("button,select,input,option,a,[draggable=true]")) return;
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, kind: "panel_empty", id: "" });
        }}
      >
        {workspaces.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            No workspaces yet. Use <strong>+ Workspace</strong> or right-click in this panel.
          </div>
        ) : (
          workspaces.map((w) => (
            <div key={w.id} className="border-b border-border/40">
              <div className="flex items-center gap-1 bg-muted/15 px-1 py-0.5">
                <button
                  type="button"
                  className="w-5 text-[10px] text-muted-foreground"
                  onClick={() => {
                    const n = new Set(expandedWs);
                    if (n.has(w.id)) n.delete(w.id);
                    else n.add(w.id);
                    setExpandedWs(n);
                  }}
                >
                  {expandedWs.has(w.id) ? "▼" : "▶"}
                </button>
                <span className="flex-1 truncate font-medium">{w.name}</span>
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground"
                  onClick={() => void onCreateProject(w.id)}
                >
                  + Project
                </button>
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground"
                  onClick={(e) =>
                    setMenu({ x: e.clientX, y: e.clientY, kind: "ws", id: w.id })
                  }
                >
                  ⋯
                </button>
              </div>
              {expandedWs.has(w.id) ? (
                <div className="pl-2">
                  {(projectsByWs[w.id] ?? []).map((p) => (
                    <div key={p.id}>
                      <div className="flex items-center gap-1 py-0.5">
                        <button
                          type="button"
                          className="w-5 text-[10px] text-muted-foreground"
                          onClick={() => {
                            const n = new Set(expandedProjects);
                            if (n.has(p.id)) n.delete(p.id);
                            else n.add(p.id);
                            setExpandedProjects(n);
                          }}
                        >
                          {expandedProjects.has(p.id) ? "▼" : "▶"}
                        </button>
                        <button
                          type="button"
                          className={`flex-1 truncate text-left ${
                            selectedProjectId === p.id ? "font-semibold text-foreground" : ""
                          }`}
                          onClick={() => void loadProjectTree(p.id)}
                        >
                          {p.name}
                        </button>
                        <button
                          type="button"
                          className="text-[10px] text-muted-foreground"
                          onClick={(e) =>
                            setMenu({
                              x: e.clientX,
                              y: e.clientY,
                              kind: "project",
                              id: p.id,
                              workspaceId: w.id,
                            })
                          }
                        >
                          ⋯
                        </button>
                      </div>
                      {expandedProjects.has(p.id) && selectedProjectId === p.id ? (
                        <div className="border-l border-border/40 pl-1">
                          <div className="flex gap-1 py-1 pl-6">
                            <select
                              className="max-w-[7rem] rounded border border-border/60 bg-background text-[10px]"
                              defaultValue=""
                              onChange={(e) => {
                                const t = e.target.value;
                                e.target.value = "";
                                if (t) void onCreateNote(p.id, "root", t);
                              }}
                            >
                              <option value="">+ Root note…</option>
                              {selectableTypes.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </div>
                          {renderNoteRows(p.id)}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {menu ? (
        <div
          className="fixed z-50 min-w-[10rem] rounded-md border border-border bg-popover p-1 text-[11px] shadow-md"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.kind === "ws" ? (
            <>
              <div className="px-2 py-1 text-[10px] text-muted-foreground">Workspace color</div>
              <div className="flex flex-wrap gap-1 px-1 pb-1">
                <button
                  type="button"
                  className="rounded border px-1 text-[10px]"
                  onClick={() => void onSetColor("ws", menu.id, null)}
                >
                  Clear
                </button>
                {WPN_COLOR_TOKENS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="h-5 w-5 rounded border text-[8px]"
                    title={c}
                    onClick={() => void onSetColor("ws", menu.id, c)}
                  >
                    {c.slice(1)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-destructive/15"
                onClick={() => void onDeleteWorkspace(menu.id)}
              >
                Delete workspace
              </button>
            </>
          ) : null}
          {menu.kind === "project" && menu.workspaceId ? (
            <>
              <div className="px-2 py-1 text-[10px] text-muted-foreground">Project color</div>
              <div className="flex flex-wrap gap-1 px-1 pb-1">
                <button
                  type="button"
                  className="rounded border px-1 text-[10px]"
                  onClick={() =>
                    void onSetColor("project", menu.id, null, menu.workspaceId)
                  }
                >
                  Clear
                </button>
                {WPN_COLOR_TOKENS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="h-5 w-5 rounded border text-[8px]"
                    title={c}
                    onClick={() =>
                      void onSetColor("project", menu.id, c, menu.workspaceId)
                    }
                  >
                    {c.slice(1)}
                  </button>
                ))}
              </div>
              <div className="px-2 py-1 text-[10px] text-muted-foreground">Move to workspace</div>
              <select
                className="mb-1 w-full rounded border border-border/60 bg-background text-[10px]"
                defaultValue=""
                onChange={async (e) => {
                  const wid = e.target.value;
                  e.target.value = "";
                  if (!wid || wid === menu.workspaceId) return;
                  await window.Nodex.wpnUpdateProject(menu.id, { workspace_id: wid });
                  await loadWorkspaces();
                  setMenu(null);
                }}
              >
                <option value="">Choose…</option>
                {workspaces
                  .filter((w) => w.id !== menu.workspaceId)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-destructive/15"
                onClick={() => void onDeleteProject(menu.id)}
              >
                Delete project
              </button>
            </>
          ) : null}
          {menu.kind === "panel_empty" ? (
            <>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => void onCreateWorkspace()}
              >
                New workspace
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => void loadWorkspaces()}
                disabled={busy}
              >
                Refresh
              </button>
            </>
          ) : null}
          {menu.kind === "note" && menu.projectId ? (
            <>
              <div className="px-2 py-1 text-[10px] text-muted-foreground">New note</div>
              {(["child", "sibling"] as const).map((rel) => (
                <div key={rel} className="px-1 py-0.5">
                  <div className="text-[9px] uppercase text-muted-foreground">{rel}</div>
                  <select
                    className="w-full rounded border border-border/60 bg-background text-[10px]"
                    defaultValue=""
                    onChange={(e) => {
                      const t = e.target.value;
                      e.target.value = "";
                      if (t) void onCreateNote(menu.projectId!, rel, t, menu.id);
                    }}
                  >
                    <option value="">Type…</option>
                    {selectableTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <button
                type="button"
                className="mt-1 block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => openNoteById(menu.id)}
              >
                Open note
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-destructive/15"
                onClick={() => void onDeleteNotes(menu.projectId!, [menu.id])}
              >
                Delete note
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
