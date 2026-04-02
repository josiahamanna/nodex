import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import type { Note } from "@nodex/ui-types";
import type { AppDispatch } from "../../../../store";
import { saveNoteContent } from "../../../../store/notesSlice";
import MarkdownRenderer from "../../../../components/renderers/MarkdownRenderer";

/**
 * System markdown note editor (plain textarea).
 * Persists via batched writes: one save per animation frame while typing, plus immediate flush on blur and when leaving the note.
 */
export function MarkdownNoteEditor({
  note,
  persist,
}: {
  note: Note;
  persist: boolean;
}): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const [value, setValue] = useState(note.content ?? "");
  const latestRef = useRef(note.content ?? "");
  const rafRef = useRef(0);
  const persistRef = useRef(persist);
  const noteIdRef = useRef(note.id);

  persistRef.current = persist;
  noteIdRef.current = note.id;

  useEffect(() => {
    setValue(note.content ?? "");
    latestRef.current = note.content ?? "";
  }, [note.id, note.content]);

  const previewNote = useMemo<Note>(
    () => ({
      id: note.id,
      type: "markdown",
      title: note.title ?? "Markdown",
      content: value,
      metadata: note.metadata,
    }),
    [note.id, note.metadata, note.title, value],
  );

  const flushNow = useCallback(() => {
    if (rafRef.current !== 0) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (!persistRef.current) return;
    void dispatch(
      saveNoteContent({ noteId: noteIdRef.current, content: latestRef.current }),
    );
  }, [dispatch]);

  const scheduleBatchedFlush = useCallback(() => {
    if (!persistRef.current) return;
    if (rafRef.current !== 0) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (!persistRef.current) return;
      void dispatch(
        saveNoteContent({ noteId: noteIdRef.current, content: latestRef.current }),
      );
    });
  }, [dispatch]);

  /** Flush pending edits for the note this effect was bound to, then allow sync effect to reset state. */
  useEffect(() => {
    const idWhenAttached = note.id;
    return () => {
      if (rafRef.current !== 0) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      if (persistRef.current) {
        void dispatch(
          saveNoteContent({ noteId: idWhenAttached, content: latestRef.current }),
        );
      }
    };
  }, [note.id, dispatch]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="flex h-full min-h-0 w-full flex-col gap-3 md:flex-row">
        <div className="flex min-h-[240px] min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background">
          <div className="border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Editor
          </div>
          <textarea
            className="h-full min-h-[240px] w-full flex-1 resize-none bg-transparent p-3 font-mono text-[13px] outline-none"
            spellCheck={false}
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              setValue(v);
              latestRef.current = v;
              scheduleBatchedFlush();
            }}
            onBlur={() => {
              flushNow();
            }}
          />
        </div>

        <div className="flex min-h-[240px] min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background">
          <div className="border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Preview
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <MarkdownRenderer note={previewNote} />
          </div>
        </div>
      </div>
    </div>
  );
}
