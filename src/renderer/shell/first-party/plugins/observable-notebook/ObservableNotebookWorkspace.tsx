import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { setNotebookSandboxCommandInvoker } from "../../../notebookSandboxBridge";
import { runNotebookCellsInSandbox, type NotebookSandboxCellResult } from "../../../scriptHost";
import { NotebookCellEditor } from "./NotebookCellEditor";
import {
  createNotebookNodexHost,
  NODEX_NOTEBOOK_DOCUMENTED_COMMANDS,
} from "./observable-notebook-nodex-api";
import { runObservableNotebookTrusted } from "./observable-notebook-run-trusted";
import {
  makeNotebookCellId,
  type NotebookCell,
  normalizeNotebookCells,
} from "./observable-notebook-types";
import { useTheme } from "../../../../theme/ThemeContext";

const mdPreviewClass =
  "mt-2 rounded border border-border bg-muted/20 p-2 text-[11px] text-foreground [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4";

export type ObservableNotebookWorkspaceProps = {
  cells: NotebookCell[];
  onCellsChange: (next: NotebookCell[]) => void;
  invokeCommand: (commandId: string, args?: Record<string, unknown>) => void | Promise<void>;
  /** Shown on the right of the toolbar (e.g. scratch vs project note). */
  toolbarHint?: React.ReactNode;
  showSaveNow?: boolean;
  onSaveNow?: () => void;
  /** Scratch notebook: run once when the workspace mounts. */
  executeOnMount?: boolean;
  /** Note editor: re-run when this key changes (e.g. note id). */
  executeWhenKeyChanges?: string;
};

export function ObservableNotebookWorkspace(props: ObservableNotebookWorkspaceProps): React.ReactElement {
  const {
    cells,
    onCellsChange,
    invokeCommand,
    toolbarHint,
    showSaveNow,
    onSaveNow,
    executeOnMount = false,
    executeWhenKeyChanges,
  } = props;
  const { resolvedDark } = useTheme();

  const [err, setErr] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const [lastRunLabel, setLastRunLabel] = useState<string | null>(null);

  const outRef = useRef<HTMLDivElement>(null);
  const trustedDisposeRef = useRef<(() => void) | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const executeKeySeenRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    setNotebookSandboxCommandInvoker((commandId: string, args?: Record<string, unknown>) =>
      invokeCommand(commandId, args),
    );
    return () => setNotebookSandboxCommandInvoker(undefined);
  }, [invokeCommand]);

  const clearOutputs = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    trustedDisposeRef.current?.();
    trustedDisposeRef.current = null;
    if (outRef.current) outRef.current.innerHTML = "";
    setLastRunLabel(null);
  }, []);

  const run = useCallback(async () => {
    const root = outRef.current;
    if (!root) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    trustedDisposeRef.current?.();
    trustedDisposeRef.current = null;
    root.innerHTML = "";
    setErr(null);

    runIdRef.current += 1;
    const meta = { runId: runIdRef.current, startedAt: Date.now() };
    const norm = normalizeNotebookCells(cells);
    const t0 = performance.now();

    try {
      if (sandbox) {
        const payload = norm.map((c) => ({
          name: c.name,
          inputs: c.inputs,
          body: c.body,
          kind: c.kind,
        }));
        const results = await runNotebookCellsInSandbox(payload);
        const renderSandboxRow = (r: NotebookSandboxCellResult): void => {
          const block = document.createElement("div");
          block.className = "mb-2.5 rounded-lg border border-border p-2.5";
          const h = document.createElement("div");
          h.className = "mb-1.5 font-mono text-[11px] opacity-70";
          h.textContent = r.name;
          block.appendChild(h);
          if ("skipped" in r) {
            const p = document.createElement("p");
            p.className = "text-[11px] opacity-60";
            p.textContent = "(markdown — not executed in sandbox)";
            block.appendChild(p);
          } else if (r.ok) {
            const pre = document.createElement("pre");
            pre.className =
              "max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] opacity-90";
            pre.textContent = r.serialized;
            block.appendChild(pre);
          } else {
            const er = document.createElement("div");
            er.className = "text-[11px] text-destructive";
            er.textContent = r.error;
            block.appendChild(er);
          }
          root.appendChild(block);
        };
        for (const r of results) renderSandboxRow(r);
      } else {
        const nodex = createNotebookNodexHost(invokeCommand);
        const { dispose } = runObservableNotebookTrusted({
          cells: norm,
          outputRoot: root,
          nodexFactory: () => nodex,
          signal: ac.signal,
          meta,
        });
        trustedDisposeRef.current = dispose;
      }
      const ms = Math.round(performance.now() - t0);
      setLastRunLabel(`Run #${meta.runId} · ${ms}ms${sandbox ? " (sandbox)" : ""}`);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return;
      }
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [cells, invokeCommand, sandbox]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      trustedDisposeRef.current?.();
      trustedDisposeRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!autoRun) return;
    const id = window.setTimeout(() => {
      void run();
    }, 550);
    return () => window.clearTimeout(id);
  }, [cells, autoRun, run]);

  useEffect(() => {
    if (!executeOnMount) return;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial scratch run only
  }, []);

  useEffect(() => {
    if (executeWhenKeyChanges === undefined) return;
    if (executeKeySeenRef.current === executeWhenKeyChanges) return;
    executeKeySeenRef.current = executeWhenKeyChanges;
    void run();
  }, [executeWhenKeyChanges, run]);

  const addJsCell = useCallback(() => {
    onCellsChange([
      ...cells,
      { id: makeNotebookCellId(), name: `cell${cells.length + 1}`, inputs: [], body: "0", kind: "js" },
    ]);
  }, [cells, onCellsChange]);

  const addMdCell = useCallback(() => {
    onCellsChange([
      ...cells,
      {
        id: makeNotebookCellId(),
        name: `md${cells.length + 1}`,
        inputs: [],
        body: "## Markdown\n\nNarrative cell (not executed).",
        kind: "md",
      },
    ]);
  }, [cells, onCellsChange]);

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
          onClick={clearOutputs}
        >
          Clear outputs
        </button>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] opacity-85">
          <input
            type="checkbox"
            checked={sandbox}
            onChange={(e) => {
              setSandbox(e.target.checked);
              clearOutputs();
            }}
          />
          Sandbox
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] opacity-85">
          <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />
          Auto-run
        </label>
        <button
          type="button"
          className="rounded border border-border bg-muted/20 px-2.5 py-1.5 text-[12px]"
          onClick={addJsCell}
        >
          Add JS cell
        </button>
        <button
          type="button"
          className="rounded border border-border bg-muted/20 px-2.5 py-1.5 text-[12px]"
          onClick={addMdCell}
        >
          Add markdown
        </button>
        {showSaveNow && onSaveNow ? (
          <button
            type="button"
            className="rounded border border-border bg-muted/20 px-2.5 py-1.5 text-[12px]"
            onClick={() => onSaveNow()}
          >
            Save now
          </button>
        ) : null}
        {lastRunLabel ? (
          <span className="text-[10px] opacity-60">{lastRunLabel}</span>
        ) : null}
        {toolbarHint ? <span className="ml-auto text-[11px] opacity-65">{toolbarHint}</span> : null}
      </div>
      {err ? (
        <div className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          {err}
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-0 divide-x divide-border">
        <div className="min-h-0 overflow-auto p-3">
          <p className="mb-2 text-[11px] leading-relaxed opacity-70">
            JS cells use <code className="font-mono">@observablehq/runtime</code> plus stdlib builtins;{" "}
            <code className="font-mono">nodex</code> calls shell commands.{" "}
            <kbd className="rounded border border-border px-0.5 font-mono">Mod+Enter</kbd> runs the notebook.
            Sandbox mode runs sequentially without the reactive graph (stdio-style output).
          </p>
          <details className="mb-3 text-[10px] opacity-70">
            <summary className="cursor-pointer select-none">Documented command ids</summary>
            <ul className="mt-1 list-inside list-disc font-mono">
              {NODEX_NOTEBOOK_DOCUMENTED_COMMANDS.map((id) => (
                <li key={id}>{id}</li>
              ))}
            </ul>
          </details>
          {cells.map((c, idx) => {
            const others = cells
              .map((x) => x.name.trim())
              .filter((n, i) => n && i !== idx);
            const completionNames = Array.from(new Set([...others, ...c.inputs]));

            return (
              <div key={c.id} className="mb-2.5 rounded-lg border border-border p-2.5">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase opacity-50">{c.kind === "md" ? "md" : "js"}</span>
                  <input
                    className="w-40 rounded border border-border px-2 py-1 font-mono text-[11px]"
                    placeholder="name"
                    value={c.name}
                    onChange={(e) =>
                      onCellsChange(
                        cells.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)),
                      )
                    }
                  />
                  <input
                    className="w-52 rounded border border-border px-2 py-1 font-mono text-[11px]"
                    placeholder="inputs: a, b"
                    value={c.inputs.join(", ")}
                    onChange={(e) =>
                      onCellsChange(
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
                    className="rounded border border-border px-2 py-1 text-[10px]"
                    onClick={() =>
                      onCellsChange(
                        cells.map((x) =>
                          x.id === c.id ? { ...x, kind: x.kind === "md" ? "js" : "md" } : x,
                        ),
                      )
                    }
                  >
                    {c.kind === "md" ? "→ JS" : "→ MD"}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-[11px]"
                    onClick={() => onCellsChange(cells.filter((x) => x.id !== c.id))}
                  >
                    Del
                  </button>
                </div>
                {c.kind === "md" ? (
                  <>
                    <textarea
                      className="mb-2 h-28 w-full resize-none rounded border border-border px-2 py-2 font-mono text-[11px] outline-none"
                      spellCheck={false}
                      value={c.body}
                      onChange={(e) =>
                        onCellsChange(
                          cells.map((x) => (x.id === c.id ? { ...x, body: e.target.value } : x)),
                        )
                      }
                    />
                    <div className={mdPreviewClass}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeSanitize, defaultSchema]]}>
                        {c.body}
                      </ReactMarkdown>
                    </div>
                  </>
                ) : (
                  <NotebookCellEditor
                    value={c.body}
                    onChange={(body) =>
                      onCellsChange(cells.map((x) => (x.id === c.id ? { ...x, body } : x)))
                    }
                    completionCellNames={completionNames}
                    dark={resolvedDark}
                    onModEnter={() => void run()}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div ref={outRef} className="min-h-0 overflow-auto p-3" />
      </div>
    </div>
  );
}
