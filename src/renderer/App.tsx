import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import { AppDispatch, RootState, store } from "./store";
import {
  createNote,
  fetchNote,
  fetchAllNotes,
  moveNoteInTree,
  pasteSubtree,
  renameNote,
} from "./store/notesSlice";
import Sidebar from "./components/Sidebar";
import NoteViewer from "./components/NoteViewer";
import PluginManager from "./components/PluginManager";
import PluginIDE from "./components/PluginIDE";
import type {
  CreateNoteRelation,
  NoteMovePlacement,
  PasteSubtreePayload,
} from "../preload";

const App: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { currentNote, notesList, loading } = useSelector(
    (state: RootState) => state.notes,
  );
  const [showPluginManager, setShowPluginManager] = useState(false);
  const [showPluginIde, setShowPluginIde] = useState(false);
  const [registeredTypes, setRegisteredTypes] = useState<string[]>([]);

  useEffect(() => {
    dispatch(fetchAllNotes());
    dispatch(fetchNote());
    void window.Nodex.getRegisteredTypes().then(setRegisteredTypes);

    const unsubscribe = window.Nodex.onPluginsChanged(() => {
      dispatch(fetchAllNotes());
      dispatch(fetchNote());
      void window.Nodex.getRegisteredTypes().then(setRegisteredTypes);
    });

    return unsubscribe;
  }, [dispatch]);

  const handleNoteSelect = (noteId: string) => {
    setShowPluginManager(false);
    setShowPluginIde(false);
    dispatch(fetchNote(noteId));
  };

  const handlePluginManagerOpen = () => {
    setShowPluginIde(false);
    setShowPluginManager(true);
  };

  const handlePluginIdeOpen = () => {
    setShowPluginManager(false);
    setShowPluginIde(true);
  };

  const handlePluginsChanged = () => {
    dispatch(fetchAllNotes());
    dispatch(fetchNote());
    void window.Nodex.getRegisteredTypes().then(setRegisteredTypes);
  };

  const handleCreateNote = async (payload: {
    anchorId?: string;
    relation: CreateNoteRelation;
    type: string;
  }) => {
    setShowPluginManager(false);
    setShowPluginIde(false);
    const { id } = await dispatch(createNote(payload)).unwrap();
    await dispatch(fetchAllNotes());
    dispatch(fetchNote(id));
  };

  const handleRenameNote = async (id: string, title: string) => {
    await dispatch(renameNote({ id, title })).unwrap();
    await dispatch(fetchAllNotes());
    if (currentNote?.id === id) {
      dispatch(fetchNote(id));
    }
  };

  const workspaceRootId = notesList[0]?.id ?? null;

  const handleMoveNote = async (payload: {
    draggedId: string;
    targetId: string;
    placement: NoteMovePlacement;
  }) => {
    await dispatch(moveNoteInTree(payload)).unwrap();
    await dispatch(fetchAllNotes());
  };

  const handlePasteSubtree = async (p: PasteSubtreePayload) => {
    const r = await dispatch(pasteSubtree(p)).unwrap();
    await dispatch(fetchAllNotes());
    setShowPluginManager(false);
    setShowPluginIde(false);
    const s = store.getState().notes;
    if (r?.newRootId) {
      dispatch(fetchNote(r.newRootId));
    } else if (
      s.currentNote?.id &&
      s.notesList.some((n) => n.id === s.currentNote!.id)
    ) {
      dispatch(fetchNote(s.currentNote.id));
    } else if (s.notesList[0]) {
      dispatch(fetchNote(s.notesList[0].id));
    }
  };

  return (
    <div className="nodex-app-pad box-border flex h-screen min-h-0 flex-col bg-muted/45 text-foreground dark:bg-muted/25">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm box-border">
        <PanelGroup
          direction="horizontal"
          autoSaveId="nodex-sidebar"
          className="min-h-0 min-w-0 flex-1 box-border"
        >
          <Panel
            defaultSize={20}
            minSize={12}
            maxSize={40}
            className="nodex-panel-shell"
          >
            <Sidebar
              notes={notesList}
              registeredTypes={registeredTypes}
              workspaceRootId={workspaceRootId}
              currentNoteId={currentNote?.id}
              activeSidebarTool={
                showPluginIde
                  ? "plugin-ide"
                  : showPluginManager
                    ? "plugin-manager"
                    : null
              }
              onNoteSelect={handleNoteSelect}
              onCreateNote={handleCreateNote}
              onRenameNote={handleRenameNote}
              onMoveNote={handleMoveNote}
              onPasteSubtree={handlePasteSubtree}
              onPluginManagerOpen={handlePluginManagerOpen}
              onPluginIdeOpen={handlePluginIdeOpen}
            />
          </Panel>
          <PanelResizeHandle className="nodex-panel-sash relative w-1 shrink-0 bg-transparent transition-colors before:absolute before:inset-y-0 before:left-1/2 before:z-10 before:w-px before:-translate-x-1/2 before:bg-border before:transition-colors hover:before:bg-resize-handle-hover data-[panel-resize-handle-active=true]:before:bg-resize-handle-active" />
          <Panel defaultSize={80} minSize={55} className="nodex-panel-shell">
            <main className="box-border h-full min-h-0 flex-1 overflow-hidden">
              {showPluginIde ? (
                <PluginIDE onPluginsChanged={handlePluginsChanged} />
              ) : showPluginManager ? (
                <PluginManager onPluginsChanged={handlePluginsChanged} />
              ) : loading ? (
                <div className="flex h-full items-center justify-center p-8">
                  <div className="text-[12px] text-muted-foreground">
                    Loading…
                  </div>
                </div>
              ) : currentNote ? (
                <NoteViewer
                  note={currentNote}
                  onTitleCommit={(title) =>
                    handleRenameNote(currentNote.id, title)
                  }
                />
              ) : (
                <div className="flex h-full items-center justify-center p-8">
                  <div className="text-[12px] text-muted-foreground">
                    No note selected
                  </div>
                </div>
              )}
            </main>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
};

export default App;
