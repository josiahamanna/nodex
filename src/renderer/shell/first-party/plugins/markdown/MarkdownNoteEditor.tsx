import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import type { Note } from "@nodex/ui-types";
import type { AppDispatch } from "../../../../store";
import { patchNoteMetadata, saveNoteContent } from "../../../../store/notesSlice";
import MarkdownRenderer from "../../../../components/renderers/MarkdownRenderer";

type MarkdownViewMode = "editor" | "preview" | "both";

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
  const previewScrollRef = useRef<HTMLDivElement | null>(null);

  const [viewMode, setViewMode] = useState<MarkdownViewMode>(() => {
    const raw =
      note.metadata && typeof note.metadata === "object"
        ? (note.metadata as Record<string, unknown>).markdownViewMode
        : undefined;
    return raw === "editor" || raw === "preview" || raw === "both" ? raw : "both";
  });

  persistRef.current = persist;
  noteIdRef.current = note.id;

  useEffect(() => {
    setValue(note.content ?? "");
    latestRef.current = note.content ?? "";
  }, [note.id, note.content]);

  useEffect(() => {
    const raw =
      note.metadata && typeof note.metadata === "object"
        ? (note.metadata as Record<string, unknown>).markdownViewMode
        : undefined;
    const next: MarkdownViewMode =
      raw === "editor" || raw === "preview" || raw === "both" ? raw : "both";
    setViewMode(next);
  }, [note.id, note.metadata]);

  const setAndPersistViewMode = useCallback(
    (next: MarkdownViewMode) => {
      setViewMode(next);
      if (!persistRef.current) return;
      void dispatch(patchNoteMetadata({ noteId: noteIdRef.current, patch: { markdownViewMode: next } }));
    },
    [dispatch],
  );

  useEffect(() => {
    const onScrollTo = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { noteId?: unknown; slug?: unknown }
        | undefined;
      const noteId = typeof detail?.noteId === "string" ? detail.noteId : "";
      const slug = typeof detail?.slug === "string" ? detail.slug : "";
      if (!noteId || noteId !== noteIdRef.current) return;
      if (!slug) return;

      if (viewMode === "editor") {
        setAndPersistViewMode("both");
      }

      const tryScroll = (attempt: number) => {
        const root = previewScrollRef.current;
        if (!root) {
          if (attempt < 8) requestAnimationFrame(() => tryScroll(attempt + 1));
          return;
        }
        const target = root.querySelector<HTMLElement>(`#${CSS.escape(slug)}`);
        if (!target) {
          if (attempt < 8) requestAnimationFrame(() => tryScroll(attempt + 1));
          return;
        }
        target.scrollIntoView({ block: "start" });
      };
      requestAnimationFrame(() => tryScroll(0));
    };

    window.addEventListener("nodex:markdown-scroll-to-heading", onScrollTo as EventListener);
    return () => {
      window.removeEventListener("nodex:markdown-scroll-to-heading", onScrollTo as EventListener);
    };
  }, [setAndPersistViewMode, viewMode]);

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
      <div className="flex shrink-0 items-center justify-between gap-2 pb-3">
        <div className="inline-flex overflow-hidden rounded-md border border-border bg-muted/10">
          {(
            [
              ["editor", "Editor"],
              ["preview", "Preview"],
              ["both", "Both"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`px-3 py-1.5 text-[11px] font-medium outline-none transition-colors ${
                viewMode === id
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              }`}
              onClick={() => setAndPersistViewMode(id)}
              aria-pressed={viewMode === id}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-muted-foreground">
          Markdown
        </div>
      </div>

      <div className="flex h-full min-h-0 w-full flex-col gap-3 md:flex-row">
        {viewMode === "editor" || viewMode === "both" ? (
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
        ) : null}

        {viewMode === "preview" || viewMode === "both" ? (
          <div className="flex min-h-[240px] min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background">
            <div className="border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Preview
            </div>
            <div
              className="min-h-0 flex-1 overflow-auto"
              ref={previewScrollRef}
              data-nodex-md-preview
            >
              <MarkdownRenderer note={previewNote} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
