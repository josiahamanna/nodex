import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Note } from "@nodex/ui-types";
import MarkdownRenderer from "../../../../components/renderers/MarkdownRenderer";
import { resolveCommandApiDoc } from "../../../command-api-metadata";
import { useNodexContributionRegistry } from "../../../NodexContributionContext";
import { DOCS_BC, type DocsBcMessage } from "./documentationConstants";

function esc(s: string): string {
  return String(s || "").replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] ?? ch),
  );
}

function JsonBlock({ value }: { value: unknown }): React.ReactElement {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
      {text}
    </pre>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * **Primary area (main column)** for the Documentation plugin: full command API contract
 * when the user picks a row in the sidebar search list (`docs.showCommand` over {@link DOCS_BC}).
 */
export function DocumentationHubView(_props: { viewId: string; title: string }): React.ReactElement {
  const registry = useNodexContributionRegistry();
  const [commandId, setCommandId] = useState<string | null>(null);
  const [bundledNoteId, setBundledNoteId] = useState<string | null>(null);
  const [bundledNote, setBundledNote] = useState<Note | null>(null);
  const [bundledLoading, setBundledLoading] = useState(false);
  const [bundledError, setBundledError] = useState<string | null>(null);

  const registryRev = useSyncExternalStore(
    (onChange) => registry.subscribe(onChange),
    () => registry.getSnapshotVersion(),
    () => 0,
  );

  const cmd = useMemo(() => {
    if (!commandId) return null;
    return registry.getCommand(commandId) ?? null;
  }, [commandId, registry, registryRev]);

  const doc = useMemo(() => (cmd ? resolveCommandApiDoc(cmd) : null), [cmd]);

  /** Must run every render — do not place after a conditional return (React #310). */
  const invokeExample = useMemo(() => {
    if (!doc) {
      return { commandId: "", args: {} as Record<string, unknown> | null };
    }
    const base = { commandId: doc.commandId };
    if (doc.exampleInvoke === null) return { ...base, args: null };
    if (doc.exampleInvoke && typeof doc.exampleInvoke === "object") {
      return { ...base, args: doc.exampleInvoke };
    }
    if (doc.args && doc.args.length > 0) {
      const o: Record<string, unknown> = {};
      for (const a of doc.args) {
        if (a.example !== undefined) o[a.name] = a.example;
        else if (a.default !== undefined) o[a.name] = a.default;
      }
      return Object.keys(o).length > 0 ? { ...base, args: o } : { ...base, args: {} };
    }
    return { ...base, args: {} };
  }, [doc]);

  useEffect(() => {
    const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(DOCS_BC) : null;
    if (!bc) return () => {};
    const onMsg = (ev: MessageEvent<DocsBcMessage>) => {
      const d = ev.data;
      if (d?.type === "docs.showCommand" && typeof d.commandId === "string") {
        setBundledNoteId(null);
        setCommandId(d.commandId);
      }
      if (d?.type === "docs.showBundledDoc" && typeof d.noteId === "string") {
        setCommandId(null);
        setBundledNoteId(d.noteId);
      }
    };
    bc.addEventListener("message", onMsg);
    return () => {
      bc.removeEventListener("message", onMsg);
      bc.close();
    };
  }, []);

  useEffect(() => {
    if (!bundledNoteId) {
      setBundledNote(null);
      setBundledError(null);
      setBundledLoading(false);
      return;
    }
    setBundledLoading(true);
    setBundledError(null);
    void window.Nodex.getNote(bundledNoteId)
      .then((n) => {
        setBundledNote(n);
        setBundledLoading(false);
      })
      .catch((e: unknown) => {
        setBundledError(e instanceof Error ? e.message : String(e));
        setBundledLoading(false);
      });
  }, [bundledNoteId]);

  if (bundledNoteId) {
    if (bundledLoading) {
      return (
        <div className="flex h-full min-h-0 items-center justify-center p-5 text-[13px] text-muted-foreground">
          Loading guide…
        </div>
      );
    }
    if (bundledError) {
      return (
        <div className="flex h-full min-h-0 flex-col gap-2 p-5 text-[13px] text-destructive">
          <p className="font-medium">Could not load this guide</p>
          <p className="text-muted-foreground">{esc(bundledError)}</p>
        </div>
      );
    }
    if (!bundledNote) {
      return (
        <div className="flex h-full min-h-0 flex-col gap-2 p-5 text-[13px] text-muted-foreground">
          <p className="font-medium text-foreground">Guide not available</p>
          <p>
            This note id is not in the current workspace, or notes have not finished loading. Open a project and
            ensure bundled docs have seeded.
          </p>
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-col overflow-auto">
        <div className="shrink-0 border-b border-border px-5 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Bundled guide (read-only)
          </div>
          <h1 className="mt-1 text-lg font-semibold text-foreground">{esc(bundledNote.title)}</h1>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <MarkdownRenderer note={bundledNote} />
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-5 text-[13px] text-muted-foreground">
        <p className="text-foreground">
          <strong>Documentation</strong> — use the <strong>Guides</strong> tab in the sidebar for bundled
          plugin-authoring markdown (read-only), or <strong>Commands</strong> to browse the command API.
        </p>
        <p>
          Long-form shell and plugin topics also live in the repository under{" "}
          <code className="font-mono text-[11px] text-foreground">docs/bundled-plugin-authoring/</code> and are
          seeded into your workspace notes on startup.
        </p>
        <p>
          For a short in-app index, open the companion column’s{" "}
          <strong className="text-foreground">Plugin authoring</strong> tab (next to Keyboard / API / About).
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto p-5 text-[13px]">
      <header className="mb-5 border-b border-border pb-4">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Command identifier
        </div>
        <h1 className="mt-1 break-all font-mono text-lg text-foreground">{esc(doc.commandId)}</h1>
        <p className="mt-2 text-[14px] font-medium text-foreground">{esc(doc.summary)}</p>
        {doc.category ? (
          <p className="mt-1 text-[12px] text-muted-foreground">
            Category: <span className="text-foreground">{esc(doc.category)}</span>
          </p>
        ) : null}
      </header>

      <div className="space-y-6 text-[12px]">
        <section>
          <SectionTitle>Namespace</SectionTitle>
          <table className="w-full border-collapse border border-border text-[11px]">
            <tbody>
              <tr>
                <td className="border border-border bg-muted/30 px-2 py-1.5 font-medium text-muted-foreground">
                  Namespace
                </td>
                <td className="border border-border px-2 py-1.5 font-mono">{esc(doc.namespace)}</td>
              </tr>
              <tr>
                <td className="border border-border bg-muted/30 px-2 py-1.5 font-medium text-muted-foreground">
                  Short name
                </td>
                <td className="border border-border px-2 py-1.5 font-mono">{esc(doc.shortName)}</td>
              </tr>
              <tr>
                <td className="border border-border bg-muted/30 px-2 py-1.5 font-medium text-muted-foreground">
                  Fully qualified id
                </td>
                <td className="border border-border px-2 py-1.5 font-mono text-[10px]">{esc(doc.commandId)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <SectionTitle>Discovery flags</SectionTitle>
          <table className="w-full border-collapse border border-border text-[11px]">
            <tbody>
              <tr>
                <td className="border border-border bg-muted/30 px-2 py-1.5">palette</td>
                <td className="border border-border px-2 py-1.5 font-mono">{doc.palette ? "true" : "false"}</td>
              </tr>
              <tr>
                <td className="border border-border bg-muted/30 px-2 py-1.5">miniBar</td>
                <td className="border border-border px-2 py-1.5 font-mono">{doc.miniBar ? "true" : "false"}</td>
              </tr>
              {doc.sourcePluginId ? (
                <tr>
                  <td className="border border-border bg-muted/30 px-2 py-1.5">sourcePluginId</td>
                  <td className="border border-border px-2 py-1.5 font-mono">{esc(doc.sourcePluginId)}</td>
                </tr>
              ) : null}
              {doc.disambiguation ? (
                <tr>
                  <td className="border border-border bg-muted/30 px-2 py-1.5">disambiguation</td>
                  <td className="border border-border px-2 py-1.5">{esc(doc.disambiguation)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        {doc.apiDetails ? (
          <section>
            <SectionTitle>Extended description</SectionTitle>
            <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3 font-sans text-[12px] leading-relaxed text-foreground">
              {esc(doc.apiDetails)}
            </pre>
          </section>
        ) : null}

        {doc.proseDoc ? (
          <section>
            <SectionTitle>Documentation (prose)</SectionTitle>
            <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 font-sans text-[12px] leading-relaxed text-foreground">
              {esc(doc.proseDoc)}
            </pre>
          </section>
        ) : null}

        <section>
          <SectionTitle>Invoke — argument fields</SectionTitle>
          {doc.args && doc.args.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              This command declares <strong className="text-foreground">no arguments</strong>; pass{" "}
              <code className="font-mono text-[10px]">{"{}"}</code> or omit{" "}
              <code className="font-mono text-[10px]">args</code> when invoking.
            </p>
          ) : doc.args && doc.args.length > 0 ? (
            <table className="w-full border-collapse border border-border text-[11px]">
              <thead>
                <tr className="bg-muted/50">
                  <th className="border border-border px-2 py-1.5 text-left">Name</th>
                  <th className="border border-border px-2 py-1.5 text-left">Type</th>
                  <th className="border border-border px-2 py-1.5 text-left">Required</th>
                  <th className="border border-border px-2 py-1.5 text-left">Description</th>
                </tr>
              </thead>
              <tbody>
                {doc.args.map((a) => (
                  <tr key={a.name}>
                    <td className="border border-border px-2 py-1.5 font-mono text-[10px]">{esc(a.name)}</td>
                    <td className="border border-border px-2 py-1.5 font-mono text-[10px]">{esc(a.type)}</td>
                    <td className="border border-border px-2 py-1.5">{a.required ? "yes" : "no"}</td>
                    <td className="border border-border px-2 py-1.5 text-muted-foreground">
                      {esc(a.description ?? "—")}
                      {a.default !== undefined ? (
                        <span className="mt-0.5 block text-[10px] text-foreground">
                          default: <code className="font-mono">{esc(JSON.stringify(a.default))}</code>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              No per-field contract registered. The handler still receives an optional{" "}
              <code className="font-mono text-[10px]">Record&lt;string, unknown&gt;</code> when invoked
              programmatically.
            </p>
          )}
        </section>

        <section>
          <SectionTitle>JSON Schema — invoke <code className="normal-case">args</code> object</SectionTitle>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Shape of the second parameter to <code className="font-mono text-[10px]">invokeCommand(id, args)</code>{" "}
            / minibuffer JSON args.
          </p>
          <JsonBlock value={doc.argsJsonSchema} />
        </section>

        <section>
          <SectionTitle>Example — full invoke envelope</SectionTitle>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Typical payload when routing through the shell command service (conceptual JSON).
          </p>
          <JsonBlock value={invokeExample} />
        </section>

        <section>
          <SectionTitle>Return type</SectionTitle>
          <table className="w-full border-collapse border border-border text-[11px]">
            <tbody>
              <tr>
                <td className="border border-border bg-muted/30 px-2 py-1.5 font-medium">Type</td>
                <td className="border border-border px-2 py-1.5 font-mono text-[11px]">{esc(doc.returns.type)}</td>
              </tr>
              {doc.returns.description ? (
                <tr>
                  <td className="border border-border bg-muted/30 px-2 py-1.5 font-medium align-top">
                    Description
                  </td>
                  <td className="border border-border px-2 py-1.5">{esc(doc.returns.description)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
