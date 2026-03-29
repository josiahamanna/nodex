import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { AppDispatch, RootState, store } from "./store";
import {
  createNote,
  deleteNotesInTree,
  fetchNote,
  fetchAllNotes,
  moveNoteInTree,
  moveNotesBulkInTree,
  pasteSubtree,
  renameNote,
} from "./store/notesSlice";
import NotesSidebarPanel from "./components/NotesSidebarPanel";
import NoteViewer from "./components/NoteViewer";
import AssetPreview from "./components/AssetPreview";
import PluginManager from "./components/PluginManager";
import PluginIDE from "./components/PluginIDE";
import SettingsView, {
  type SettingsCategory,
} from "./components/SettingsView";
import PrimarySidebarShell, {
  readStoredPrimaryTab,
  writeStoredPrimaryTab,
  type PrimaryTab,
} from "./components/shell/PrimarySidebarShell";
import EditorTabSidebar from "./components/shell/EditorTabSidebar";
import PluginsSidebarList, {
  type PluginsSidebarSelection,
} from "./components/shell/PluginsSidebarList";
import PluginPanelGeneral from "./components/PluginPanelGeneral";
import { MainDebugDockProvider } from "./debug/MainDebugDockContext";
import type {
  CreateNoteRelation,
  NoteMovePlacement,
  PasteSubtreePayload,
} from "../preload";
import { workspaceFolderPathForNote } from "../shared/note-workspace";

const SHELL_SIDEBAR_COLLAPSED_KEY = "nodex-primary-sidebar-collapsed";
const LEFT_EXPANDED_PCT = 22;
const LEFT_COLLAPSED_PCT = 3.2;

type NotesMainPane =
  | { kind: "note" }
  | { kind: "asset"; relativePath: string; projectRoot: string };

function readShellSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SHELL_SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeShellSidebarCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) {
      localStorage.setItem(SHELL_SIDEBAR_COLLAPSED_KEY, "1");
    } else {
      localStorage.removeItem(SHELL_SIDEBAR_COLLAPSED_KEY);
    }
  } catch {
    /* ignore */
  }
}

const App: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { currentNote, notesList, detailLoading, listLoading } = useSelector(
    (state: RootState) => state.notes,
  );
  const listSyncAttemptedFor = useRef<string | null>(null);
  const [primaryTab, setPrimaryTabState] = useState<PrimaryTab>(
    readStoredPrimaryTab,
  );
  const [settingsCategory, setSettingsCategory] =
    useState<SettingsCategory>("appearance");
  const [pluginsShell, setPluginsShell] = useState<PluginsSidebarSelection>({
    kind: "general",
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    readShellSidebarCollapsed,
  );
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const [projectRoot, setProjectRoot] = useState<string | null | undefined>(
    undefined,
  );
  const [workspaceRoots, setWorkspaceRoots] = useState<string[]>([]);
  const [assetFsTick, setAssetFsTick] = useState(0);
  const [notesMainPane, setNotesMainPane] = useState<NotesMainPane>({
    kind: "note",
  });

  const rootsList = useMemo(() => {
    if (workspaceRoots.length > 0) {
      return workspaceRoots;
    }
    return projectRoot ? [projectRoot] : [];
  }, [workspaceRoots, projectRoot]);

  const assetsContextRoot = useMemo(() => {
    if (!projectRoot || rootsList.length === 0) {
      return null;
    }
    if (currentNote?.id) {
      const p = workspaceFolderPathForNote(currentNote.id, rootsList);
      if (p) {
        return p;
      }
    }
    return rootsList[0] ?? null;
  }, [currentNote?.id, rootsList, projectRoot]);

  useEffect(() => {
    setNotesMainPane((p) => (p.kind === "asset" ? { kind: "note" } : p));
  }, [assetsContextRoot]);

  const setPrimaryTab = (t: PrimaryTab) => {
    setPrimaryTabState(t);
    writeStoredPrimaryTab(t);
  };

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      const p = leftPanelRef.current;
      if (!p) {
        return;
      }
      if (sidebarCollapsed) {
        p.resize(LEFT_COLLAPSED_PCT);
      } else {
        p.resize(LEFT_EXPANDED_PCT);
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [sidebarCollapsed]);

  const onToggleSidebarCollapsed = () => {
    setSidebarCollapsed((c) => {
      const next = !c;
      writeShellSidebarCollapsed(next);
      return next;
    });
  };

  useEffect(() => {
    void window.Nodex.getProjectState().then((s) => {
      setProjectRoot(s.rootPath);
      setWorkspaceRoots(s.workspaceRoots ?? []);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await dispatch(fetchAllNotes()).unwrap();
        if (!cancelled) {
          await dispatch(fetchNote()).unwrap();
        }
      } catch {
        /* errors land in notes.error */
      }
    })();

    const unsubscribe = window.Nodex.onPluginsChanged(() => {
      void (async () => {
        try {
          await dispatch(fetchAllNotes()).unwrap();
          await dispatch(fetchNote()).unwrap();
        } catch {
          /* errors land in notes.error */
        }
      })();
    });

    const unsubProject = window.Nodex.onProjectRootChanged(() => {
      void window.Nodex.getProjectState().then((s) => {
        setProjectRoot(s.rootPath);
        setWorkspaceRoots(s.workspaceRoots ?? []);
        setNotesMainPane({ kind: "note" });
      });
      void (async () => {
        try {
          await dispatch(fetchAllNotes()).unwrap();
          await dispatch(fetchNote()).unwrap();
        } catch {
          /* errors land in notes.error */
        }
      })();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      unsubProject();
    };
  }, [dispatch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (primaryTab !== "notes") {
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") {
        return;
      }
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable=true]")) {
        return;
      }
      e.preventDefault();
      void (async () => {
        try {
          const r = e.shiftKey
            ? await window.Nodex.nodexRedo()
            : await window.Nodex.nodexUndo();
          if (!r.ok) {
            return;
          }
          setAssetFsTick((t) => t + 1);
          await dispatch(fetchAllNotes()).unwrap();
          await dispatch(fetchNote()).unwrap();
        } catch {
          /* errors land in notes.error */
        }
      })();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [primaryTab, dispatch]);

  useEffect(() => {
    const id = currentNote?.id;
    if (!id) {
      listSyncAttemptedFor.current = null;
      return;
    }
    if (notesList.some((n) => n.id === id)) {
      listSyncAttemptedFor.current = null;
      return;
    }
    if (listLoading || listSyncAttemptedFor.current === id) {
      return;
    }
    listSyncAttemptedFor.current = id;
    void dispatch(fetchAllNotes());
  }, [currentNote?.id, notesList, listLoading, dispatch]);

  const [registeredTypes, setRegisteredTypes] = useState<string[]>([]);
  useEffect(() => {
    void window.Nodex.getRegisteredTypes().then(setRegisteredTypes);
    const u = window.Nodex.onPluginsChanged(() => {
      void window.Nodex.getRegisteredTypes().then(setRegisteredTypes);
    });
    return u;
  }, []);

  const handleAddWorkspaceFolder = async () => {
    const r = await window.Nodex.addWorkspaceFolder();
    if (r.ok) {
      setProjectRoot(r.rootPath ?? null);
      setWorkspaceRoots(r.workspaceRoots ?? []);
      try {
        await dispatch(fetchAllNotes()).unwrap();
        await dispatch(fetchNote()).unwrap();
      } catch {
        /* errors land in notes.error */
      }
    }
  };

  const handleOpenProjectFolder = async () => {
    const r = await window.Nodex.selectProjectFolder();
    if (r.ok) {
      setProjectRoot(r.rootPath ?? null);
      setWorkspaceRoots(r.workspaceRoots ?? []);
      setNotesMainPane({ kind: "note" });
      try {
        await dispatch(fetchAllNotes()).unwrap();
        await dispatch(fetchNote()).unwrap();
      } catch {
        /* errors land in notes.error */
      }
    }
  };

  const handleRefreshWorkspace = async () => {
    const r = await window.Nodex.refreshWorkspace();
    if (r.ok) {
      setProjectRoot(r.rootPath ?? null);
      setWorkspaceRoots(r.workspaceRoots ?? []);
      try {
        await dispatch(fetchAllNotes()).unwrap();
        await dispatch(fetchNote()).unwrap();
      } catch {
        /* errors land in notes.error */
      }
    }
  };

  const handleRevealProjectFolder = async (noteId: string) => {
    const folder = workspaceFolderPathForNote(noteId, rootsList);
    if (!folder) {
      return;
    }
    await window.Nodex.revealProjectFolderInExplorer(folder);
  };

  const handleNoteSelect = (noteId: string) => {
    setNotesMainPane({ kind: "note" });
    void (async () => {
      try {
        await dispatch(fetchAllNotes()).unwrap();
        await dispatch(fetchNote(noteId)).unwrap();
      } catch {
        /* errors land in notes.error */
      }
    })();
  };

  const handlePluginsChanged = () => {
    void (async () => {
      try {
        await dispatch(fetchAllNotes()).unwrap();
        await dispatch(fetchNote()).unwrap();
      } catch {
        /* errors land in notes.error */
      }
    })();
    void window.Nodex.getRegisteredTypes().then(setRegisteredTypes);
  };

  const handleCreateNote = async (payload: {
    anchorId?: string;
    relation: CreateNoteRelation;
    type: string;
  }) => {
    const { id } = await dispatch(createNote(payload)).unwrap();
    await dispatch(fetchAllNotes()).unwrap();
    await dispatch(fetchNote(id)).unwrap();
  };

  const handleRenameNote = async (id: string, title: string) => {
    await dispatch(renameNote({ id, title })).unwrap();
    await dispatch(fetchAllNotes()).unwrap();
    if (currentNote?.id === id) {
      await dispatch(fetchNote(id)).unwrap();
    }
  };

  const handleMoveNote = async (payload: {
    draggedId: string;
    targetId: string;
    placement: NoteMovePlacement;
  }) => {
    const prevId = currentNote?.id;
    await dispatch(moveNoteInTree(payload)).unwrap();
    await dispatch(fetchAllNotes()).unwrap();
    const list = store.getState().notes.notesList;
    if (prevId && !list.some((n) => n.id === prevId)) {
      try {
        if (list[0]) {
          await dispatch(fetchNote(list[0].id)).unwrap();
        } else {
          await dispatch(fetchNote()).unwrap();
        }
      } catch {
        /* errors land in notes.error */
      }
    }
  };

  const handleMoveNotesBulk = async (payload: {
    ids: string[];
    targetId: string;
    placement: NoteMovePlacement;
  }) => {
    const prevId = currentNote?.id;
    await dispatch(moveNotesBulkInTree(payload)).unwrap();
    await dispatch(fetchAllNotes()).unwrap();
    const list = store.getState().notes.notesList;
    if (prevId && !list.some((n) => n.id === prevId)) {
      try {
        if (list[0]) {
          await dispatch(fetchNote(list[0].id)).unwrap();
        } else {
          await dispatch(fetchNote()).unwrap();
        }
      } catch {
        /* errors land in notes.error */
      }
    }
  };

  const handleDeleteNotes = async (ids: string[]) => {
    await dispatch(deleteNotesInTree(ids)).unwrap();
    await dispatch(fetchAllNotes()).unwrap();
    const s = store.getState().notes;
    try {
      if (
        s.currentNote?.id &&
        s.notesList.some((n) => n.id === s.currentNote!.id)
      ) {
        await dispatch(fetchNote(s.currentNote.id)).unwrap();
      } else if (s.notesList[0]) {
        await dispatch(fetchNote(s.notesList[0].id)).unwrap();
      } else {
        await dispatch(fetchNote()).unwrap();
      }
    } catch {
      /* errors in notes.error */
    }
  };

  const handlePasteSubtree = async (p: PasteSubtreePayload) => {
    const r = await dispatch(pasteSubtree(p)).unwrap();
    await dispatch(fetchAllNotes()).unwrap();
    const s = store.getState().notes;
    try {
      if (r?.newRootId) {
        await dispatch(fetchNote(r.newRootId)).unwrap();
      } else if (
        s.currentNote?.id &&
        s.notesList.some((n) => n.id === s.currentNote!.id)
      ) {
        await dispatch(fetchNote(s.currentNote.id)).unwrap();
      } else if (s.notesList[0]) {
        await dispatch(fetchNote(s.notesList[0].id)).unwrap();
      }
    } catch {
      /* errors in notes.error */
    }
  };

  const settingsNavBtn = (cat: SettingsCategory, label: string) => {
    const active = settingsCategory === cat;
    return (
      <button
        key={cat}
        type="button"
        className={`w-full border-sidebar-border border-b px-3 py-2.5 text-left text-[12px] transition-colors ${
          active
            ? "bg-sidebar-accent font-medium text-foreground"
            : "text-sidebar-foreground/85 hover:bg-sidebar-accent/40"
        }`}
        onClick={() => setSettingsCategory(cat)}
      >
        {label}
      </button>
    );
  };

  const shellBody = () => {
    if (primaryTab === "notes") {
      if (projectRoot === undefined) {
        return (
          <div className="flex min-h-0 flex-1 items-center justify-center p-3">
            <div className="text-[11px] text-muted-foreground">Loading…</div>
          </div>
        );
      }
      if (!projectRoot) {
        return (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            <p className="text-[12px] leading-snug text-muted-foreground">
              Open a project folder to load notes (
              <span className="font-mono text-[11px]">data/nodex.sqlite</span>)
              and browse files under{" "}
              <span className="font-mono text-[11px]">assets/</span>.
            </p>
            <button
              type="button"
              className="rounded-md border border-border bg-background px-3 py-2 text-left text-[12px] font-medium hover:bg-muted/60"
              onClick={() => void handleOpenProjectFolder()}
            >
              Open project…
            </button>
          </div>
        );
      }
      return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <NotesSidebarPanel
              notes={notesList}
              registeredTypes={registeredTypes}
              currentNoteId={currentNote?.id}
              onNoteSelect={handleNoteSelect}
              onCreateNote={handleCreateNote}
              onRenameNote={handleRenameNote}
              onMoveNote={handleMoveNote}
              onMoveNotesBulk={handleMoveNotesBulk}
              onDeleteNotes={handleDeleteNotes}
              onPasteSubtree={handlePasteSubtree}
              onAddWorkspaceFolder={() => void handleAddWorkspaceFolder()}
              onRevealProjectFolder={(id: string) =>
                void handleRevealProjectFolder(id)
              }
              onRefreshWorkspace={() => void handleRefreshWorkspace()}
              workspaceRoots={rootsList}
              onOpenProjectAsset={(pr, relativePath) =>
                setNotesMainPane({
                  kind: "asset",
                  relativePath,
                  projectRoot: pr,
                })
              }
              assetFsTick={assetFsTick}
            />
          </div>
        </div>
      );
    }
    if (primaryTab === "editor") {
      return (
        <div className="min-h-0 flex-1 overflow-hidden">
          <EditorTabSidebar />
        </div>
      );
    }
    if (primaryTab === "settings") {
      return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {settingsNavBtn("appearance", "Appearance")}
          {settingsNavBtn("debug", "Debug")}
          {settingsNavBtn("keyboard", "Keyboard shortcuts")}
        </div>
      );
    }
    return (
      <PluginsSidebarList
        selection={pluginsShell}
        onSelectGeneral={() => setPluginsShell({ kind: "general" })}
        onSelectPlugin={(id) => setPluginsShell({ kind: "plugin", id })}
      />
    );
  };

  const mainColumn = () => {
    if (primaryTab === "notes") {
      if (projectRoot === undefined) {
        return (
          <div className="flex h-full items-center justify-center p-8">
            <div className="text-[12px] text-muted-foreground">Loading…</div>
          </div>
        );
      }
      if (!projectRoot) {
        return (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
            <p className="max-w-md text-center text-[13px] text-muted-foreground">
              Choose a folder for this workspace. Notes live in SQLite under{" "}
              <span className="font-mono text-[12px]">data/</span>; put
              attachments and other files in{" "}
              <span className="font-mono text-[12px]">assets/</span>.
            </p>
            <button
              type="button"
              className="rounded-md border border-border bg-background px-4 py-2 text-[13px] font-medium hover:bg-muted/60"
              onClick={() => void handleOpenProjectFolder()}
            >
              Open project…
            </button>
          </div>
        );
      }
      if (notesMainPane.kind === "asset") {
        return (
          <AssetPreview
            relativePath={notesMainPane.relativePath}
            projectRoot={notesMainPane.projectRoot}
          />
        );
      }
      if (detailLoading && !currentNote) {
        return (
          <div className="flex h-full items-center justify-center p-8">
            <div className="text-[12px] text-muted-foreground">Loading…</div>
          </div>
        );
      }
      if (currentNote) {
        return (
          <NoteViewer
            note={currentNote}
            onTitleCommit={(title) =>
              handleRenameNote(currentNote.id, title)
            }
          />
        );
      }
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="text-[12px] text-muted-foreground">
            No note selected
          </div>
        </div>
      );
    }
    if (primaryTab === "editor") {
      return (
        <PluginIDE
          shellLayout
          onPluginsChanged={handlePluginsChanged}
        />
      );
    }
    if (primaryTab === "settings") {
      return <SettingsView category={settingsCategory} />;
    }
    if (pluginsShell.kind === "general") {
      return (
        <PluginPanelGeneral onPluginsChanged={handlePluginsChanged} />
      );
    }
    return (
      <PluginManager
        onPluginsChanged={handlePluginsChanged}
        selectedPluginId={pluginsShell.id}
      />
    );
  };

  return (
    <div className="nodex-app-pad box-border flex h-screen min-h-0 flex-col bg-muted/45 text-foreground dark:bg-muted/25">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm box-border">
        <PanelGroup
          direction="horizontal"
          autoSaveId="nodex-primary-shell"
          className="h-full min-h-0 min-w-0 flex-1 box-border"
        >
          <Panel
            ref={leftPanelRef}
            defaultSize={LEFT_EXPANDED_PCT}
            minSize={sidebarCollapsed ? 2.5 : 10}
            maxSize={sidebarCollapsed ? 5 : 38}
            className="nodex-panel-shell min-w-0"
          >
            <PrimarySidebarShell
              primaryTab={primaryTab}
              onPrimaryTabChange={setPrimaryTab}
              sidebarCollapsed={sidebarCollapsed}
              onToggleSidebarCollapsed={onToggleSidebarCollapsed}
            >
              {shellBody()}
            </PrimarySidebarShell>
          </Panel>
          <PanelResizeHandle className="nodex-panel-sash relative w-1 shrink-0 bg-transparent transition-colors before:absolute before:inset-y-0 before:left-1/2 before:z-10 before:w-px before:-translate-x-1/2 before:bg-border before:transition-colors hover:before:bg-resize-handle-hover data-[panel-resize-handle-active=true]:before:bg-resize-handle-active" />
          <Panel defaultSize={78} minSize={50} className="nodex-panel-shell min-w-0">
            <MainDebugDockProvider>
              <main className="box-border h-full min-h-0 flex-1 overflow-hidden">
                {mainColumn()}
              </main>
            </MainDebugDockProvider>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
};

export default App;
