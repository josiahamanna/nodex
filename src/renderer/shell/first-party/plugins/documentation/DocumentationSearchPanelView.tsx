import React, { useCallback, useEffect, useState } from "react";
import { useNodexCommands } from "../../../NodexContributionContext";
import type { CommandContribution } from "../../../nodex-contribution-registry";
import type { ShellViewComponentProps } from "../../../views/ShellViewRegistry";
import { DOCS_BC, type DocsBcMessage } from "./documentationConstants";

function esc(s: string): string {
  return String(s || "").replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] ?? ch),
  );
}

export function DocumentationSearchPanelView(_props: ShellViewComponentProps): React.ReactElement {
  const commands = useNodexCommands();
  const [q, setQ] = useState("");
  const [miniOnly, setMiniOnly] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const postBc = useCallback((msg: DocsBcMessage) => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(DOCS_BC);
    bc.postMessage(msg);
    bc.close();
  }, []);

  useEffect(() => {
    const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(DOCS_BC) : null;
    if (!bc) return () => {};
    const onMsg = (ev: MessageEvent<DocsBcMessage>) => {
      const d = ev.data;
      if (d?.type === "docs.setMiniOnly" && typeof d.miniOnly === "boolean") {
        setMiniOnly(d.miniOnly);
      }
    };
    bc.addEventListener("message", onMsg);
    return () => {
      bc.removeEventListener("message", onMsg);
      bc.close();
    };
  }, []);

  const norm = (s: string) => String(s || "").toLowerCase().trim();
  const label = (c: CommandContribution) =>
    c.category ? `${c.category}: ${c.title}` : c.title;
  const matches = (c: CommandContribution, query: string) => {
    if (!query) return true;
    const argText =
      c.api?.args?.map((a) => `${a.name} ${a.type} ${a.description ?? ""}`).join(" ") ?? "";
    const h = norm(
      `${c.id} ${label(c)} ${c.doc || ""} ${c.sourcePluginId ?? ""} ${c.api?.summary ?? ""} ${c.api?.details ?? ""} ${argText}`,
    );
    return query
      .split(/\s+/)
      .filter(Boolean)
      .every((p) => h.includes(p));
  };

  const filtered = commands
    .filter((c) => !miniOnly || c.miniBar !== false)
    .filter((c) => matches(c, norm(q)))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const selected = selectedId ? commands.find((x) => x.id === selectedId) : null;

  return (
    <div className="flex h-full min-h-0 flex-col text-[12px]">
      <div className="shrink-0 border-b border-border px-2.5 py-2 text-[12px] font-bold opacity-85">
        Search commands
      </div>
      <input
        className="mx-2.5 mt-2 box-border w-[calc(100%-20px)] border border-border px-2.5 py-2 text-[12px] outline-none"
        placeholder="Filter by id, title, doc…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 text-[11px] opacity-65">
        <span>{filtered.length} match(es)</span>
        <button
          type="button"
          className="rounded border border-border bg-muted/20 px-2 py-1 text-[10px]"
          onClick={() => postBc({ type: "docs.refreshCommands" })}
        >
          Refresh other panels
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-auto px-2 pb-2">
        {filtered.slice(0, 300).map((c) => (
          <button
            key={c.id}
            type="button"
            className="w-full border border-border/80 bg-muted/10 px-2 py-1.5 text-left hover:bg-muted/40"
            onClick={() => {
              setSelectedId(c.id);
              postBc({ type: "docs.showCommand", commandId: c.id });
            }}
          >
            <div className="font-mono text-[10px]">{esc(c.id)}</div>
            <div className="text-[11px] opacity-80">{esc(label(c))}</div>
          </button>
        ))}
      </div>
      {selected ? (
        <div className="shrink-0 border-t border-border bg-muted/10 p-2.5 text-[11px] text-muted-foreground">
          <span className="font-mono text-[10px] text-foreground">{esc(selected.id)}</span>
          <span className="mx-1 opacity-40">·</span>
          <span>Full text is in the primary area →</span>
        </div>
      ) : (
        <div className="shrink-0 border-t border-border p-2 text-[11px] opacity-50">
          Select a command (details open in the primary column)
        </div>
      )}
    </div>
  );
}
