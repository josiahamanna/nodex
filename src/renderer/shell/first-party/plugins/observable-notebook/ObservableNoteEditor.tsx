import { Inspector } from "@observablehq/inspector";
import { Runtime } from "@observablehq/runtime";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../../../../store";
import { saveNoteContent } from "../../../../store/notesSlice";
import type { NoteTypeReactEditorProps } from "../../../nodex-contribution-registry";

type Cell = { id: string; name: string; inputs: string[]; body: string };

function makeId(): string {
  return `${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
}

function defaultCells(): Cell[] {
  return [
    { id: makeId(), name: "x", inputs: [], body: "42" },
    { id: makeId(), name: "y", inputs: ["x"], body: "x + 1" },
    { id: makeId(), name: "view", inputs: ["y"], body: "'y = ' + y" },
  ];
}

function parseCellsFromContent(raw: string | undefined): Cell[] {
  try {
    const v = raw?.trim() ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(v) && v.length > 0) {
      return v as Cell[];
    }
  } catch {
    /* fall through */
  }
  return defaultCells();
}

function cellsToJson(cells: Cell[]): string {
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
  const persist = persistToNotesStore !== false;
  const [cells, setCells] = useState<Cell[]>(() => parseCellsFromContent(note.content));
  const [err, setErr] = useState<string | null>(null);
  const outRef = useRef<HTMLDivElement>(null);
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
    (next: Cell[]) => {
      setCells(next);
      const j = cellsToJson(next);
      latestJsonRef.current = j;
      scheduleBatchedFlush();
    },
    [scheduleBatchedFlush],
  );

  const run = useCallback(async () => {
    setErr(null);
    const root = outRef.current;
    if (!root) return;
    root.innerHTML = "";
    try {
      const runtime = new Runtime();
      const mod = runtime.module();
      const seen = new Set<string>();
      const normCells = cells
        .map((c) => ({
          name: String(c.name || "").trim(),
          inputs: (c.inputs || []).map((x) => String(x || "").trim()).filter(Boolean),
          body: String(c.body || "").trim(),
        }))
        .filter((c) => c.name)
        .map((c) => {
          let n = c.name;
          while (seen.has(n)) n = `${n}_`;
          seen.add(n);
          return { ...c, name: n };
        });

      for (const c of normCells) {
        const block = document.createElement("div");
        block.className = "mb-2.5 rounded-lg border border-border p-2.5";
        const h = document.createElement("div");
        h.className = "mb-1.5 font-mono text-[11px] opacity-70";
        h.textContent = c.name;
        const slot = document.createElement("div");
        block.appendChild(h);
        block.appendChild(slot);
        root.appendChild(block);
        const makeObserver = Inspector.into(slot);
        const fn = new Function(
          ...c.inputs,
          `"use strict"; return (async () => { return (${c.body}); })();`,
        );
        mod.variable(makeObserver()).define(c.name, c.inputs, (...args: unknown[]) =>
          (fn as (...a: unknown[]) => unknown)(...args),
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [cells]);

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  return (
    <div className="flex h-full min-h-0 flex-col text-[12px]">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="text-[12px] font-bold opacity-85">Observable notebook</div>
        <button
          type="button"
          className="rounded border border-border bg-muted/20 px-2.5 py-1.5 text-[12px]"
          onClick={() => void run()}
        >
          Run
        </button>
        <button
          type="button"
          className="rounded border border-border bg-muted/20 px-2.5 py-1.5 text-[12px]"
          onClick={() =>
            persistCells([
              ...cells,
              { id: makeId(), name: `cell${cells.length + 1}`, inputs: [], body: "0" },
            ])
          }
        >
          Add cell
        </button>
        <button
          type="button"
          className="rounded border border-border bg-muted/20 px-2.5 py-1.5 text-[12px]"
          onClick={() => persistCells(defaultCells())}
        >
          Reset
        </button>
        <button
          type="button"
          className="rounded border border-border bg-muted/20 px-2.5 py-1.5 text-[12px]"
          onClick={() => flushNow()}
        >
          Save now
        </button>
      </div>
      {err ? (
        <div className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          {err}
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-0 divide-x divide-border">
        <div className="min-h-0 overflow-auto p-3">
          <p className="mb-2 text-[11px] leading-relaxed opacity-70">
            Cells are JS expressions via <code className="font-mono">@observablehq/runtime</code>. Stored as JSON
            in the note.
          </p>
          {cells.map((c) => (
            <div key={c.id} className="mb-2.5 rounded-lg border border-border p-2.5">
              <div className="mb-2 flex flex-wrap gap-2">
                <input
                  className="w-40 rounded border border-border px-2 py-1 font-mono text-[11px]"
                  placeholder="name"
                  value={c.name}
                  onChange={(e) =>
                    persistCells(cells.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))
                  }
                />
                <input
                  className="w-52 rounded border border-border px-2 py-1 font-mono text-[11px]"
                  placeholder="inputs: a, b"
                  value={c.inputs.join(", ")}
                  onChange={(e) =>
                    persistCells(
                      cells.map((x) =>
                        x.id === c.id
                          ? {
                              ...x,
                              inputs: e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            }
                          : x,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-[11px]"
                  onClick={() => persistCells(cells.filter((x) => x.id !== c.id))}
                >
                  Del
                </button>
              </div>
              <textarea
                className="h-28 w-full resize-none rounded border border-border px-2 py-2 font-mono text-[11px] outline-none"
                spellCheck={false}
                value={c.body}
                onChange={(e) =>
                  persistCells(cells.map((x) => (x.id === c.id ? { ...x, body: e.target.value } : x)))
                }
              />
            </div>
          ))}
        </div>
        <div ref={outRef} className="min-h-0 overflow-auto p-3" />
      </div>
    </div>
  );
}

export function ObservableNoteEditorHost(props: NoteTypeReactEditorProps): React.ReactElement {
  return <ObservableNoteEditor note={props.note} persistToNotesStore={props.persistToNotesStore} />;
}
