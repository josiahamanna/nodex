export const DOCS_PLUGIN_ID = "plugin.documentation";
export const DOCS_BC = "nodex.documentation.sync";

/** Cross-panel docs UI sync (search sidebar ↔ main area ↔ settings). */
export type DocsBcMessage =
  | { type: "docs.setMiniOnly"; miniOnly: boolean }
  | { type: "docs.refreshCommands" }
  | { type: "docs.showCommand"; commandId: string }
  | { type: "docs.showBundledDoc"; noteId: string };
