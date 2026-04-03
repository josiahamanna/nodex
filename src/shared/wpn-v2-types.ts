/** Workspace → project → note (v2) — DTOs for SQLite, Postgres, HTTP, and IPC. */

export type WpnWorkspaceRow = {
  id: string;
  name: string;
  sort_index: number;
  color_token: string | null;
  created_at_ms: number;
  updated_at_ms: number;
};

export type WpnProjectRow = {
  id: string;
  workspace_id: string;
  name: string;
  sort_index: number;
  color_token: string | null;
  created_at_ms: number;
  updated_at_ms: number;
};

export type WpnNoteRow = {
  id: string;
  project_id: string;
  parent_id: string | null;
  type: string;
  title: string;
  content: string;
  metadata_json: string | null;
  sibling_index: number;
  created_at_ms: number;
  updated_at_ms: number;
};

/** Flat preorder row for explorer (includes depth). */
export type WpnNoteListItem = {
  id: string;
  project_id: string;
  parent_id: string | null;
  type: string;
  title: string;
  depth: number;
  sibling_index: number;
};

export type WpnNoteDetail = {
  id: string;
  project_id: string;
  parent_id: string | null;
  type: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  sibling_index: number;
  created_at_ms: number;
  updated_at_ms: number;
};

/** Flat row for cross-project note listing (link picker, bulk load). */
export type WpnNoteWithContextListItem = {
  id: string;
  title: string;
  type: string;
  project_id: string;
  project_name: string;
  workspace_id: string;
  workspace_name: string;
};

/** Note that links to the target note id in markdown content. */
export type WpnBacklinkSourceItem = {
  id: string;
  title: string;
  project_id: string;
};

export const WPN_SCHEMA_VERSION = 1;

export type WpnWorkspacePatch = {
  name?: string;
  sort_index?: number;
  color_token?: string | null;
};

export type WpnProjectPatch = WpnWorkspacePatch & {
  workspace_id?: string;
};
