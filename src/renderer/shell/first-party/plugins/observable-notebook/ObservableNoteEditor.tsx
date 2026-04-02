import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../../../../store";
import { saveNoteContent } from "../../../../store/notesSlice";
import { useNodexContributionRegistry } from "../../../NodexContributionContext";
import type { NoteTypeReactEditorProps } from "../../../nodex-contribution-registry";
import { ObservableNotebookWorkspace } from "./ObservableNotebookWorkspace";
import { makeNotebookCellId, type NotebookCell } from "./observable-notebook-types";

function defaultCells(): NotebookCell[] {
  return [
    { id: makeNotebookCellId(), name: "x", inputs: [], body: "42", kind: "js" },
    { id: makeNotebookCellId(), name: "y", inputs: ["x"], body: "x + 1", kind: "js" },
    { id: makeNotebookCellId(), name: "view", inputs: ["y"], body: "'y = ' + y", kind: "js" },
  ];
}

function parseCellsFromContent(raw: string | undefined): NotebookCell[] {
  try {
    const v = raw?.trim() ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(v) && v.length > 0) {
      return v as NotebookCell[];
    }
  } catch {
    /* fall through */
  }
  return defaultCells();
}

function cellsToJson(cells: NotebookCell[]): string {
  return JSON.stringify(cells);
}

/**
 * Observable notebook backed by `note.content` (JSON array of cells).
 */
export function ObservableNoteEditor({
  note,
  persistToNotesStore = true,
}: NoteTypeReactEditorProps): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const contrib = useNodexContributionRegistry();
  const persist = persistToNotesStore !== false;
  const [cells, setCells] = useState<NotebookCell[]>(() => parseCellsFromContent(note.content));
  const latestJsonRef = useRef(cellsToJson(cells));
  const rafRef = useRef(0);
  const persistRef = useRef(persist);
  const noteIdRef = useRef(note.id);

  persistRef.current = persist;
  noteIdRef.current = note.id;

  useEffect(() => {
    const next = parseCellsFromContent(note.content);
    setCells(next);
    latestJsonRef.current = cellsToJson(next);
  }, [note.id, note.content]);

  const flushNow = useCallback(() => {
    if (rafRef.current !== 0) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (!persistRef.current) return;
    void dispatch(
      saveNoteContent({ noteId: noteIdRef.current, content: latestJsonRef.current }),
    );
  }, [dispatch]);

  const scheduleBatchedFlush = useCallback(() => {
    if (!persistRef.current) return;
    if (rafRef.current !== 0) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (!persistRef.current) return;
      void dispatch(
        saveNoteContent({ noteId: noteIdRef.current, content: latestJsonRef.current }),
      );
    });
  }, [dispatch]);

  useEffect(() => {
    const idWhenAttached = note.id;
    return () => {
      if (rafRef.current !== 0) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      if (persistRef.current) {
        void dispatch(
          saveNoteContent({ noteId: idWhenAttached, content: latestJsonRef.current }),
        );
      }
    };
  }, [note.id, dispatch]);

  const persistCells = useCallback(
    (next: NotebookCell[]) => {
      setCells(next);
      const j = cellsToJson(next);
      latestJsonRef.current = j;
      scheduleBatchedFlush();
    },
    [scheduleBatchedFlush],
  );

  const invokeCommand = useCallback(
    (commandId: string, args?: Record<string, unknown>) =>
      Promise.resolve(contrib.invokeCommand(commandId, args)).catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error("[ObservableNotebook]", commandId, err);
      }),
    [contrib],
  );

  return (
    <ObservableNotebookWorkspace
      cells={cells}
      onCellsChange={persistCells}
      invokeCommand={invokeCommand}
      executeWhenKeyChanges={note.id}
      showSaveNow={persist}
      onSaveNow={flushNow}
    />
  );
}

export function ObservableNoteEditorHost(props: NoteTypeReactEditorProps): React.ReactElement {
  return <ObservableNoteEditor note={props.note} persistToNotesStore={props.persistToNotesStore} />;
}
