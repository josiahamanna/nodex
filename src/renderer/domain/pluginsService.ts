import { getNodex } from "../../shared/nodex-host-access";
import type { PluginInventoryItem } from "@nodex/ui-types";

export async function listInstalledPlugins(): Promise<string[]> {
  return getNodex().getInstalledPlugins();
}

export async function getPluginInventory(): Promise<PluginInventoryItem[]> {
  return getNodex().getPluginInventory();
}

export async function reloadPluginRegistry(): Promise<{
  success: boolean;
  error?: string;
}> {
  return getNodex().reloadPluginRegistry();
}

export async function setPluginEnabled(
  pluginId: string,
  enabled: boolean,
): Promise<{ success: boolean; error?: string }> {
  return getNodex().setPluginEnabled(pluginId, enabled);
}

export async function uninstallPluginFromBin(
  pluginId: string,
): Promise<{ success: boolean; error?: string }> {
  return getNodex().uninstallPlugin(pluginId);
}

export async function getPluginLoadIssues(): Promise<
  { folder: string; error: string }[]
> {
  return getNodex().getPluginLoadIssues();
}

export async function getPluginCacheStats(): Promise<{
  root: string;
  totalBytes: number;
  plugins: { name: string; bytes: number }[];
}> {
  return getNodex().getPluginCacheStats();
}

export async function getUserPluginsDirectory(): Promise<{
  path: string;
  error?: string;
}> {
  return getNodex().getUserPluginsDirectory();
}

export async function getPluginManifestUi(pluginId: string): Promise<{
  theme: "inherit" | "isolated";
  designSystemVersion?: string;
  designSystemWarning: string | null;
} | null> {
  return getNodex().getPluginManifestUi(pluginId);
}

