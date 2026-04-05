import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useDispatch } from "react-redux";
import Editor from "@monaco-editor/react";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import type { Note } from "@nodex/ui-types";
import type { AppDispatch } from "../../store";
import { saveNoteContent } from "../../store/notesSlice";
import { useTheme } from "../../theme/ThemeContext";
import { useNodexContributionRegistry } from "../../shell/NodexContributionContext";
import { useNodexNoteModeLine } from "../../shell/useNodexNoteModeLine";

loader.config({ monaco });

export interface NoteTypeReactRendererProps {
  note: Note;
  persistToNotesStore?: boolean;
  assetProjectRoot?: string | null;
}

function useDebouncedNoteSave(
  noteId: string,
  persist: boolean,
  delayMs: number,
): (content: string) => void {
  const dispatch = useDispatch<AppDispatch>();
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (content: string) => {
      if (!persist) return;
      if (tRef.current) clearTimeout(tRef.current);
      tRef.current = setTimeout(() => {
        tRef.current = null;
        void dispatch(saveNoteContent({ noteId, content }));
      }, delayMs);
    },
    [dispatch, noteId, persist, delayMs],
  );
}

function lineColAtPlainText(text: string, offset: number): { line: number; col: number } {
  const head = Math.max(0, Math.min(offset, text.length));
  const lines = text.slice(0, head).split("\n");
  const line = lines.length;
  const col = (lines[lines.length - 1] ?? "").length + 1;
  return { line, col };
}

function TextNoteEditor({
  note,
  persist,
}: {
  note: Note;
  persist: boolean;
}): React.ReactElement {
  const [value, setValue] = useState(note.content ?? "");
  const [caret, setCaret] = useState(0);
  const save = useDebouncedNoteSave(note.id, persist, 400);

  useEffect(() => {
    setValue(note.content ?? "");
  }, [note.id, note.content]);

  const syncCaret = useCallback((el: HTMLTextAreaElement) => {
    setCaret(el.selectionStart);
  }, []);

  const textSecondary = useMemo(() => {
    const { line, col } = lineColAtPlainText(value, caret);
    return `Ln ${line}, Col ${col} · ${value.length} chars`;
  }, [caret, value]);

  useNodexNoteModeLine({
    scopeId: note.id,
    primaryLine: "Plain text",
    secondaryLine: textSecondary,
    sourcePluginId: "nodex.text-note",
  });

  return (
    <textarea
      className="h-full min-h-[320px] w-full resize-none border border-border bg-background p-3 font-mono text-[13px] outline-none"
      spellCheck={false}
      value={value}
      onSelect={(e) => syncCaret(e.currentTarget)}
      onClick={(e) => syncCaret(e.currentTarget)}
      onKeyUp={(e) => syncCaret(e.currentTarget)}
      onChange={(e) => {
        const el = e.currentTarget;
        const v = el.value;
        setValue(v);
        setCaret(el.selectionStart);
        save(v);
      }}
    />
  );
}

function CodeNoteEditor({
  note,
  persist,
}: {
  note: Note;
  persist: boolean;
}): React.ReactElement {
  const { resolvedDark } = useTheme();
  const meta = (note.metadata ?? {}) as { language?: string };
  const language = typeof meta.language === "string" ? meta.language : "javascript";
  const [value, setValue] = useState(note.content ?? "");
  const save = useDebouncedNoteSave(note.id, persist, 400);

  useEffect(() => {
    setValue(note.content ?? "");
  }, [note.id, note.content]);

  const codeSecondary = useMemo(() => {
    const lines = value.length === 0 ? 1 : value.split("\n").length;
    return `${lines} line${lines === 1 ? "" : "s"} · ${value.length} chars`;
  }, [value]);

  useNodexNoteModeLine({
    scopeId: note.id,
    primaryLine: `Code · ${language}`,
    secondaryLine: codeSecondary,
    sourcePluginId: "nodex.code-note",
  });

  return (
    <div className="h-full min-h-[420px] w-full overflow-hidden rounded-md border border-border">
      <Editor
        height="100%"
        language={language}
        theme={resolvedDark ? "vs-dark" : "vs"}
        value={value}
        onChange={(v) => {
          const next = v ?? "";
          setValue(next);
          save(next);
        }}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          automaticLayout: true,
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  );
}

/**
 * First-party note editors (no iframe). Unknown types show an install hint.
 */
const NoteTypeReactRenderer: React.FC<NoteTypeReactRendererProps> = ({
  note,
  persistToNotesStore = true,
  assetProjectRoot = null,
}) => {
  const persist = persistToNotesStore;
  const t = note.type;
  const contrib = useNodexContributionRegistry();
  const registryRev = useSyncExternalStore(
    (onStore) => contrib.subscribe(onStore),
    () => contrib.getSnapshotVersion(),
    () => 0,
  );

  const Registered = contrib.getNoteTypeReactEditor(t);
  if (Registered) {
    void registryRev;
    return (
      <Registered
        note={note}
        persistToNotesStore={persist}
        assetProjectRoot={assetProjectRoot}
      />
    );
  }

  if (t === "code") {
    return <CodeNoteEditor note={note} persist={persist} />;
  }
  if (t === "text") {
    return <TextNoteEditor note={note} persist={persist} />;
  }
  if (t === "markdown" || t === "mdx" || t === "root") {
    return (
      <div className="rounded-sm border border-border bg-muted/50 p-4">
        <p className="font-medium text-foreground">Markdown editor not registered</p>
        <p className="mt-2 text-sm text-muted-foreground">
          The system markdown plugin should register on startup. Reload the app or check{" "}
          <code className="text-xs">useRegisterMarkdownNotePlugin</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border bg-muted/50 p-4">
      <p className="font-medium text-foreground">Unsupported note type</p>
      <p className="mt-2 text-sm text-muted-foreground">
        No built-in React editor for type <strong>{t}</strong>. Use a plugin that targets the new modular
        host, or add a first-party editor mapping in{" "}
        <code className="text-xs">NoteTypeReactRenderer.tsx</code>.
      </p>
    </div>
  );
};

export default NoteTypeReactRenderer;
