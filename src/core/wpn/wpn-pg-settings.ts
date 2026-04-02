import type { Pool } from "pg";

function nowMs(): number {
  return Date.now();
}

export async function wpnPgGetWorkspaceSettings(
  pool: Pool,
  ownerId: string,
  workspaceId: string,
): Promise<Record<string, unknown>> {
  const { rows } = await pool.query(
    `SELECT s.settings_json
     FROM wpn_workspace_settings s
     INNER JOIN wpn_workspace w ON w.id = s.workspace_id
     WHERE s.workspace_id = $1 AND w.owner_id = $2`,
    [workspaceId, ownerId],
  );
  const raw = (rows[0] as { settings_json?: string } | undefined)?.settings_json;
  if (!raw) return {};
  try {
    const j = JSON.parse(raw) as unknown;
    return j && typeof j === "object" && !Array.isArray(j)
      ? (j as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function wpnPgPatchWorkspaceSettings(
  pool: Pool,
  ownerId: string,
  workspaceId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Ensure workspace exists + owned.
  const { rows } = await pool.query(
    "SELECT id FROM wpn_workspace WHERE id = $1 AND owner_id = $2",
    [workspaceId, ownerId],
  );
  if (rows.length === 0) {
    throw new Error("Workspace not found");
  }
  const cur = await wpnPgGetWorkspaceSettings(pool, ownerId, workspaceId);
  const next = { ...cur, ...patch };
  await pool.query(
    `INSERT INTO wpn_workspace_settings (workspace_id, settings_json, updated_at_ms)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id) DO UPDATE SET settings_json = EXCLUDED.settings_json, updated_at_ms = EXCLUDED.updated_at_ms`,
    [workspaceId, JSON.stringify(next), nowMs()],
  );
  return next;
}

export async function wpnPgGetProjectSettings(
  pool: Pool,
  ownerId: string,
  projectId: string,
): Promise<Record<string, unknown>> {
  const { rows } = await pool.query(
    `SELECT s.settings_json
     FROM wpn_project_settings s
     INNER JOIN wpn_project p ON p.id = s.project_id
     INNER JOIN wpn_workspace w ON w.id = p.workspace_id
     WHERE s.project_id = $1 AND w.owner_id = $2`,
    [projectId, ownerId],
  );
  const raw = (rows[0] as { settings_json?: string } | undefined)?.settings_json;
  if (!raw) return {};
  try {
    const j = JSON.parse(raw) as unknown;
    return j && typeof j === "object" && !Array.isArray(j)
      ? (j as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function wpnPgPatchProjectSettings(
  pool: Pool,
  ownerId: string,
  projectId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Ensure project exists + owned (via workspace join).
  const { rows } = await pool.query(
    `SELECT p.id
     FROM wpn_project p
     INNER JOIN wpn_workspace w ON w.id = p.workspace_id
     WHERE p.id = $1 AND w.owner_id = $2`,
    [projectId, ownerId],
  );
  if (rows.length === 0) {
    throw new Error("Project not found");
  }
  const cur = await wpnPgGetProjectSettings(pool, ownerId, projectId);
  const next = { ...cur, ...patch };
  await pool.query(
    `INSERT INTO wpn_project_settings (project_id, settings_json, updated_at_ms)
     VALUES ($1, $2, $3)
     ON CONFLICT (project_id) DO UPDATE SET settings_json = EXCLUDED.settings_json, updated_at_ms = EXCLUDED.updated_at_ms`,
    [projectId, JSON.stringify(next), nowMs()],
  );
  return next;
}

