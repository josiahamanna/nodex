import React, { useState, useEffect } from "react";

interface PluginManagerProps {
  onPluginsChanged?: () => void;
}

const PluginManager: React.FC<PluginManagerProps> = ({ onPluginsChanged }) => {
  const [plugins, setPlugins] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadPlugins = async () => {
    const installed = await window.modux.getInstalledPlugins();
    setPlugins(installed);
  };

  useEffect(() => {
    loadPlugins();
  }, []);

  const handleImport = async () => {
    try {
      setImporting(true);
      setMessage(null);

      const zipPath = await window.modux.selectZipFile();
      if (!zipPath) {
        setImporting(false);
        return;
      }

      const result = await window.modux.importPlugin(zipPath);

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

  const handleUninstall = async (pluginName: string) => {
    if (!confirm(`Are you sure you want to uninstall ${pluginName}?`)) {
      return;
    }

    try {
      const result = await window.modux.uninstallPlugin(pluginName);

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
        <p className="text-sm text-gray-600 mt-1">Manage your Modux plugins</p>
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
            {importing ? "Importing..." : "Import Plugin from ZIP"}
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
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div>
                    <h4 className="font-medium text-gray-800">{plugin}</h4>
                    <p className="text-sm text-gray-600">Active</p>
                  </div>
                  <button
                    onClick={() => handleUninstall(plugin)}
                    className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 font-medium"
                  >
                    Uninstall
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PluginManager;
