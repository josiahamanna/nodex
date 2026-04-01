import { getWpnPgPool } from "../core/wpn/wpn-pg-pool";

/**
 * Sentinel workspace root when the browser talks to WPN on Postgres with no filesystem project.
 * Not a filesystem path; UI should use {@link LOGICAL_WPN_WORKSPACE_LABEL} via `workspaceLabels`.
 */
export const NODEX_LOGICAL_WPN_WORKSPACE_ROOT = "nodex:wpn-postgres";

const LOGICAL_WPN_WORKSPACE_LABEL = "Server workspace (Postgres)";

export type ProjectStateMountKind = "folder" | "wpn-postgres";

/** Shape returned by `GET /project/state` (folder-backed or logical WPN). */
export type HeadlessProjectStateWithMount = {
  rootPath: string | null;
  notesDbPath: string | null;
  workspaceRoots: string[];
  workspaceLabels: Record<string, string>;
  mountKind?: ProjectStateMountKind;
};

/**
 * When `NODEX_PG_DATABASE_URL` is set, WPN can run without `NODEX_PROJECT_ROOT`.
 * Returns a synthetic `getProjectState`-compatible payload so the shell enables the WPN explorer.
 */
export function getLogicalWpnProjectStateIfAvailable(): HeadlessProjectStateWithMount | null {
  if (!getWpnPgPool()) {
    return null;
  }
  return {
    rootPath: null,
    notesDbPath: null,
    workspaceRoots: [NODEX_LOGICAL_WPN_WORKSPACE_ROOT],
    workspaceLabels: {
      [NODEX_LOGICAL_WPN_WORKSPACE_ROOT]: LOGICAL_WPN_WORKSPACE_LABEL,
    },
    mountKind: "wpn-postgres",
  };
}
