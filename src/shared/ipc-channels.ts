export const IPC_CHANNELS = {
  GET_NOTE: "note:get",
  GET_ALL_NOTES: "note:get-all",
  GET_COMPONENT: "plugin:get-component",
  GET_PLUGIN_HTML: "plugin:get-html",
  GET_REGISTERED_TYPES: "plugin:get-registered-types",
  IMPORT_PLUGIN: "plugin:import",
  GET_INSTALLED_PLUGINS: "plugin:get-installed",
  UNINSTALL_PLUGIN: "plugin:uninstall",
  SELECT_ZIP_FILE: "plugin:select-zip",
  EXPORT_PLUGIN_DEV: "plugin:export-dev",
  EXPORT_PLUGIN_PRODUCTION: "plugin:export-production",
  BUNDLE_PLUGIN_LOCAL: "plugin:bundle-local",
  INSTALL_PLUGIN_DEPENDENCIES: "plugin:install-dependencies",
  CLEAR_PLUGIN_DEPENDENCY_CACHE: "plugin:clear-dependency-cache",
  CLEAR_ALL_PLUGIN_DEPENDENCY_CACHES: "plugin:clear-all-dependency-caches",
  GET_PLUGIN_CACHE_STATS: "plugin:cache-stats",
  PLUGINS_CHANGED: "plugin:changed",
} as const;

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
