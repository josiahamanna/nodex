import type { Database } from "better-sqlite3";
import * as crypto from "crypto";
import type { WpnProjectRow, WpnWorkspaceRow } from "./wpn-types";

function nowMs(): number {
  return Date.now();
}

function newId(): string {
  return crypto.randomUUID();
}

export function wpnSqliteListWorkspaces(db: Database): WpnWorkspaceRow[] {
  return db
    .prepare(
      "SELECT id, name, sort_index, color_token, created_at_ms, updated_at_ms FROM wpn_workspace ORDER BY sort_index ASC, name ASC",
    )
    .all() as WpnWorkspaceRow[];
}

export function wpnSqliteCreateWorkspace(db: Database, name: string): WpnWorkspaceRow {
  const id = newId();
  const t = nowMs();
  const maxRow = db.prepare("SELECT COALESCE(MAX(sort_index), -1) AS m FROM wpn_workspace").get() as {
    m: number;
  };
  const sort_index = maxRow.m + 1;
  db.prepare(
    `INSERT INTO wpn_workspace (id, name, sort_index, color_token, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, NULL, ?, ?)`,
  ).run(id, name.trim() || "Workspace", sort_index, t, t);
  return {
    id,
    name: name.trim() || "Workspace",
    sort_index,
    color_token: null,
    created_at_ms: t,
    updated_at_ms: t,
  };
}

export function wpnSqliteUpdateWorkspace(
  db: Database,
  id: string,
  patch: { name?: string; sort_index?: number; color_token?: string | null },
): WpnWorkspaceRow | null {
  const cur = db
    .prepare(
      "SELECT id, name, sort_index, color_token, created_at_ms, updated_at_ms FROM wpn_workspace WHERE id = ?",
    )
    .get(id) as WpnWorkspaceRow | undefined;
  if (!cur) return null;
  const name = patch.name !== undefined ? patch.name.trim() || cur.name : cur.name;
  const sort_index = patch.sort_index !== undefined ? patch.sort_index : cur.sort_index;
  const color_token =
    patch.color_token !== undefined ? patch.color_token : cur.color_token;
  const updated_at_ms = nowMs();
  db.prepare(
    `UPDATE wpn_workspace SET name = ?, sort_index = ?, color_token = ?, updated_at_ms = ? WHERE id = ?`,
  ).run(name, sort_index, color_token, updated_at_ms, id);
  return { ...cur, name, sort_index, color_token, updated_at_ms };
}

export function wpnSqliteDeleteWorkspace(db: Database, id: string): boolean {
  const r = db.prepare("DELETE FROM wpn_workspace WHERE id = ?").run(id);
  return r.changes > 0;
}

export function wpnSqliteListProjects(db: Database, workspaceId: string): WpnProjectRow[] {
  return db
    .prepare(
      `SELECT id, workspace_id, name, sort_index, color_token, created_at_ms, updated_at_ms
       FROM wpn_project WHERE workspace_id = ? ORDER BY sort_index ASC, name ASC`,
    )
    .all(workspaceId) as WpnProjectRow[];
}

export function wpnSqliteCreateProject(
  db: Database,
  workspaceId: string,
  name: string,
): WpnProjectRow | null {
  const ws = db.prepare("SELECT id FROM wpn_workspace WHERE id = ?").get(workspaceId);
  if (!ws) return null;
  const id = newId();
  const t = nowMs();
  const maxRow = db
    .prepare(
      "SELECT COALESCE(MAX(sort_index), -1) AS m FROM wpn_project WHERE workspace_id = ?",
    )
    .get(workspaceId) as { m: number };
  const sort_index = maxRow.m + 1;
  db.prepare(
    `INSERT INTO wpn_project (id, workspace_id, name, sort_index, color_token, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`,
  ).run(id, workspaceId, name.trim() || "Project", sort_index, t, t);
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

export function wpnSqliteUpdateProject(
  db: Database,
  id: string,
  patch: {
    name?: string;
    sort_index?: number;
    color_token?: string | null;
    workspace_id?: string;
  },
): WpnProjectRow | null {
  const cur = db
    .prepare(
      "SELECT id, workspace_id, name, sort_index, color_token, created_at_ms, updated_at_ms FROM wpn_project WHERE id = ?",
    )
    .get(id) as WpnProjectRow | undefined;
  if (!cur) return null;
  const workspace_id = patch.workspace_id ?? cur.workspace_id;
  if (patch.workspace_id) {
    const ws = db.prepare("SELECT id FROM wpn_workspace WHERE id = ?").get(workspace_id);
    if (!ws) return null;
  }
  const name = patch.name !== undefined ? patch.name.trim() || cur.name : cur.name;
  const sort_index = patch.sort_index !== undefined ? patch.sort_index : cur.sort_index;
  const color_token =
    patch.color_token !== undefined ? patch.color_token : cur.color_token;
  const updated_at_ms = nowMs();
  db.prepare(
    `UPDATE wpn_project SET workspace_id = ?, name = ?, sort_index = ?, color_token = ?, updated_at_ms = ?
     WHERE id = ?`,
  ).run(workspace_id, name, sort_index, color_token, updated_at_ms, id);
  return {
    ...cur,
    workspace_id,
    name,
    sort_index,
    color_token,
    updated_at_ms,
  };
}

export function wpnSqliteDeleteProject(db: Database, id: string): boolean {
  const r = db.prepare("DELETE FROM wpn_project WHERE id = ?").run(id);
  return r.changes > 0;
}
