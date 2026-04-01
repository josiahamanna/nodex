import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import type { Note } from "@nodex/ui-types";
import type { AppDispatch } from "../../../../store";
import { saveNoteContent } from "../../../../store/notesSlice";

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

/**
 * System markdown note editor (plain textarea; same UX as the former built-in branch).
 */
export function MarkdownNoteEditor({
  note,
  persist,
}: {
  note: Note;
  persist: boolean;
}): React.ReactElement {
  const [value, setValue] = useState(note.content ?? "");
  const save = useDebouncedNoteSave(note.id, persist, 400);

  useEffect(() => {
    setValue(note.content ?? "");
  }, [note.id, note.content]);

  return (
    <textarea
      className="h-full min-h-[320px] w-full resize-none border border-border bg-background p-3 font-mono text-[13px] outline-none"
      spellCheck={false}
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        setValue(v);
        save(v);
      }}
    />
  );
}
