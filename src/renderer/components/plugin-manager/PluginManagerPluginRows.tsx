import React from "react";
import type {
  PluginInventoryRow,
  PluginUiMeta,
  UserMessage,
} from "./plugin-manager-types";

type DepInfo = Awaited<
  ReturnType<typeof window.Nodex.getPluginResolvedDeps>
> | null;

type Props = {
  embedded: boolean;
  selectedPluginIdProp: string | null | undefined;
  idsForCards: string[];
  invFor: (id: string) => PluginInventoryRow | undefined;
  pluginUiMeta: Record<string, PluginUiMeta | null>;
  working: string | null;
  depPanelPlugin: string | null;
  depInfo: DepInfo;
  npmAddSpec: string;
  setNpmAddSpec: (v: string) => void;
  loadPlugins: () => Promise<void>;
  onPluginsChanged?: () => void;
  setMessage: (m: UserMessage) => void;
  onReloadRegistry: () => void;
  onInstallDeps: (pluginName: string) => void;
  onToggleDepPanel: (pluginName: string) => void;
  onBundleLocal: (pluginName: string) => void;
  onUninstall: (pluginName: string) => void;
  onNpmAdd: () => void;
  onNpmRemove: (pkg: string) => void;
};

export function PluginManagerPluginRows({
  embedded,
  selectedPluginIdProp,
  idsForCards,
  invFor,
  pluginUiMeta,
  working,
  depPanelPlugin,
  depInfo,
  npmAddSpec,
  setNpmAddSpec,
  loadPlugins,
  onPluginsChanged,
  setMessage,
  onReloadRegistry,
  onInstallDeps,
  onToggleDepPanel,
  onBundleLocal,
  onUninstall,
  onNpmAdd,
  onNpmRemove,
}: Props): React.ReactElement {
  return (
    <div>
      {!embedded ? (
        <h3 className="text-lg font-semibold text-foreground mb-3">
          Installed Plugins
        </h3>
      ) : (
        <h3 className="text-lg font-semibold text-foreground mb-3">
          Plugin detail
        </h3>
      )}

      {embedded && selectedPluginIdProp === null ? (
        <div className="text-muted-foreground py-8 text-[12px]">
          Select a plugin in the left list to view details, export, and
          dependency tools.
        </div>
      ) : idsForCards.length === 0 ? (
        <div className="text-muted-foreground text-center py-8">
          No plugins installed yet. Import a plugin to get started!
        </div>
      ) : (
        <div className="space-y-2">
          {idsForCards.map((plugin) => (
            <div
              key={plugin}
              className="flex flex-col gap-3 p-4 bg-muted/40 rounded-lg border border-border"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-medium text-foreground">{plugin}</h4>
                    {invFor(plugin)?.isBundled ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/80">
                        Core
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {invFor(plugin)?.loaded
                      ? "Loaded"
                      : invFor(plugin)?.enabled === false
                        ? "Disabled"
                        : "Not loaded"}
                  </p>
                  {invFor(plugin)?.canToggle ? (
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px] text-foreground">
                      <input
                        type="checkbox"
                        checked={invFor(plugin)?.enabled !== false}
                        disabled={working !== null}
                        onChange={async (e) => {
                          const r = await window.Nodex.setPluginEnabled(
                            plugin,
                            e.target.checked,
                          );
                          if (r.success) {
                            await loadPlugins();
                            onPluginsChanged?.();
                          } else {
                            setMessage({
                              type: "error",
                              text: r.error ?? "Could not update plugin",
                            });
                          }
                        }}
                        className="h-3.5 w-3.5 rounded-sm border-border"
                      />
                      Enabled
                    </label>
                  ) : null}
                  {pluginUiMeta[plugin]?.designSystemWarning ? (
                    <p className="mt-1 text-xs text-foreground/85">
                      {pluginUiMeta[plugin]!.designSystemWarning}
                    </p>
                  ) : null}
                  {pluginUiMeta[plugin]?.theme === "isolated" ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      UI theme: isolated (host tokens not injected)
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => void onReloadRegistry()}
                    disabled={working !== null}
                    className="rounded border border-border bg-muted/50 px-3 py-1 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    Reload registry
                  </button>
                  <button
                    type="button"
                    onClick={() => onInstallDeps(plugin)}
                    disabled={working !== null}
                    className="rounded border border-border bg-muted/50 px-3 py-1 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {working === `install:${plugin}`
                      ? "Installing…"
                      : "Install deps"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleDepPanel(plugin)}
                    disabled={working !== null}
                    className="rounded border border-border bg-muted/50 px-3 py-1 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {depPanelPlugin === plugin ? "Close deps" : "Dependencies"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onBundleLocal(plugin)}
                    disabled={working !== null}
                    className="rounded border border-border bg-muted/50 px-3 py-1 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    Bundle to dist/
                  </button>
                  <button
                    type="button"
                    onClick={() => onUninstall(plugin)}
                    disabled={working !== null}
                    className="rounded border border-border bg-muted/50 px-3 py-1 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    Uninstall
                  </button>
                </div>
              </div>

              {depPanelPlugin === plugin && depInfo && (
                <div className="border-t border-border pt-3 text-sm">
                  <p className="text-muted-foreground mb-2">
                    Declared in cache{" "}
                    <code className="rounded bg-muted px-1 text-xs">
                      package.json
                    </code>{" "}
                    vs resolved top-level (npm ls).
                  </p>
                  {depInfo.error && (
                    <p className="mb-2 text-xs text-foreground/85">
                      {depInfo.error}
                    </p>
                  )}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <p className="font-medium text-foreground mb-1">
                        Declared
                      </p>
                      <ul className="text-xs font-mono space-y-1 max-h-32 overflow-auto">
                        {Object.entries(depInfo.declared).map(([k, v]) => (
                          <li key={k}>
                            {k}@{v}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-foreground mb-1">
                        Resolved
                      </p>
                      <ul className="text-xs font-mono space-y-1 max-h-32 overflow-auto">
                        {Object.entries(depInfo.resolved).map(([k, v]) => (
                          <li
                            key={k}
                            className="flex justify-between gap-2 items-center"
                          >
                            <span>
                              {k}@{v}
                            </span>
                            <button
                              type="button"
                              className="shrink-0 text-[10px] uppercase text-foreground/75 hover:text-foreground"
                              onClick={() => onNpmRemove(k)}
                              disabled={working !== null}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 items-center">
                    <input
                      className="min-w-[12rem] flex-1 rounded border border-input px-2 py-1 text-xs"
                      placeholder="package[@version] (e.g. lodash@^4)"
                      value={npmAddSpec}
                      onChange={(e) => setNpmAddSpec(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={working !== null || !npmAddSpec.trim()}
                      className="nodex-btn-neutral px-2 py-1 text-xs rounded disabled:opacity-50"
                      onClick={onNpmAdd}
                    >
                      npm install --save
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
