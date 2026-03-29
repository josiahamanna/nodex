import React, { useState, useEffect, useCallback, useRef } from "react";

type PluginInventoryRow = Awaited<
  ReturnType<typeof window.Nodex.getPluginInventory>
>[number];

interface PluginManagerProps {
  onPluginsChanged?: () => void;
  /**
   * `undefined` — standalone manager (full list in-page).
   * `null` — embedded in shell: no plugin selected yet.
   * string — embedded: show detail for this id only.
   */
  selectedPluginId?: string | null;
}

const SKIP_INSTALL_CONFIRM_KEY = "nodex-skip-install-confirm";
const MAX_PROGRESS_LINES = 400;

function formatBytes(n: number): string {
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

const PluginManager: React.FC<PluginManagerProps> = ({
  onPluginsChanged,
  selectedPluginId: selectedPluginIdProp,
}) => {
  const embedded = selectedPluginIdProp !== undefined;
  const [plugins, setPlugins] = useState<string[]>([]);
  const [inventory, setInventory] = useState<PluginInventoryRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<{
    root: string;
    totalBytes: number;
    plugins: { name: string; bytes: number }[];
  } | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [progressLines, setProgressLines] = useState<string[]>([]);
  const [showProgress, setShowProgress] = useState(false);
  const [loadIssues, setLoadIssues] = useState<{ folder: string; error: string }[]>(
    [],
  );
  const [installModal, setInstallModal] = useState<{
    folderName: string;
    plan: Awaited<ReturnType<typeof window.Nodex.getPluginInstallPlan>>;
  } | null>(null);
  const [depPanelPlugin, setDepPanelPlugin] = useState<string | null>(null);
  const [depInfo, setDepInfo] = useState<
    Awaited<ReturnType<typeof window.Nodex.getPluginResolvedDeps>> | null
  >(null);
  const [npmAddSpec, setNpmAddSpec] = useState("");
  const [pluginUiMeta, setPluginUiMeta] = useState<
    Record<
      string,
      Awaited<ReturnType<typeof window.Nodex.getPluginManifestUi>>
    >
  >({});
  const [userPluginsPath, setUserPluginsPath] = useState<string | null>(null);
  const skipConfirmRef = useRef(
    typeof localStorage !== "undefined" &&
      localStorage.getItem(SKIP_INSTALL_CONFIRM_KEY) === "1",
  );

  const pushProgress = useCallback((line: string) => {
    setProgressLines((prev) => {
      const next = [...prev, line];
      if (next.length > MAX_PROGRESS_LINES) {
        return next.slice(-MAX_PROGRESS_LINES);
      }
      return next;
    });
  }, []);

  const loadPlugins = async () => {
    const [installed, inv] = await Promise.all([
      window.Nodex.getInstalledPlugins(),
      window.Nodex.getPluginInventory(),
    ]);
    setPlugins(installed);
    setInventory(inv);
    const meta: Record<
      string,
      Awaited<ReturnType<typeof window.Nodex.getPluginManifestUi>>
    > = {};
    const ids = new Set([...installed, ...inv.map((r) => r.id)]);
    for (const p of ids) {
      try {
        meta[p] = await window.Nodex.getPluginManifestUi(p);
      } catch {
        meta[p] = null;
      }
    }
    setPluginUiMeta(meta);
  };

  const refreshLoadIssues = useCallback(async () => {
    const issues = await window.Nodex.getPluginLoadIssues();
    setLoadIssues(issues);
  }, []);

  const refreshCacheStats = useCallback(async () => {
    const stats = await window.Nodex.getPluginCacheStats();
    setCacheStats(stats);
  }, []);

  useEffect(() => {
    loadPlugins();
    refreshCacheStats();
    refreshLoadIssues();
  }, [refreshCacheStats, refreshLoadIssues]);

  useEffect(() => {
    void window.Nodex.getUserPluginsDirectory().then((res) => {
      if (res.path) {
        setUserPluginsPath(res.path);
      }
    });
  }, []);

  useEffect(() => {
    return window.Nodex.onPluginProgress((p) => {
      const tag = p.pluginName ? `[${p.pluginName}] ` : "";
      pushProgress(`${p.op}/${p.phase}: ${tag}${p.message}`);
    });
  }, [pushProgress]);

  const handleImport = async () => {
    try {
      setImporting(true);
      setMessage(null);

      const zipPath = await window.Nodex.selectZipFile();
      if (!zipPath) {
        setImporting(false);
        return;
      }

      const pre = await window.Nodex.validatePluginZip(zipPath);
      if (!pre.valid) {
        setMessage({
          type: "error",
          text: `Validation failed:\n${pre.errors.join("\n")}`,
        });
        setImporting(false);
        return;
      }
      if (pre.warnings.length > 0) {
        setMessage({
          type: "info",
          text: `Warnings:\n${pre.warnings.join("\n")}`,
        });
      }

      const result = await window.Nodex.importPlugin(zipPath);

      if (result.success) {
        const w =
          result.warnings?.length && result.warnings.length > 0
            ? `\nWarnings:\n${result.warnings.join("\n")}`
            : "";
        setMessage({
          type: "success",
          text: `Plugin imported successfully!${w}`,
        });
        await loadPlugins();
        await refreshLoadIssues();
        if (onPluginsChanged) {
          onPluginsChanged();
        }
      } else {
        setMessage({
          type: "error",
          text: result.error || "Failed to import plugin",
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleExportDev = async (pluginName: string) => {
    setMessage(null);
    try {
      const result = await window.Nodex.exportPluginDev(pluginName);
      if (result.success && result.path) {
        setMessage({
          type: "success",
          text: `Dev package created: ${result.path}`,
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Export failed",
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Export failed",
      });
    }
  };

  const handleExportProduction = async (pluginName: string) => {
    setMessage(null);
    try {
      const result = await window.Nodex.exportPluginProduction(pluginName);
      if (result.success && result.path) {
        setMessage({
          type: "success",
          text: `Production package created: ${result.path}`,
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Export failed",
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Export failed",
      });
    }
  };

  const runInstallDeps = async (pluginName: string) => {
    setMessage(null);
    setWorking(`install:${pluginName}`);
    try {
      const result = await window.Nodex.installPluginDependencies(pluginName);
      if (result.success) {
        setMessage({
          type: "success",
          text: `Dependencies installed for ${pluginName}.`,
        });
        await refreshCacheStats();
        if (depPanelPlugin === pluginName) {
          setDepInfo(await window.Nodex.getPluginResolvedDeps(pluginName));
        }
      } else {
        setMessage({
          type: "error",
          text: result.error || "npm install failed",
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "npm install failed",
      });
    } finally {
      setWorking(null);
    }
  };

  const handleInstallDeps = async (pluginName: string) => {
    if (skipConfirmRef.current) {
      await runInstallDeps(pluginName);
      return;
    }
    try {
      const plan = await window.Nodex.getPluginInstallPlan(pluginName);
      setInstallModal({ folderName: pluginName, plan });
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Could not read install plan",
      });
    }
  };

  const confirmInstall = async () => {
    if (!installModal) {
      return;
    }
    const name = installModal.folderName;
    setInstallModal(null);
    await runInstallDeps(name);
  };

  const handleClearPluginCache = async (pluginName: string) => {
    setMessage(null);
    try {
      const result = await window.Nodex.clearPluginDependencyCache(pluginName);
      if (result.success) {
        setMessage({
          type: "success",
          text: `Cleared dependency cache for ${pluginName}.`,
        });
        await refreshCacheStats();
        if (depPanelPlugin === pluginName) {
          setDepInfo(await window.Nodex.getPluginResolvedDeps(pluginName));
        }
      } else {
        setMessage({
          type: "error",
          text: result.error || "Clear cache failed",
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Clear cache failed",
      });
    }
  };

  const handleClearAllCaches = async () => {
    if (
      !confirm(
        "Remove all ~/.nodex/plugin-cache data? Bundles will need reinstalling.",
      )
    ) {
      return;
    }
    setMessage(null);
    await window.Nodex.clearAllPluginDependencyCaches();
    setMessage({
      type: "success",
      text: "All plugin dependency caches cleared.",
    });
    await refreshCacheStats();
  };

  const handleResetUserPluginsDirectory = async () => {
    const displayPath =
      userPluginsPath ?? "(path unavailable — check main process logs)";
    if (
      !window.confirm(
        `Delete the entire user plugins folder and reset to a clean state?\n\n${displayPath}\n\nThis removes sources/, bin/, IDE metadata under that folder. Sample markdown/tiptap plugins will be re-seeded if missing. Bundled core plugins are not removed. This cannot be undone.`,
      )
    ) {
      return;
    }
    if (
      !window.confirm(
        "Second confirmation: permanently delete that folder now?",
      )
    ) {
      return;
    }
    setWorking("reset-user-plugins");
    setMessage(null);
    try {
      const res = await window.Nodex.resetUserPluginsDirectory();
      if (res.success) {
        setMessage({
          type: "success",
          text: `User plugins folder was reset.\n${res.path}`,
        });
        onPluginsChanged?.();
        await loadPlugins();
        await refreshLoadIssues();
        await refreshCacheStats();
        const again = await window.Nodex.getUserPluginsDirectory();
        if (again.path) {
          setUserPluginsPath(again.path);
        }
      } else {
        setMessage({
          type: "error",
          text: res.error ?? "Failed to reset user plugins folder",
        });
      }
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Failed to reset user plugins folder",
      });
    } finally {
      setWorking(null);
    }
  };

  const handleReloadRegistry = async () => {
    setMessage(null);
    try {
      const r = await window.Nodex.reloadPluginRegistry();
      if (r.success) {
        setMessage({ type: "success", text: "Registry reloaded." });
        onPluginsChanged?.();
        await loadPlugins();
      } else {
        setMessage({
          type: "error",
          text: r.error ?? "Reload failed",
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Reload failed",
      });
    }
  };

  const handleBundleLocal = async (pluginName: string) => {
    setMessage(null);
    try {
      const result = await window.Nodex.bundlePluginLocal(pluginName);
      if (result.success) {
        const w =
          result.warnings?.length && result.warnings.length > 0
            ? ` (${result.warnings.length} Rollup warnings — see main log)`
            : "";
        setMessage({
          type: "success",
          text: `Wrote dist/*.bundle.js under plugin folder.${w}`,
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Bundle failed",
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Bundle failed",
      });
    }
  };

  const handleUninstall = async (pluginName: string) => {
    if (
      !confirm(
        `Remove the bundled copy of "${pluginName}" from bin/? Plugin sources under sources/ stay on disk.`,
      )
    ) {
      return;
    }

    try {
      const result = await window.Nodex.uninstallPlugin(pluginName);

      if (result.success) {
        setMessage({
          type: "success",
          text: `Removed ${pluginName} from bin/. Sources preserved; app will use sources if present.`,
        });
        await loadPlugins();
        await refreshLoadIssues();
        if (depPanelPlugin === pluginName) {
          setDepPanelPlugin(null);
          setDepInfo(null);
        }
        if (onPluginsChanged) {
          onPluginsChanged();
        }
      } else {
        setMessage({
          type: "error",
          text: result.error || "Failed to uninstall plugin",
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const openDepPanel = async (pluginName: string) => {
    if (depPanelPlugin === pluginName) {
      setDepPanelPlugin(null);
      setDepInfo(null);
      return;
    }
    setDepPanelPlugin(pluginName);
    setNpmAddSpec("");
    setDepInfo(await window.Nodex.getPluginResolvedDeps(pluginName));
  };

  const runNpmAdd = async () => {
    if (!depPanelPlugin || !npmAddSpec.trim()) {
      return;
    }
    setWorking(`npm:${depPanelPlugin}`);
    try {
      const result = await window.Nodex.runPluginCacheNpm(depPanelPlugin, [
        "install",
        "--save",
        npmAddSpec.trim(),
      ]);
      if (result.success) {
        setNpmAddSpec("");
        setDepInfo(await window.Nodex.getPluginResolvedDeps(depPanelPlugin));
        setMessage({ type: "success", text: "npm install completed." });
      } else {
        setMessage({
          type: "error",
          text: result.error || "npm failed",
        });
      }
    } finally {
      setWorking(null);
    }
  };

  const runNpmRemove = async (pkg: string) => {
    if (!depPanelPlugin) {
      return;
    }
    setWorking(`npm:${depPanelPlugin}`);
    try {
      const result = await window.Nodex.runPluginCacheNpm(depPanelPlugin, [
        "uninstall",
        pkg,
      ]);
      if (result.success) {
        setDepInfo(await window.Nodex.getPluginResolvedDeps(depPanelPlugin));
        setMessage({ type: "success", text: `Removed ${pkg}.` });
      } else {
        setMessage({
          type: "error",
          text: result.error || "npm failed",
        });
      }
    } finally {
      setWorking(null);
    }
  };

  const idsForCards =
    embedded && selectedPluginIdProp !== null
      ? [selectedPluginIdProp]
      : embedded && selectedPluginIdProp === null
        ? []
        : plugins;

  const invFor = (id: string): PluginInventoryRow | undefined =>
    inventory.find((r) => r.id === id);

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {!embedded ? (
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-[13px] font-semibold text-foreground">
            Plugin Manager
          </h2>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Manage your Nodex plugins
          </p>
        </header>
      ) : null}

      <div className="flex-1 overflow-auto px-4 py-4">
        {installModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-lg bg-card p-5 text-card-foreground shadow-xl">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Install dependencies
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Manifest name:{" "}
                <code className="text-xs bg-muted px-1 rounded">
                  {installModal.plan.manifestName}
                </code>
              </p>
              <p className="text-xs text-muted-foreground mb-2 break-all">
                Workspace: {installModal.plan.cacheDir}
              </p>
              {installModal.plan.depsChangedSinceLastInstall && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 mb-2">
                  package.json or manifest.dependencies changed since the last
                  recorded install (see .nodex-deps-snapshot.json).
                </p>
              )}
              {installModal.plan.warnManyDeps && (
                <p className="text-sm text-amber-800 mb-2">
                  This plugin declares many dependencies (
                  {installModal.plan.dependencyCount}).
                </p>
              )}
              {installModal.plan.warnLargePackageJson && (
                <p className="text-sm text-amber-800 mb-2">
                  package.json is unusually large — review before installing.
                </p>
              )}
              {installModal.plan.registryNotes.length > 0 && (
                <ul className="text-xs text-muted-foreground mb-3 list-disc pl-5">
                  {installModal.plan.registryNotes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
              <p className="text-sm font-medium text-foreground mb-1">
                Packages ({installModal.plan.dependencyCount})
              </p>
              <ul className="text-xs font-mono bg-muted/40 border border-border rounded p-2 max-h-40 overflow-auto mb-4">
                {Object.entries(installModal.plan.dependencies).map(
                  ([k, v]) => (
                    <li key={k}>
                      {k}@{v}
                    </li>
                  ),
                )}
              </ul>
              <label className="flex items-center gap-2 text-sm text-foreground mb-4">
                <input
                  type="checkbox"
                  defaultChecked={skipConfirmRef.current}
                  onChange={(e) => {
                    skipConfirmRef.current = e.target.checked;
                    if (e.target.checked) {
                      localStorage.setItem(SKIP_INSTALL_CONFIRM_KEY, "1");
                    } else {
                      localStorage.removeItem(SKIP_INSTALL_CONFIRM_KEY);
                    }
                  }}
                />
                Don&apos;t show this again (stored locally)
              </label>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm rounded bg-muted text-foreground hover:bg-muted/80"
                  onClick={() => setInstallModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-sm bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-92"
                  onClick={confirmInstall}
                >
                  Run npm install
                </button>
              </div>
            </div>
          </div>
        )}

        {message && (
          <div
            className={`mb-4 p-4 rounded-lg whitespace-pre-wrap ${
              message.type === "success"
                ? "bg-green-50 border border-green-200 text-green-800"
                : message.type === "info"
                  ? "bg-sky-50 border border-sky-200 text-sky-900"
                  : "border border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {message.text}
          </div>
        )}

        {loadIssues.length > 0 && (
          <div className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200">
            <p className="font-medium text-amber-900 mb-2">
              Plugin load / validation issues
            </p>
            <ul className="text-sm text-amber-900 space-y-1">
              {loadIssues.map((row) => (
                <li key={row.folder}>
                  <strong>{row.folder}</strong>: {row.error}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowProgress((s) => !s)}
            className="mr-4 text-sm text-primary underline"
          >
            {showProgress ? "Hide" : "Show"} operation log (
            {progressLines.length} lines)
          </button>
          {showProgress && (
            <div className="mt-2 max-h-48 overflow-auto rounded border border-border bg-card p-2 font-mono text-xs text-card-foreground">
              {progressLines.length === 0 ? (
                <span className="text-muted-foreground">No events yet.</span>
              ) : (
                progressLines.map((line, i) => (
                  <div key={i}>{line}</div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="mb-6">
          <button
            onClick={handleImport}
            disabled={importing}
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? "Importing..." : "Import plugin (.Nodexplugin / .zip)"}
          </button>
        </div>

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
                        <h4 className="font-medium text-foreground">
                          {plugin}
                        </h4>
                        {invFor(plugin)?.isBundled ? (
                          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
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
                        <p className="mt-1 text-xs text-destructive">
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
                        onClick={() => handleExportDev(plugin)}
                        className="rounded bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground hover:opacity-90"
                      >
                        Export dev
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportProduction(plugin)}
                        className="rounded bg-accent px-3 py-1 text-sm font-medium text-accent-foreground hover:opacity-90"
                      >
                        Export production
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReloadRegistry()}
                        disabled={working !== null}
                        className="rounded border border-border bg-background px-3 py-1 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-50"
                      >
                        Reload registry
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInstallDeps(plugin)}
                        disabled={working !== null}
                        className="px-3 py-1 text-sm bg-emerald-100 text-emerald-900 rounded hover:bg-emerald-200 font-medium disabled:opacity-50"
                      >
                        {working === `install:${plugin}`
                          ? "Installing…"
                          : "Install deps"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openDepPanel(plugin)}
                        disabled={working !== null}
                        className="px-3 py-1 text-sm bg-cyan-100 text-cyan-900 rounded hover:bg-cyan-200 font-medium disabled:opacity-50"
                      >
                        {depPanelPlugin === plugin
                          ? "Close deps"
                          : "Dependencies"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClearPluginCache(plugin)}
                        disabled={working !== null}
                        className="px-3 py-1 text-sm bg-stone-100 text-stone-800 rounded hover:bg-stone-200 font-medium disabled:opacity-50"
                      >
                        Clear dep cache
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBundleLocal(plugin)}
                        disabled={working !== null}
                        className="px-3 py-1 text-sm bg-amber-100 text-amber-900 rounded hover:bg-amber-200 font-medium disabled:opacity-50"
                      >
                        Bundle to dist/
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUninstall(plugin)}
                        disabled={working !== null}
                        className="rounded bg-destructive/15 px-3 py-1 text-sm font-medium text-destructive hover:bg-destructive/25"
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
                        <p className="mb-2 text-xs text-destructive">
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
                                  className="shrink-0 text-[10px] uppercase text-destructive"
                                  onClick={() => runNpmRemove(k)}
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
                          className="px-2 py-1 text-xs bg-emerald-600 text-white rounded disabled:opacity-50"
                          onClick={runNpmAdd}
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

        {!embedded ? (
          <>
            <div className="mt-10 pt-6 border-t border-border">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Legacy dependency cache (~/.nodex/plugin-cache)
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Older installs used a global cache under{" "}
                <code className="text-xs bg-muted px-1 rounded">
                  {cacheStats?.root ?? "~/.nodex/plugin-cache"}
                </code>
                . New installs use each plugin&apos;s workspace{" "}
                <code className="text-xs bg-muted px-1 rounded">node_modules</code>
                . Install audit lines append to{" "}
                <code className="text-xs bg-muted px-1 rounded">
                  plugin-audit.jsonl
                </code>{" "}
                under app userData.
              </p>
              {cacheStats && (
                <p className="text-sm text-foreground mb-3">
                  Total: <strong>{formatBytes(cacheStats.totalBytes)}</strong>
                  {cacheStats.plugins.length > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      —{" "}
                      {cacheStats.plugins
                        .filter((p) => p.bytes > 0)
                        .map((p) => `${p.name}: ${formatBytes(p.bytes)}`)
                        .join("; ")}
                    </span>
                  )}
                </p>
              )}
              <button
                type="button"
                onClick={handleClearAllCaches}
                disabled={working !== null}
                className="px-3 py-1 text-sm bg-orange-100 text-orange-900 rounded hover:bg-orange-200 font-medium disabled:opacity-50"
              >
                Clear all dependency caches
              </button>
            </div>

            <div className="mt-10 pt-6 border-t border-destructive/30">
              <h3 className="text-lg font-semibold text-destructive mb-2">
                Danger zone
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                User plugins directory (
                <code className="text-xs bg-muted px-1 rounded">
                  ~/.config/nodex/plugins
                </code>
                ):
              </p>
              <p className="text-xs font-mono break-all text-foreground mb-3 rounded border border-border bg-muted/40 p-2">
                {userPluginsPath ?? "Loading path…"}
              </p>
              <p className="text-sm text-muted-foreground mb-3">
                Deletes this entire folder, recreates it, re-seeds sample
                plugins, and reloads the registry. Use when you want a one-shot
                wipe of imported plugin sources and builds. For more options,
                open the Plugins tab → General.
              </p>
              <button
                type="button"
                onClick={() => void handleResetUserPluginsDirectory()}
                disabled={working !== null}
                className="px-3 py-1.5 text-sm font-medium rounded bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {working === "reset-user-plugins"
                  ? "Resetting…"
                  : "Delete user plugins folder (reset)"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default PluginManager;
