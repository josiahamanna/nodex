import { getNodex } from "../../../shared/nodex-host-access";
export type PluginInventoryRow = Awaited<
  ReturnType<typeof getNodex().getPluginInventory>
>[number];

export type PluginUiMeta = Awaited<
  ReturnType<typeof getNodex().getPluginManifestUi>
>;

export type UserMessage = {
  type: "success" | "error" | "info";
  text: string;
} | null;
