export const DOCS_PLUGIN_ID = "plugin.documentation";
export const DOCS_BC = "nodex.documentation.sync";

/**
 * Stable logical note ids for bundled documentation extras (hub + companion panels).
 * Must match `docs/bundled-plugin-authoring/manifest.json`.
 */
export const BUNDLED_DOC_NOTE_IDS = {
  hubOverview: "nodex-docs-hub-overview",
  companionUserGuide: "nodex-companion-user-guide",
  companionPluginAuthoring: "nodex-companion-plugin-authoring",
} as const;

/** Cross-panel docs UI sync (search sidebar ↔ main area ↔ settings). */
export type DocsBcMessage =
  | { type: "docs.setMiniOnly"; miniOnly: boolean }
  | { type: "docs.refreshCommands" }
  | { type: "docs.showCommand"; commandId: string }
  | { type: "docs.showBundledDoc"; noteId: string };
