import React, { useEffect, useState } from "react";
import type { Note } from "@nodex/ui-types";
import MarkdownRenderer from "../../../../components/renderers/MarkdownRenderer";
import { useShellProjectWorkspace } from "../../../useShellProjectWorkspace";
import { fetchBundledDocumentationNote } from "./documentationFetchBundledNote";

function esc(s: string): string {
  return String(s || "").replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] ?? ch),
  );
}

type Props = {
  logicalId: string;
  className?: string;
};

/**
 * Renders a seeded bundled-doc note (read-only) from the workspace / WPN DB.
 */
export function DocumentationBundledMarkdownPanel({ logicalId, className }: Props): React.ReactElement {
  const { mountKind } = useShellProjectWorkspace();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNote(null);
    void (async () => {
      try {
        const n = await fetchBundledDocumentationNote(logicalId, mountKind);
        if (!cancelled) {
          setNote(n);
          setLoading(false);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logicalId, mountKind]);

  const wrap = className ?? "text-[11px] leading-relaxed text-foreground";

  if (loading) {
    return <div className={`${wrap} p-1 text-muted-foreground`}>Loading…</div>;
  }
  if (error) {
    return (
      <div className={`${wrap} space-y-1 p-1 text-destructive`}>
        <p className="font-medium">Could not load this note from the database.</p>
        <p className="text-muted-foreground">{esc(error)}</p>
        <p className="text-muted-foreground">
          Open a project so bundled documentation can seed, or try Refresh all in the header.
        </p>
      </div>
    );
  }
  if (!note) {
    return <div className={`${wrap} p-1 text-muted-foreground`}>No content.</div>;
  }

  return (
    <div className={wrap}>
      <MarkdownRenderer note={note} />
    </div>
  );
}
