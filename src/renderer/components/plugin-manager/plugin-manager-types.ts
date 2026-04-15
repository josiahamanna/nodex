import { getNodex } from "../../../shared/nodex-host-access";

type Nodex = ReturnType<typeof getNodex>;

export type PluginInventoryRow = Awaited<
  ReturnType<Nodex["getPluginInventory"]>
>[number];

export type PluginUiMeta = Awaited<
  ReturnType<Nodex["getPluginManifestUi"]>
>;

export type UserMessage = {
  type: "success" | "error" | "info";
  text: string;
} | null;
