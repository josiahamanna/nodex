import React from "react";
import { NoteListItem } from "../../preload";

interface SidebarProps {
  notes: NoteListItem[];
  currentNoteId?: string;
  onNoteSelect: (noteId: string) => void;
  onPluginManagerOpen: () => void;
  onPluginIdeOpen: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  notes,
  currentNoteId,
  onNoteSelect,
  onPluginManagerOpen,
  onPluginIdeOpen,
}) => {
  const getTypeColor = (type: string): string => {
    switch (type) {
      case "markdown":
        return "bg-blue-100 text-blue-800";
      case "text":
        return "bg-green-100 text-green-800";
      case "code":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <aside className="h-full w-full min-h-0 min-w-0 bg-white flex flex-col border-r border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-800">Nodex</h1>
        <p className="text-xs text-gray-500 mt-1">
          Programmable Knowledge System
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          {notes.map((note) => (
            <button
              key={note.id}
              onClick={() => onNoteSelect(note.id)}
              className={`w-full text-left p-3 rounded-lg mb-2 transition-colors ${
                currentNoteId === note.id
                  ? "bg-blue-50 border border-blue-200"
                  : "hover:bg-gray-50 border border-transparent"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm text-gray-800 truncate">
                  {note.title}
                </span>
              </div>
              <span
                className={`inline-block px-2 py-0.5 text-xs rounded-full ${getTypeColor(note.type)}`}
              >
                {note.type}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onPluginIdeOpen}
          className="w-full px-3 py-2 bg-indigo-700 text-white rounded-lg hover:bg-indigo-800 text-sm font-medium mb-2"
        >
          Plugin IDE
        </button>
        <button
          type="button"
          onClick={onPluginManagerOpen}
          className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 text-sm font-medium mb-3"
        >
          Manage Plugins
        </button>
        <div className="text-xs text-gray-500">
          <div>Plugin-driven architecture</div>
          <div className="mt-1 text-gray-400">{notes.length} notes</div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
