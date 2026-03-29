import React from "react";
import { PluginManagerAlerts } from "./plugin-manager/PluginManagerAlerts";
import { PluginManagerInstallModal } from "./plugin-manager/PluginManagerInstallModal";
import { PluginManagerMaintenanceSection } from "./plugin-manager/PluginManagerMaintenanceSection";
import { PluginManagerPluginRows } from "./plugin-manager/PluginManagerPluginRows";
import { usePluginManager } from "./plugin-manager/usePluginManager";

interface PluginManagerProps {
  onPluginsChanged?: () => void;
  /**
   * `undefined` — standalone manager (full list in-page).
   * `null` — embedded in shell: no plugin selected yet.
   * string — embedded: show detail for this id only.
   */
  selectedPluginId?: string | null;
}

const PluginManager: React.FC<PluginManagerProps> = ({
  onPluginsChanged,
  selectedPluginId: selectedPluginIdProp,
}) => {
  const pm = usePluginManager({
    onPluginsChanged,
    selectedPluginIdProp,
  });

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {!pm.embedded ? (
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
        {pm.installModal && (
          <PluginManagerInstallModal
            installModal={pm.installModal}
            skipConfirmRef={pm.skipConfirmRef}
            onClose={() => pm.setInstallModal(null)}
            onConfirmInstall={() => void pm.confirmInstall()}
          />
        )}

        <PluginManagerAlerts
          message={pm.message}
          loadIssues={pm.loadIssues}
          showProgress={pm.showProgress}
          progressLines={pm.progressLines}
          onToggleProgress={() => pm.setShowProgress((s) => !s)}
        />

        <div className="mb-6">
          <button
            type="button"
            onClick={() => void pm.handleImport()}
            disabled={pm.importing}
            className="nodex-btn-neutral rounded-lg px-4 py-2 font-semibold disabled:cursor-not-allowed"
          >
            {pm.importing
              ? "Importing..."
              : "Import plugin (.Nodexplugin / .zip)"}
          </button>
        </div>

        <PluginManagerPluginRows
          embedded={pm.embedded}
          selectedPluginIdProp={pm.selectedPluginIdProp}
          idsForCards={pm.idsForCards}
          invFor={pm.invFor}
          pluginUiMeta={pm.pluginUiMeta}
          working={pm.working}
          depPanelPlugin={pm.depPanelPlugin}
          depInfo={pm.depInfo}
          npmAddSpec={pm.npmAddSpec}
          setNpmAddSpec={pm.setNpmAddSpec}
          loadPlugins={() => pm.loadPlugins()}
          onPluginsChanged={pm.onPluginsChanged}
          setMessage={pm.setMessage}
          onReloadRegistry={pm.handleReloadRegistry}
          onInstallDeps={pm.handleInstallDeps}
          onToggleDepPanel={(id) => void pm.openDepPanel(id)}
          onBundleLocal={pm.handleBundleLocal}
          onUninstall={pm.handleUninstall}
          onNpmAdd={() => void pm.runNpmAdd()}
          onNpmRemove={(pkg) => void pm.runNpmRemove(pkg)}
        />

        {!pm.embedded ? (
          <PluginManagerMaintenanceSection
            cacheStats={pm.cacheStats}
            userPluginsPath={pm.userPluginsPath}
            working={pm.working}
            onClearAllCaches={() => void pm.handleClearAllCaches()}
            onResetUserPluginsDirectory={pm.handleResetUserPluginsDirectory}
          />
        ) : null}
      </div>
    </div>
  );
};

export default PluginManager;
