import React, { useState, useEffect, useCallback } from "react";

interface PluginManagerProps {
  onPluginsChanged?: () => void;
}

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
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadPlugins = async () => {
    const installed = await window.Nodex.getInstalledPlugins();
    setPlugins(installed);
  };

  const refreshCacheStats = useCallback(async () => {
    const stats = await window.Nodex.getPluginCacheStats();
    setCacheStats(stats);
  }, []);

  useEffect(() => {
    loadPlugins();
    refreshCacheStats();
  }, [refreshCacheStats]);

  const handleImport = async () => {
    try {
      setImporting(true);
      setMessage(null);

      const zipPath = await window.Nodex.selectZipFile();
      if (!zipPath) {
        setImporting(false);
        return;
      }

      const result = await window.Nodex.importPlugin(zipPath);

      if (result.success) {
        setMessage({ type: "success", text: "Plugin imported successfully!" });
        await loadPlugins();
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

  const handleInstallDeps = async (pluginName: string) => {
    setMessage(null);
    setWorking(`install:${pluginName}`);
    try {
      const result = await window.Nodex.installPluginDependencies(pluginName);
      if (result.success) {
        setMessage({
          type: "success",
          text: `Dependencies installed for ${pluginName} (see terminal for npm log).`,
        });
        await refreshCacheStats();
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

  return (
    <div className="h-full flex flex-col bg-white">
      <header className="border-b border-gray-200 p-4">
        <h2 className="text-2xl font-bold text-gray-800">Plugin Manager</h2>
        <p className="text-sm text-gray-600 mt-1">Manage your Nodex plugins</p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {message && (
          <div
            className={`mb-4 p-4 rounded-lg ${
              message.type === "success"
                ? "bg-green-50 border border-green-200 text-green-800"
                : "bg-red-50 border border-red-200 text-red-800"
            }`}
          >
            {message.text}
          </div>
        )}

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
                  className="flex flex-col gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 sm:flex-row sm:items-center sm:justify-between"
                >
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
            . Bundling resolves modules from there when present.
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
