import React, { useEffect, useState } from "react";
import { Note } from "../../preload";
import SecurePluginRenderer from "./renderers/SecurePluginRenderer";

interface NoteViewerProps {
  note: Note;
}

const NoteViewer: React.FC<NoteViewerProps> = ({ note }) => {
  const [hasPlugin, setHasPlugin] = useState(false);

  useEffect(() => {
    const checkPlugin = async () => {
      // Check both old and new plugin systems
      const types = await window.modux.getRegisteredTypes();
      setHasPlugin(types.includes(note.type));
    };
    checkPlugin();
  }, [note.type]);

  const renderNote = () => {
    if (hasPlugin) {
      return <SecurePluginRenderer note={note} />;
    }

    return (
      <div className="p-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">
            No plugin installed for type: <strong>{note.type}</strong>
          </p>
          <p className="text-sm text-yellow-600 mt-2">
            Install a plugin to handle this note type from the Plugin Manager.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <header className="border-b border-gray-200 p-4">
        <h2 className="text-2xl font-bold text-gray-800">{note.title}</h2>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-gray-500">Type:</span>
          <span className="text-xs font-medium text-gray-700">{note.type}</span>
          {hasPlugin && (
            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
              Plugin Active
            </span>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-auto">{renderNote()}</div>
    </div>
  );
};

export default NoteViewer;
