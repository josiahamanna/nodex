import type { PluginInventoryItem } from "@nodex/ui-types";

export async function listInstalledPlugins(): Promise<string[]> {
  return window.Nodex.getInstalledPlugins();
}

export async function getPluginInventory(): Promise<PluginInventoryItem[]> {
  return window.Nodex.getPluginInventory();
}

export async function reloadPluginRegistry(): Promise<{
  success: boolean;
  error?: string;
}> {
  return window.Nodex.reloadPluginRegistry();
}

export async function setPluginEnabled(
  pluginId: string,
  enabled: boolean,
): Promise<{ success: boolean; error?: string }> {
  return window.Nodex.setPluginEnabled(pluginId, enabled);
}

export async function uninstallPluginFromBin(
  pluginId: string,
): Promise<{ success: boolean; error?: string }> {
  return window.Nodex.uninstallPlugin(pluginId);
}

export async function getPluginLoadIssues(): Promise<
  { folder: string; error: string }[]
> {
  return window.Nodex.getPluginLoadIssues();
}

export async function getPluginCacheStats(): Promise<{
  root: string;
  totalBytes: number;
  plugins: { name: string; bytes: number }[];
}> {
  return window.Nodex.getPluginCacheStats();
}

export async function getUserPluginsDirectory(): Promise<{
  path: string;
  error?: string;
}> {
  return window.Nodex.getUserPluginsDirectory();
}

export async function getPluginManifestUi(pluginId: string): Promise<{
  theme: "inherit" | "isolated";
  designSystemVersion?: string;
  designSystemWarning: string | null;
} | null> {
  return window.Nodex.getPluginManifestUi(pluginId);
}

