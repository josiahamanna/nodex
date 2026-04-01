import React, { useCallback, useEffect, useState } from "react";
import { useShellRegistries } from "../../../registries/ShellRegistriesContext";
import type { ShellViewComponentProps } from "../../../views/ShellViewRegistry";
import type { ShellKeyBinding } from "../../../registries/ShellKeymapRegistry";
import { DOCS_BC } from "./documentationConstants";

export function DocumentationSettingsPanelView(_props: ShellViewComponentProps): React.ReactElement {
  const { keymap } = useShellRegistries();
  const [tab, setTab] = useState<1 | 2 | 3>(1);
  const [keys, setKeys] = useState<ShellKeyBinding[]>([]);
  const [apiText, setApiText] = useState<string>("");
  const [miniOnly, setMiniOnly] = useState(true);

  const refreshKeys = useCallback(() => {
    setKeys(keymap.list());
  }, [keymap]);

  const refreshApi = useCallback(() => {
    try {
      const shell = (window as unknown as { nodex?: { shell?: unknown } }).nodex?.shell as
        | Record<string, unknown>
        | undefined;
      if (!shell) {
        setApiText("window.nodex.shell not available");
        return;
      }
      const describeObj = (o: unknown) =>
        o && typeof o === "object"
          ? Object.keys(o as object)
              .sort()
              .map((k) => ({ key: k, type: typeof (o as Record<string, unknown>)[k] }))
          : [];
      const d: Record<string, Array<{ key: string; type: string }>> = {
        "window.nodex.shell": describeObj(shell),
      };
      for (const k of Object.keys(shell)) {
        const v = (shell as Record<string, unknown>)[k];
        d[`window.nodex.shell.${k}`] = describeObj(v);
      }
      const blocks: string[] = [];
      for (const name of Object.keys(d).sort()) {
        blocks.push(`${name}\n${JSON.stringify(d[name], null, 2)}`);
      }
      setApiText(blocks.join("\n\n"));
    } catch (e) {
      setApiText(String(e instanceof Error ? e.message : e));
    }
  }, []);

  useEffect(() => {
    refreshKeys();
    refreshApi();
  }, [refreshKeys, refreshApi]);

  const postBc = (msg: unknown) => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(DOCS_BC);
    bc.postMessage(msg);
    bc.close();
  };

  const toggleMini = () => {
    const next = !miniOnly;
    setMiniOnly(next);
    postBc({ type: "docs.setMiniOnly", miniOnly: next });
  };

  return (
    <div className="flex h-full min-h-0 flex-col text-[12px]">
      <div className="shrink-0 border-b border-border px-3 py-2.5 text-[12px] font-extrabold opacity-85">
        Documentation — settings
      </div>
      <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2.5">
        <button
          type="button"
          className="rounded border border-border bg-muted/20 px-2.5 py-1.5 text-[11px]"
          onClick={toggleMini}
        >
          Minibuffer-only: {miniOnly ? "on" : "off"}
        </button>
        <button
          type="button"
          className="rounded border border-border bg-muted/20 px-2.5 py-1.5 text-[11px]"
          onClick={() => {
            postBc({ type: "docs.refreshCommands" });
            refreshKeys();
            refreshApi();
          }}
        >
          Refresh all
        </button>
      </div>
      <div className="flex gap-1.5 border-b border-border px-3 py-2">
        <button
          type="button"
          className={`rounded border px-2.5 py-1 text-[11px] ${tab === 1 ? "border-border bg-muted/50" : "border-border/60"}`}
          onClick={() => setTab(1)}
        >
          Keyboard
        </button>
        <button
          type="button"
          className={`rounded border px-2.5 py-1 text-[11px] ${tab === 2 ? "border-border bg-muted/50" : "border-border/60"}`}
          onClick={() => setTab(2)}
        >
          API shape
        </button>
        <button
          type="button"
          className={`rounded border px-2.5 py-1 text-[11px] ${tab === 3 ? "border-border bg-muted/50" : "border-border/60"}`}
          onClick={() => setTab(3)}
        >
          About
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {tab === 1 ? (
          <div>
            <div className="mb-2 text-[12px] font-bold">Shortcuts (scraped)</div>
            <table className="w-full border-collapse border border-border text-[11px]">
              <thead>
                <tr className="bg-muted/40">
                  <th className="border border-border px-2 py-1.5 text-left">chord</th>
                  <th className="border border-border px-2 py-1.5 text-left">action</th>
                  <th className="border border-border px-2 py-1.5 text-left">command</th>
                  <th className="border border-border px-2 py-1.5 text-left">plugin</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="border border-border px-2 py-1 font-mono text-[10px]">{k.chord}</td>
                    <td className="border border-border px-2 py-1">{k.title}</td>
                    <td className="border border-border px-2 py-1 font-mono text-[10px]">{k.commandId}</td>
                    <td className="border border-border px-2 py-1 text-[10px]">{k.sourcePluginId ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {tab === 2 ? (
          <div>
            <div className="mb-2 text-[12px] font-bold">
              DevTools <code className="font-mono text-[11px]">window.nodex.shell.*</code>
            </div>
            <pre className="whitespace-pre-wrap border border-border bg-muted/20 p-2 font-mono text-[10px]">
              {apiText}
            </pre>
          </div>
        ) : null}
        {tab === 3 ? (
          <div className="text-[11px] leading-relaxed opacity-80">
            <code className="font-mono">plugin.documentation</code> scrapes the shell at runtime (commands,
            keymap, API introspection). Plugins should set <code className="font-mono">sourcePluginId</code> and{" "}
            <code className="font-mono">doc</code> on registered commands.
          </div>
        ) : null}
      </div>
    </div>
  );
}
