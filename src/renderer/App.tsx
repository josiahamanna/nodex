import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "./store";
import { fetchNote, fetchAllNotes } from "./store/notesSlice";
import Sidebar from "./components/Sidebar";
import NoteViewer from "./components/NoteViewer";
import PluginManager from "./components/PluginManager";
import PluginIDE from "./components/PluginIDE";

const App: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { currentNote, notesList, loading } = useSelector(
    (state: RootState) => state.notes,
  );
  const [showPluginManager, setShowPluginManager] = useState(false);
  const [showPluginIde, setShowPluginIde] = useState(false);

  useEffect(() => {
    dispatch(fetchAllNotes());
    dispatch(fetchNote());

    // Listen for plugin changes from main process
    const unsubscribe = window.Nodex.onPluginsChanged(() => {
      dispatch(fetchAllNotes());
      dispatch(fetchNote());
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
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar
        notes={notesList}
        currentNoteId={currentNote?.id}
        onNoteSelect={handleNoteSelect}
        onPluginManagerOpen={handlePluginManagerOpen}
        onPluginIdeOpen={handlePluginIdeOpen}
      />
      <main className="flex-1 overflow-hidden">
        {showPluginIde ? (
          <PluginIDE onPluginsChanged={handlePluginsChanged} />
        ) : showPluginManager ? (
          <PluginManager onPluginsChanged={handlePluginsChanged} />
        ) : loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading...</div>
          </div>
        ) : currentNote ? (
          <NoteViewer note={currentNote} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">No note selected</div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
