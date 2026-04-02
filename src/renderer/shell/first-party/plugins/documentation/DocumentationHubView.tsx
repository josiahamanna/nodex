import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Note } from "@nodex/ui-types";
import MarkdownRenderer from "../../../../components/renderers/MarkdownRenderer";
import { resolveCommandApiDoc } from "../../../command-api-metadata";
import { useNodexContributionRegistry } from "../../../NodexContributionContext";
import { DOCS_BC, type DocsBcMessage } from "./documentationConstants";
import { resolvedCommandDocToMarkdown } from "./documentationCommandMarkdown";

function esc(s: string): string {
  return String(s || "").replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] ?? ch),
  );
}

/**
 * **Main area** for the Documentation plugin: command API as a markdown note when the user picks a row
 * in the side panel search list (`docs.showCommand` over {@link DOCS_BC}).
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

  const commandMarkdownNote = useMemo((): Note | null => {
    if (!doc) return null;
    return {
      id: `documentation-hub-command:${doc.commandId}`,
      type: "markdown",
      title: doc.commandId,
      content: resolvedCommandDocToMarkdown(doc),
    };
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

  const docHubDismissBtn =
    "shrink-0 rounded-md border border-border/60 bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/40";

  if (bundledNoteId) {
    if (bundledLoading) {
      return (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 justify-end border-b border-border px-3 py-2">
            <button type="button" className={docHubDismissBtn} onClick={() => setBundledNoteId(null)}>
              Close
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-5 text-[13px] text-muted-foreground">
            Loading guide…
          </div>
        </div>
      );
    }
    if (bundledError) {
      return (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 justify-end border-b border-border px-3 py-2">
            <button type="button" className={docHubDismissBtn} onClick={() => setBundledNoteId(null)}>
              Close
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-5 text-[13px] text-destructive">
            <p className="font-medium">Could not load this guide</p>
            <p className="text-muted-foreground">{esc(bundledError)}</p>
          </div>
        </div>
      );
    }
    if (!bundledNote) {
      return (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 justify-end border-b border-border px-3 py-2">
            <button type="button" className={docHubDismissBtn} onClick={() => setBundledNoteId(null)}>
              Close
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-5 text-[13px] text-muted-foreground">
            <p className="font-medium text-foreground">Guide not available</p>
            <p>
              This note id is not in the current workspace, or notes have not finished loading. Open a project and
              ensure bundled docs have seeded.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-col overflow-auto">
        <div className="shrink-0 border-b border-border px-5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Bundled guide (read-only)
              </div>
              <h1 className="mt-1 text-lg font-semibold text-foreground">{esc(bundledNote.title)}</h1>
            </div>
            <button type="button" className={docHubDismissBtn} onClick={() => setBundledNoteId(null)}>
              Close
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <MarkdownRenderer note={bundledNote} />
        </div>
      </div>
    );
  }

  if (!doc || !commandMarkdownNote) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-5 text-[13px] text-muted-foreground">
        <p className="text-foreground">
          <strong>Documentation</strong> — use the <strong>Guides</strong> tab in the side panel for bundled
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 justify-end border-b border-border px-3 py-2">
        <button type="button" className={docHubDismissBtn} onClick={() => setCommandId(null)}>
          Back to overview
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <MarkdownRenderer note={commandMarkdownNote} />
      </div>
    </div>
  );
}
