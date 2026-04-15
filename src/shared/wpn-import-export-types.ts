/** Shared types for WPN workspace import/export ZIP format. */

export type WpnExportNoteEntry = {
  id: string;
  parent_id: string | null;
  type: string;
  title: string;
  sibling_index: number;
  metadata: Record<string, unknown> | null;
};

export type WpnExportProjectEntry = {
  id: string;
  name: string;
  sort_index: number;
  color_token: string | null;
  notes: WpnExportNoteEntry[];
};

export type WpnExportWorkspaceEntry = {
  id: string;
  name: string;
  sort_index: number;
  color_token: string | null;
  projects: WpnExportProjectEntry[];
};

export type WpnExportMetadata = {
  version: 1;
  exported_at_ms: number;
  workspaces: WpnExportWorkspaceEntry[];
};

export type WpnImportResult = {
  workspaces: number;
  projects: number;
  notes: number;
};
