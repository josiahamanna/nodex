import DOMPurify from "dompurify";
import { Inspector } from "@observablehq/inspector";
import { Runtime } from "@observablehq/runtime";
import { Library } from "@observablehq/stdlib";
import { createNotebookCellGlobalThisProxy } from "./observable-notebook-cell-globals";
import type { NormalizedNotebookCell } from "./observable-notebook-types";

function isHtmlPayload(value: unknown): value is { html: string } {
  return (
    !!value &&
    typeof value === "object" &&
    "html" in value &&
    typeof (value as { html: unknown }).html === "string"
  );
}

function wrapInspectorForHtml(slot: HTMLElement, makeObserver: () => Inspector) {
  return () => {
    const inspector = makeObserver();
    return {
      pending() {
        inspector.pending();
      },
      fulfilled(value: unknown, name?: string) {
        if (isHtmlPayload(value)) {
          while (slot.firstChild) slot.removeChild(slot.firstChild);
          const wrap = document.createElement("div");
          wrap.className = "nodex-notebook-html";
          wrap.innerHTML = DOMPurify.sanitize(value.html);
          slot.appendChild(wrap);
          return;
        }
        return inspector.fulfilled(value, name);
      },
      rejected(error: unknown, name?: string) {
        return inspector.rejected(error, name);
      },
    };
  };
}

export type TrustedRunMeta = {
  runId: number;
  startedAt: number;
};

export function runObservableNotebookTrusted(opts: {
  cells: NormalizedNotebookCell[];
  /** Mount each cell's inspector here; use a detached element if no UI slot (e.g. dependency-only). */
  getOutputSlot: (cellId: string) => HTMLElement | null;
  nodexFactory: () => unknown;
  signal?: AbortSignal;
  meta: TrustedRunMeta;
  onCellFinished?: (cellId: string, ms: number, errorMessage?: string) => void;
}): { dispose: () => void } {
  const { cells, getOutputSlot, nodexFactory, signal, meta, onCellFinished } = opts;

  const lib = new Library();
  const cellGlobalThis = createNotebookCellGlobalThisProxy();
  const builtins: Record<string, unknown> = {
    ...lib,
    nodex: nodexFactory,
    /** Shadowed into each cell so `globalThis`/`window` omit `document` (see cell wrapper). */
    __nb_global: cellGlobalThis,
  };
  const runtime = new Runtime(builtins as never);
  const mod = runtime.module();

  for (const c of cells) {
    if (c.kind === "md") continue;

    const root = getOutputSlot(c.id);
    const block = document.createElement("div");
    block.dataset.cellId = c.id;
    block.className = "nodex-notebook-cell-out";
    const errSlot = document.createElement("div");
    errSlot.className = "nodex-notebook-cell-error mb-1 hidden text-[11px] text-destructive";
    const slot = document.createElement("div");
    block.appendChild(errSlot);
    block.appendChild(slot);
    if (root) {
      root.innerHTML = "";
      root.appendChild(block);
    }

    const makeObserver = Inspector.into(slot);
    const wrappedObserver = wrapInspectorForHtml(slot, makeObserver);

    const t0 = performance.now();
    mod.variable(wrappedObserver).define(
      c.name,
      [...c.inputs, "nodex", "__nb_global"],
      (...args: unknown[]) => {
        if (signal?.aborted) {
          const e = new DOMException("Aborted", "AbortError");
          onCellFinished?.(c.id, performance.now() - t0, e.message);
          throw e;
        }
        const nbGlobalVal = args[args.length - 1];
        const nodexVal = args[args.length - 2];
        const inArgs = args.slice(0, -2);
        let fn: (...a: unknown[]) => unknown;
        try {
          fn = new Function(
            ...c.inputs,
            "nodex",
            "__nb_global",
            `"use strict"; return (async () => { const globalThis = __nb_global; const window = __nb_global; return (${c.body}); })();`,
          ) as (...a: unknown[]) => unknown;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errSlot.textContent = msg;
          errSlot.classList.remove("hidden");
          onCellFinished?.(c.id, performance.now() - t0, msg);
          throw e;
        }
        return Promise.resolve()
          .then(() => fn(...inArgs, nodexVal, nbGlobalVal))
          .then(
            (v) => {
              onCellFinished?.(c.id, performance.now() - t0);
              return v;
            },
            (e: unknown) => {
              const msg = e instanceof Error ? e.message : String(e);
              errSlot.textContent = msg;
              errSlot.classList.remove("hidden");
              onCellFinished?.(c.id, performance.now() - t0, msg);
              throw e;
            },
          );
      },
    );
  }

  return {
    dispose: () => {
      try {
        runtime.dispose();
      } catch {
        /* ignore */
      }
    },
  };
}
