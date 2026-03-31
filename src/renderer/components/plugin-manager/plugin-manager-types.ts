export type PluginInventoryRow = Awaited<
  ReturnType<typeof window.Nodex.getPluginInventory>
>[number];

export type PluginUiMeta = Awaited<
  ReturnType<typeof window.Nodex.getPluginManifestUi>
>;

export type UserMessage = {
  type: "success" | "error" | "info";
  text: string;
} | null;
