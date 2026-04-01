import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import type { Note } from "@nodex/ui-types";
import type { AppDispatch } from "../../../../store";
import { saveNoteContent } from "../../../../store/notesSlice";

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
    <textarea
      className="h-full min-h-[320px] w-full resize-none border border-border bg-background p-3 font-mono text-[13px] outline-none"
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
  );
}
