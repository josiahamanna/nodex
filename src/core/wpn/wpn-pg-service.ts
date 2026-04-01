import * as crypto from "crypto";
import type { Pool } from "pg";
import type { WpnProjectRow, WpnWorkspaceRow } from "./wpn-types";

function nowMs(): number {
  return Date.now();
}

function newId(): string {
  return crypto.randomUUID();
}

export async function wpnPgListWorkspaces(pool: Pool): Promise<WpnWorkspaceRow[]> {
  const { rows } = await pool.query<WpnWorkspaceRow>(
    `SELECT id, name, sort_index, color_token, created_at_ms, updated_at_ms
     FROM wpn_workspace ORDER BY sort_index ASC, name ASC`,
  );
  return rows;
}

export async function wpnPgCreateWorkspace(pool: Pool, name: string): Promise<WpnWorkspaceRow> {
  const id = newId();
  const t = nowMs();
  const { rows: maxRows } = await pool.query<{ m: string }>(
    "SELECT COALESCE(MAX(sort_index), -1)::text AS m FROM wpn_workspace",
  );
  const sort_index = Number(maxRows[0]?.m ?? -1) + 1;
  await pool.query(
    `INSERT INTO wpn_workspace (id, name, sort_index, color_token, created_at_ms, updated_at_ms)
     VALUES ($1, $2, $3, NULL, $4, $5)`,
    [id, name.trim() || "Workspace", sort_index, t, t],
  );
  return {
    id,
    name: name.trim() || "Workspace",
    sort_index,
    color_token: null,
    created_at_ms: t,
    updated_at_ms: t,
  };
}

export async function wpnPgUpdateWorkspace(
  pool: Pool,
  id: string,
  patch: { name?: string; sort_index?: number; color_token?: string | null },
): Promise<WpnWorkspaceRow | null> {
  const { rows: curRows } = await pool.query<WpnWorkspaceRow>(
    "SELECT id, name, sort_index, color_token, created_at_ms, updated_at_ms FROM wpn_workspace WHERE id = $1",
    [id],
  );
  const cur = curRows[0];
  if (!cur) return null;
  const name = patch.name !== undefined ? patch.name.trim() || cur.name : cur.name;
  const sort_index = patch.sort_index !== undefined ? patch.sort_index : cur.sort_index;
  const color_token =
    patch.color_token !== undefined ? patch.color_token : cur.color_token;
  const updated_at_ms = nowMs();
  await pool.query(
    `UPDATE wpn_workspace SET name = $1, sort_index = $2, color_token = $3, updated_at_ms = $4 WHERE id = $5`,
    [name, sort_index, color_token, updated_at_ms, id],
  );
  return { ...cur, name, sort_index, color_token, updated_at_ms };
}

export async function wpnPgDeleteWorkspace(pool: Pool, id: string): Promise<boolean> {
  const { rowCount } = await pool.query("DELETE FROM wpn_workspace WHERE id = $1", [id]);
  return (rowCount ?? 0) > 0;
}

export async function wpnPgListProjects(
  pool: Pool,
  workspaceId: string,
): Promise<WpnProjectRow[]> {
  const { rows } = await pool.query<WpnProjectRow>(
    `SELECT id, workspace_id, name, sort_index, color_token, created_at_ms, updated_at_ms
     FROM wpn_project WHERE workspace_id = $1 ORDER BY sort_index ASC, name ASC`,
    [workspaceId],
  );
  return rows;
}

export async function wpnPgCreateProject(
  pool: Pool,
  workspaceId: string,
  name: string,
): Promise<WpnProjectRow | null> {
  const { rows: ws } = await pool.query("SELECT id FROM wpn_workspace WHERE id = $1", [
    workspaceId,
  ]);
  if (ws.length === 0) return null;
  const id = newId();
  const t = nowMs();
  const { rows: maxRows } = await pool.query<{ m: string }>(
    "SELECT COALESCE(MAX(sort_index), -1)::text AS m FROM wpn_project WHERE workspace_id = $1",
    [workspaceId],
  );
  const sort_index = Number(maxRows[0]?.m ?? -1) + 1;
  await pool.query(
    `INSERT INTO wpn_project (id, workspace_id, name, sort_index, color_token, created_at_ms, updated_at_ms)
     VALUES ($1, $2, $3, $4, NULL, $5, $6)`,
    [id, workspaceId, name.trim() || "Project", sort_index, t, t],
  );
  return {
    id,
    workspace_id: workspaceId,
    name: name.trim() || "Project",
    sort_index,
    color_token: null,
    created_at_ms: t,
    updated_at_ms: t,
  };
}

export async function wpnPgUpdateProject(
  pool: Pool,
  id: string,
  patch: {
    name?: string;
    sort_index?: number;
    color_token?: string | null;
    workspace_id?: string;
  },
): Promise<WpnProjectRow | null> {
  const { rows: curRows } = await pool.query<WpnProjectRow>(
    "SELECT id, workspace_id, name, sort_index, color_token, created_at_ms, updated_at_ms FROM wpn_project WHERE id = $1",
    [id],
  );
  const cur = curRows[0];
  if (!cur) return null;
  const workspace_id = patch.workspace_id ?? cur.workspace_id;
  if (patch.workspace_id) {
    const { rows: ws } = await pool.query("SELECT id FROM wpn_workspace WHERE id = $1", [
      workspace_id,
    ]);
    if (ws.length === 0) return null;
  }
  const name = patch.name !== undefined ? patch.name.trim() || cur.name : cur.name;
  const sort_index = patch.sort_index !== undefined ? patch.sort_index : cur.sort_index;
  const color_token =
    patch.color_token !== undefined ? patch.color_token : cur.color_token;
  const updated_at_ms = nowMs();
  await pool.query(
    `UPDATE wpn_project SET workspace_id = $1, name = $2, sort_index = $3, color_token = $4, updated_at_ms = $5
     WHERE id = $6`,
    [workspace_id, name, sort_index, color_token, updated_at_ms, id],
  );
  return {
    ...cur,
    workspace_id,
    name,
    sort_index,
    color_token,
    updated_at_ms,
  };
}

export async function wpnPgDeleteProject(pool: Pool, id: string): Promise<boolean> {
  const { rowCount } = await pool.query("DELETE FROM wpn_project WHERE id = $1", [id]);
  return (rowCount ?? 0) > 0;
}
