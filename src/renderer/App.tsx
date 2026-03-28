import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
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
  const { currentNote, notesList, detailLoading, listLoading } = useSelector(
    (state: RootState) => state.notes,
  );
  const listSyncAttemptedFor = useRef<string | null>(null);
  const [showPluginManager, setShowPluginManager] = useState(false);
  const [showPluginIde, setShowPluginIde] = useState(false);
  const [registeredTypes, setRegisteredTypes] = useState<string[]>([]);

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
    void window.Nodex.getRegisteredTypes().then(setRegisteredTypes);

    const unsubscribe = window.Nodex.onPluginsChanged(() => {
      void (async () => {
        try {
          await dispatch(fetchAllNotes()).unwrap();
          await dispatch(fetchNote()).unwrap();
        } catch {
          /* errors land in notes.error */
        }
      })();
      void window.Nodex.getRegisteredTypes().then(setRegisteredTypes);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [dispatch]);

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

  const handleNoteSelect = (noteId: string) => {
    setShowPluginManager(false);
    setShowPluginIde(false);
    void (async () => {
      try {
        await dispatch(fetchAllNotes()).unwrap();
        await dispatch(fetchNote(noteId)).unwrap();
      } catch {
        /* errors land in notes.error */
      }
    })();
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
    setShowPluginManager(false);
    setShowPluginIde(false);
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

  const workspaceRootId = notesList[0]?.id ?? null;

  const handleMoveNote = async (payload: {
    draggedId: string;
    targetId: string;
    placement: NoteMovePlacement;
  }) => {
    await dispatch(moveNoteInTree(payload)).unwrap();
    await dispatch(fetchAllNotes()).unwrap();
  };

  const handleMoveNotesBulk = async (payload: {
    ids: string[];
    targetId: string;
    placement: NoteMovePlacement;
  }) => {
    await dispatch(moveNotesBulkInTree(payload)).unwrap();
    await dispatch(fetchAllNotes()).unwrap();
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
    setShowPluginManager(false);
    setShowPluginIde(false);
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
              onMoveNotesBulk={handleMoveNotesBulk}
              onDeleteNotes={handleDeleteNotes}
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
              ) : detailLoading && !currentNote ? (
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
