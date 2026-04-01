import React, { useCallback, useEffect, useState } from "react";
import { useNodexContributionRegistry } from "../../../NodexContributionContext";
import type { CommandContribution } from "../../../nodex-contribution-registry";
import type { ShellViewComponentProps } from "../../../views/ShellViewRegistry";
import { DOCS_BC } from "./documentationConstants";

function esc(s: string): string {
  return String(s || "").replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] ?? ch),
  );
}

export function DocumentationSearchPanelView(_props: ShellViewComponentProps): React.ReactElement {
  const registry = useNodexContributionRegistry();
  const [commands, setCommands] = useState<CommandContribution[]>([]);
  const [q, setQ] = useState("");
  const [miniOnly, setMiniOnly] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(() => {
    setCommands(registry.listCommands());
  }, [registry]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(DOCS_BC) : null;
    if (!bc) return () => {};
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data || {};
      if (d.type === "docs.setMiniOnly" && typeof d.miniOnly === "boolean") {
        setMiniOnly(d.miniOnly);
      }
      if (d.type === "docs.refreshCommands") load();
    };
    bc.addEventListener("message", onMsg);
    return () => {
      bc.removeEventListener("message", onMsg);
      bc.close();
    };
  }, [load]);

  const norm = (s: string) => String(s || "").toLowerCase().trim();
  const label = (c: CommandContribution) =>
    c.category ? `${c.category}: ${c.title}` : c.title;
  const matches = (c: CommandContribution, query: string) => {
    if (!query) return true;
    const h = norm(
      `${c.id} ${label(c)} ${c.doc || ""} ${c.sourcePluginId || ""}`,
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
          onClick={() => load()}
        >
          Reload list
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-auto px-2 pb-2">
        {filtered.slice(0, 300).map((c) => (
          <button
            key={c.id}
            type="button"
            className="w-full border border-border/80 bg-muted/10 px-2 py-1.5 text-left hover:bg-muted/40"
            onClick={() => setSelectedId(c.id)}
          >
            <div className="font-mono text-[10px]">{esc(c.id)}</div>
            <div className="text-[11px] opacity-80">{esc(label(c))}</div>
          </button>
        ))}
      </div>
      {selected ? (
        <div className="max-h-[40vh] shrink-0 overflow-auto border-t border-border p-2.5 text-[11px]">
          <div className="mb-1 flex flex-wrap gap-2">
            <span className="rounded border border-border px-1.5 py-0.5 text-[9px] opacity-75">id</span>
            <span className="font-mono text-[10px]">{esc(selected.id)}</span>
          </div>
          <div className="mb-1 flex flex-wrap gap-2">
            <span className="rounded border border-border px-1.5 py-0.5 text-[9px] opacity-75">title</span>
            <span>{esc(selected.title)}</span>
          </div>
          {selected.category ? (
            <div className="mb-1 flex flex-wrap gap-2">
              <span className="rounded border border-border px-1.5 py-0.5 text-[9px] opacity-75">
                category
              </span>
              <span>{esc(selected.category)}</span>
            </div>
          ) : null}
          {selected.sourcePluginId ? (
            <div className="mb-1 flex flex-wrap gap-2">
              <span className="rounded border border-border px-1.5 py-0.5 text-[9px] opacity-75">
                plugin
              </span>
              <span>{esc(selected.sourcePluginId)}</span>
            </div>
          ) : null}
          <div className="mt-2 text-[11px] opacity-65">doc</div>
          <pre className="mt-1 whitespace-pre-wrap break-words border border-border bg-muted/30 p-2 font-mono text-[10px]">
            {esc(selected.doc || "(no doc)")}
          </pre>
        </div>
      ) : (
        <div className="shrink-0 border-t border-border p-2 text-[11px] opacity-50">Select a command</div>
      )}
    </div>
  );
}
