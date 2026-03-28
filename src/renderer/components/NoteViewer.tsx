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
      const types = await window.Nodex.getRegisteredTypes();
      setHasPlugin(types.includes(note.type));
    };
    checkPlugin();
  }, [note.type]);

  const renderNote = () => {
    if (hasPlugin) {
      return <SecurePluginRenderer note={note} />;
    }

    return (
      <div className="rounded-sm border border-amber-500/30 bg-amber-500/10 p-4">
        <p className="text-amber-950 dark:text-amber-100">
          No plugin installed for type: <strong>{note.type}</strong>
        </p>
        <p className="mt-2 text-sm text-amber-900/80 dark:text-amber-200/90">
          Install a plugin to handle this note type from the Plugin Manager.
        </p>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border px-6 py-4">
        <h2 className="text-[13px] font-semibold leading-tight text-foreground">
          {note.title}
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">Type</span>
            <span className="font-mono text-foreground">{note.type}</span>
          </div>
          {hasPlugin ? (
            <span className="rounded-sm bg-badge-text-bg px-2 py-0.5 font-medium text-[11px] text-badge-text-fg">
              Plugin active
            </span>
          ) : null}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-6">
        <div className="min-h-0 flex-1">{renderNote()}</div>
      </div>
    </div>
  );
};

export default NoteViewer;
