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
import SettingsView, {
  type SettingsCategory,
} from "./components/SettingsView";
import PrimarySidebarShell, {
  readStoredPrimaryTab,
  writeStoredPrimaryTab,
  type PrimaryTab,
} from "./components/shell/PrimarySidebarShell";
import type { PluginsSidebarSelection } from "./components/shell/PluginsSidebarList";
import { AppShellBody } from "./app/AppShellBody";
import { AppShellMainColumn } from "./app/AppShellMainColumn";
import {
  LEFT_COLLAPSED_PCT,
  LEFT_EXPANDED_PCT,
  readShellSidebarCollapsed,
  writeShellSidebarCollapsed,
} from "./app/app-shell-storage";
import type { NotesMainPane } from "./app/app-shell-types";
import { MainDebugDockProvider } from "./debug/MainDebugDockContext";
import type {
  CreateNoteRelation,
  NoteMovePlacement,
  PasteSubtreePayload,
} from "../preload";
import { workspaceFolderPathForNote } from "../shared/note-workspace";

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
              <AppShellBody
                primaryTab={primaryTab}
                projectRoot={projectRoot}
                notesList={notesList}
                registeredTypes={registeredTypes}
                currentNoteId={currentNote?.id}
                rootsList={rootsList}
                assetFsTick={assetFsTick}
                settingsCategory={settingsCategory}
                setSettingsCategory={setSettingsCategory}
                pluginsShell={pluginsShell}
                setPluginsShell={setPluginsShell}
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
                onOpenProjectFolder={() => void handleOpenProjectFolder()}
                onOpenProjectAsset={(pr, relativePath) =>
                  setNotesMainPane({
                    kind: "asset",
                    relativePath,
                    projectRoot: pr,
                  })
                }
              />
            </PrimarySidebarShell>
          </Panel>
          <PanelResizeHandle className="nodex-panel-sash relative w-1 shrink-0 bg-transparent transition-colors before:absolute before:inset-y-0 before:left-1/2 before:z-10 before:w-px before:-translate-x-1/2 before:bg-border before:transition-colors hover:before:bg-resize-handle-hover data-[panel-resize-handle-active=true]:before:bg-resize-handle-active" />
          <Panel defaultSize={78} minSize={50} className="nodex-panel-shell min-w-0">
            <MainDebugDockProvider>
              <main className="box-border h-full min-h-0 flex-1 overflow-hidden">
                <AppShellMainColumn
                  primaryTab={primaryTab}
                  projectRoot={projectRoot}
                  notesMainPane={notesMainPane}
                  detailLoading={detailLoading}
                  currentNote={currentNote}
                  settingsCategory={settingsCategory}
                  pluginsShell={pluginsShell}
                  onOpenProjectFolder={() => void handleOpenProjectFolder()}
                  onRenameNote={handleRenameNote}
                  onPluginsChanged={handlePluginsChanged}
                />
              </main>
            </MainDebugDockProvider>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
};

export default App;
