import { getNodex } from "../../shared/nodex-host-access";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Note } from "@nodex/ui-types";
import { useToast } from "../toast/ToastContext";
import {
  getRegisteredTypesCached,
  invalidateNodexNoteTypesCaches,
} from "../utils/cached-nodex-note-types";
import NoteTypeReactRenderer from "./renderers/NoteTypeReactRenderer";

interface NoteViewerProps {
  note: Note;
  /** Project folder that owns this note’s `assets/` (multi-root workspaces). */
  assetProjectRoot?: string | null;
  onTitleCommit: (title: string) => void | Promise<void>;
}

const NoteViewer: React.FC<NoteViewerProps> = ({
  note,
  assetProjectRoot = null,
  onTitleCommit,
}) => {
  const [hasPlugin, setHasPlugin] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    let warnTimer: ReturnType<typeof setTimeout> | null = null;

    const checkPlugin = async () => {
      const types = await getRegisteredTypesCached();
      if (cancelled) {
        return;
      }
      const ok = types.includes(note.type);
      setHasPlugin(ok);
      if (warnTimer) {
        clearTimeout(warnTimer);
        warnTimer = null;
      }
      if (!ok) {
        warnTimer = setTimeout(() => {
          void (async () => {
            const again = await getRegisteredTypesCached();
            if (cancelled || again.includes(note.type)) {
              return;
            }
            showToast({
              severity: "warning",
              message: `No plugin installed for note type "${note.type}". Install one from Plugin Manager.`,
              mergeKey: `note-no-plugin:${note.type}`,
            });
          })();
        }, 450);
      }
    };

    void checkPlugin();
    const off = getNodex().onPluginsChanged(() => {
      invalidateNodexNoteTypesCaches();
      void checkPlugin();
    });
    return () => {
      cancelled = true;
      if (warnTimer) {
        clearTimeout(warnTimer);
      }
      off();
    };
  }, [note.type, showToast]);

  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el || titleEditing) {
      return;
    }
    if (el.textContent !== note.title) {
      el.textContent = note.title;
    }
  }, [note.id, note.title, titleEditing]);

  const renderNote = () => {
    if (hasPlugin) {
      return (
        <NoteTypeReactRenderer note={note} assetProjectRoot={assetProjectRoot} />
      );
    }

    return (
      <div className="rounded-sm border border-border bg-muted/50 p-4">
        <p className="text-foreground">
          No plugin installed for type: <strong>{note.type}</strong>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Install a plugin to handle this note type from the Plugin Manager.
        </p>
      </div>
    );
  };

  const commitTitleFromDom = async () => {
    const el = titleRef.current;
    if (!el) {
      return;
    }
    const raw = el.textContent ?? "";
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) {
      el.textContent = note.title;
      setTitleEditing(false);
      return;
    }
    if (t !== note.title) {
      await onTitleCommit(t);
    }
    el.textContent = t;
    setTitleEditing(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <h2
          key={note.id}
          ref={titleRef}
          contentEditable
          suppressContentEditableWarning
          role="heading"
          aria-level={2}
          tabIndex={0}
          className="min-h-[1.25rem] max-w-full rounded-sm px-1 py-0.5 text-[13px] font-semibold leading-tight text-foreground outline-none ring-offset-background hover:bg-muted/40 focus:bg-muted/40 focus:ring-2 focus:ring-ring focus:ring-offset-2"
          onFocus={() => setTitleEditing(true)}
          onBlur={() => void commitTitleFromDom()}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3">
        <div className="flex min-h-0 flex-1 flex-col">{renderNote()}</div>
      </div>
    </div>
  );
};

export default NoteViewer;
