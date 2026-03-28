import React, { useState, useEffect, useCallback, useRef } from "react";

interface PluginManagerProps {
  onPluginsChanged?: () => void;
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

const PluginManager: React.FC<PluginManagerProps> = ({ onPluginsChanged }) => {
  const [plugins, setPlugins] = useState<string[]>([]);
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
    const installed = await window.Nodex.getInstalledPlugins();
    setPlugins(installed);
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
    if (!confirm(`Are you sure you want to uninstall ${pluginName}?`)) {
      return;
    }

    try {
      const result = await window.Nodex.uninstallPlugin(pluginName);

      if (result.success) {
        setMessage({
          type: "success",
          text: `Plugin ${pluginName} uninstalled successfully!`,
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

  return (
    <div className="h-full flex flex-col bg-white">
      <header className="border-b border-gray-200 p-4">
        <h2 className="text-2xl font-bold text-gray-800">Plugin Manager</h2>
        <p className="text-sm text-gray-600 mt-1">Manage your Nodex plugins</p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {installModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[85vh] overflow-auto p-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Install dependencies
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                Manifest name:{" "}
                <code className="text-xs bg-gray-100 px-1 rounded">
                  {installModal.plan.manifestName}
                </code>
              </p>
              <p className="text-xs text-gray-500 mb-2 break-all">
                Cache: {installModal.plan.cacheDir}
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
                <ul className="text-xs text-gray-600 mb-3 list-disc pl-5">
                  {installModal.plan.registryNotes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
              <p className="text-sm font-medium text-gray-700 mb-1">
                Packages ({installModal.plan.dependencyCount})
              </p>
              <ul className="text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 max-h-40 overflow-auto mb-4">
                {Object.entries(installModal.plan.dependencies).map(
                  ([k, v]) => (
                    <li key={k}>
                      {k}@{v}
                    </li>
                  ),
                )}
              </ul>
              <label className="flex items-center gap-2 text-sm text-gray-700 mb-4">
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
                  className="px-3 py-1.5 text-sm rounded bg-gray-100 text-gray-800 hover:bg-gray-200"
                  onClick={() => setInstallModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700"
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
                  : "bg-red-50 border border-red-200 text-red-800"
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
            className="text-sm text-blue-700 underline mr-4"
          >
            {showProgress ? "Hide" : "Show"} operation log (
            {progressLines.length} lines)
          </button>
          {showProgress && (
            <div className="mt-2 border border-gray-200 rounded bg-gray-900 text-gray-100 font-mono text-xs p-2 max-h-48 overflow-auto">
              {progressLines.length === 0 ? (
                <span className="text-gray-500">No events yet.</span>
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
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {importing ? "Importing..." : "Import plugin (.Nodexplugin / .zip)"}
          </button>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-3">
            Installed Plugins
          </h3>

          {plugins.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              No plugins installed yet. Import a plugin to get started!
            </div>
          ) : (
            <div className="space-y-2">
              {plugins.map((plugin) => (
                <div
                  key={plugin}
                  className="flex flex-col gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="font-medium text-gray-800">{plugin}</h4>
                      <p className="text-sm text-gray-600">Active</p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => handleExportDev(plugin)}
                        className="px-3 py-1 text-sm bg-slate-100 text-slate-800 rounded hover:bg-slate-200 font-medium"
                      >
                        Export dev
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportProduction(plugin)}
                        className="px-3 py-1 text-sm bg-indigo-100 text-indigo-800 rounded hover:bg-indigo-200 font-medium"
                      >
                        Export production
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
                        className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 font-medium"
                      >
                        Uninstall
                      </button>
                    </div>
                  </div>

                  {depPanelPlugin === plugin && depInfo && (
                    <div className="border-t border-gray-200 pt-3 text-sm">
                      <p className="text-gray-600 mb-2">
                        Declared in cache{" "}
                        <code className="text-xs bg-white px-1 rounded">
                          package.json
                        </code>{" "}
                        vs resolved top-level (npm ls).
                      </p>
                      {depInfo.error && (
                        <p className="text-red-700 text-xs mb-2">
                          {depInfo.error}
                        </p>
                      )}
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <p className="font-medium text-gray-700 mb-1">
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
                          <p className="font-medium text-gray-700 mb-1">
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
                                  className="text-red-600 text-[10px] uppercase shrink-0"
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
                          className="border border-gray-300 rounded px-2 py-1 text-xs flex-1 min-w-[12rem]"
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

        <div className="mt-10 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            Dependency cache (Epic 3.1)
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            npm packages install under{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">
              {cacheStats?.root ?? "~/.nodex/plugin-cache"}
            </code>
            . Bundling resolves modules from there when present. Install audit
            lines append to{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">
              plugin-audit.jsonl
            </code>{" "}
            under app userData.
          </p>
          {cacheStats && (
            <p className="text-sm text-gray-700 mb-3">
              Total: <strong>{formatBytes(cacheStats.totalBytes)}</strong>
              {cacheStats.plugins.length > 0 && (
                <span className="text-gray-500">
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
      </div>
    </div>
  );
};

export default PluginManager;
