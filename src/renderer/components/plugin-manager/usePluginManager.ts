import { useState, useEffect, useCallback, useRef } from "react";
import { useNodexDialog } from "../../dialog/NodexDialogProvider";
import {
  MAX_PROGRESS_LINES,
  SKIP_INSTALL_CONFIRM_KEY,
} from "./plugin-manager-constants";
import { createPluginManagerMaintenanceHandlers } from "./plugin-manager-maintenance-handlers";
import type {
  PluginInstallPlanState,
  PluginInventoryRow,
  PluginUiMeta,
  UserMessage,
} from "./plugin-manager-types";

export type UsePluginManagerOptions = {
  onPluginsChanged?: () => void;
  selectedPluginIdProp: string | null | undefined;
};

export function usePluginManager({
  onPluginsChanged,
  selectedPluginIdProp,
}: UsePluginManagerOptions) {
  const { confirm } = useNodexDialog();
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
  const [message, setMessage] = useState<UserMessage>(null);
  const [progressLines, setProgressLines] = useState<string[]>([]);
  const [showProgress, setShowProgress] = useState(false);
  const [loadIssues, setLoadIssues] = useState<
    { folder: string; error: string }[]
  >([]);
  const [installModal, setInstallModal] =
    useState<PluginInstallPlanState | null>(null);
  const [depPanelPlugin, setDepPanelPlugin] = useState<string | null>(null);
  const [depInfo, setDepInfo] = useState<
    Awaited<ReturnType<typeof window.Nodex.getPluginResolvedDeps>> | null
  >(null);
  const [npmAddSpec, setNpmAddSpec] = useState("");
  const [pluginUiMeta, setPluginUiMeta] = useState<
    Record<string, PluginUiMeta | null>
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
    const meta: Record<string, PluginUiMeta | null> = {};
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
    const ok = await confirm({
      title: "Uninstall from bin",
      message: `Remove the bundled copy of "${pluginName}" from bin/? Plugin sources under sources/ stay on disk.`,
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) {
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

  const { handleClearAllCaches, handleResetUserPluginsDirectory } =
    createPluginManagerMaintenanceHandlers({
      confirm,
      userPluginsPath,
      setUserPluginsPath,
      setWorking,
      setMessage,
      onPluginsChanged,
      loadPlugins,
      refreshLoadIssues,
      refreshCacheStats,
    });

  return {
    embedded,
    selectedPluginIdProp,
    importing,
    working,
    cacheStats,
    message,
    progressLines,
    showProgress,
    setShowProgress,
    loadIssues,
    installModal,
    setInstallModal,
    depPanelPlugin,
    depInfo,
    npmAddSpec,
    setNpmAddSpec,
    pluginUiMeta,
    userPluginsPath,
    skipConfirmRef,
    idsForCards,
    invFor,
    setMessage,
    handleImport,
    confirmInstall,
    handleClearAllCaches,
    handleResetUserPluginsDirectory,
    handleReloadRegistry,
    handleInstallDeps,
    handleBundleLocal,
    handleUninstall,
    openDepPanel,
    runNpmAdd,
    runNpmRemove,
    loadPlugins,
    onPluginsChanged,
  };
}
