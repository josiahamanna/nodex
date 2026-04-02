import DOMPurify from "dompurify";
import { Inspector } from "@observablehq/inspector";
import { Runtime } from "@observablehq/runtime";
import { Library } from "@observablehq/stdlib";
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
  outputRoot: HTMLElement;
  nodexFactory: () => unknown;
  signal?: AbortSignal;
  meta: TrustedRunMeta;
  onCellFinished?: (cellId: string, ms: number, errorMessage?: string) => void;
}): { dispose: () => void } {
  const { cells, outputRoot, nodexFactory, signal, meta, onCellFinished } = opts;
  outputRoot.innerHTML = "";

  const lib = new Library();
  const builtins: Record<string, unknown> = { ...lib, nodex: nodexFactory };
  const runtime = new Runtime(builtins as never);
  const mod = runtime.module();

  for (const c of cells) {
    if (c.kind === "md") continue;

    const block = document.createElement("div");
    block.dataset.cellId = c.id;
    block.className = "mb-2.5 rounded-lg border border-border p-2.5";
    const h = document.createElement("div");
    h.className = "mb-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] opacity-70";
    const title = document.createElement("span");
    title.textContent = c.name;
    const metaEl = document.createElement("span");
    metaEl.className = "text-[10px] opacity-60";
    metaEl.textContent = `#${meta.runId}`;
    h.appendChild(title);
    h.appendChild(metaEl);
    const errSlot = document.createElement("div");
    errSlot.className = "nodex-notebook-cell-error mb-1 hidden text-[11px] text-destructive";
    const slot = document.createElement("div");
    block.appendChild(h);
    block.appendChild(errSlot);
    block.appendChild(slot);
    outputRoot.appendChild(block);

    const makeObserver = Inspector.into(slot);
    const wrappedObserver = wrapInspectorForHtml(slot, makeObserver);

    const t0 = performance.now();
    mod.variable(wrappedObserver).define(
      c.name,
      [...c.inputs, "nodex"],
      (...args: unknown[]) => {
        if (signal?.aborted) {
          const e = new DOMException("Aborted", "AbortError");
          onCellFinished?.(c.id, performance.now() - t0, e.message);
          throw e;
        }
        const nodexVal = args[args.length - 1];
        const inArgs = args.slice(0, -1);
        let fn: (...a: unknown[]) => unknown;
        try {
          fn = new Function(
            ...c.inputs,
            "nodex",
            `"use strict"; return (async () => { return (${c.body}); })();`,
          ) as (...a: unknown[]) => unknown;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errSlot.textContent = msg;
          errSlot.classList.remove("hidden");
          onCellFinished?.(c.id, performance.now() - t0, msg);
          throw e;
        }
        return Promise.resolve()
          .then(() => fn(...inArgs, nodexVal))
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
