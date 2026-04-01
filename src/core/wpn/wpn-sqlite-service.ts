import type { Database } from "better-sqlite3";
import * as crypto from "crypto";
import type { WpnProjectRow, WpnWorkspaceRow } from "./wpn-types";

function nowMs(): number {
  return Date.now();
}

function newId(): string {
  return crypto.randomUUID();
}

export function wpnSqliteListWorkspaces(db: Database, ownerId: string): WpnWorkspaceRow[] {
  return db
    .prepare(
      "SELECT id, name, sort_index, color_token, created_at_ms, updated_at_ms FROM wpn_workspace WHERE owner_id = ? ORDER BY sort_index ASC, name ASC",
    )
    .all(ownerId) as WpnWorkspaceRow[];
}

export function wpnSqliteCreateWorkspace(
  db: Database,
  ownerId: string,
  name: string,
): WpnWorkspaceRow {
  const id = newId();
  const t = nowMs();
  const maxRow = db
    .prepare(
      "SELECT COALESCE(MAX(sort_index), -1) AS m FROM wpn_workspace WHERE owner_id = ?",
    )
    .get(ownerId) as { m: number };
  const sort_index = maxRow.m + 1;
  db.prepare(
    `INSERT INTO wpn_workspace (id, name, sort_index, color_token, created_at_ms, updated_at_ms, owner_id)
     VALUES (?, ?, ?, NULL, ?, ?, ?)`,
  ).run(id, name.trim() || "Workspace", sort_index, t, t, ownerId);
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
  ownerId: string,
  id: string,
  patch: { name?: string; sort_index?: number; color_token?: string | null },
): WpnWorkspaceRow | null {
  const cur = db
    .prepare(
      "SELECT id, name, sort_index, color_token, created_at_ms, updated_at_ms FROM wpn_workspace WHERE id = ? AND owner_id = ?",
    )
    .get(id, ownerId) as WpnWorkspaceRow | undefined;
  if (!cur) return null;
  const name = patch.name !== undefined ? patch.name.trim() || cur.name : cur.name;
  const sort_index = patch.sort_index !== undefined ? patch.sort_index : cur.sort_index;
  const color_token =
    patch.color_token !== undefined ? patch.color_token : cur.color_token;
  const updated_at_ms = nowMs();
  db.prepare(
    `UPDATE wpn_workspace SET name = ?, sort_index = ?, color_token = ?, updated_at_ms = ? WHERE id = ? AND owner_id = ?`,
  ).run(name, sort_index, color_token, updated_at_ms, id, ownerId);
  return { ...cur, name, sort_index, color_token, updated_at_ms };
}

export function wpnSqliteDeleteWorkspace(db: Database, ownerId: string, id: string): boolean {
  const r = db.prepare("DELETE FROM wpn_workspace WHERE id = ? AND owner_id = ?").run(id, ownerId);
  return r.changes > 0;
}

export function wpnSqliteListProjects(
  db: Database,
  ownerId: string,
  workspaceId: string,
): WpnProjectRow[] {
  return db
    .prepare(
      `SELECT p.id, p.workspace_id, p.name, p.sort_index, p.color_token, p.created_at_ms, p.updated_at_ms
       FROM wpn_project p
       INNER JOIN wpn_workspace w ON w.id = p.workspace_id
       WHERE p.workspace_id = ? AND w.owner_id = ?
       ORDER BY p.sort_index ASC, p.name ASC`,
    )
    .all(workspaceId, ownerId) as WpnProjectRow[];
}

export function wpnSqliteCreateProject(
  db: Database,
  ownerId: string,
  workspaceId: string,
  name: string,
): WpnProjectRow | null {
  const ws = db
    .prepare("SELECT id FROM wpn_workspace WHERE id = ? AND owner_id = ?")
    .get(workspaceId, ownerId);
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
  ownerId: string,
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
      `SELECT p.id, p.workspace_id, p.name, p.sort_index, p.color_token, p.created_at_ms, p.updated_at_ms
       FROM wpn_project p
       INNER JOIN wpn_workspace w ON w.id = p.workspace_id
       WHERE p.id = ? AND w.owner_id = ?`,
    )
    .get(id, ownerId) as WpnProjectRow | undefined;
  if (!cur) return null;
  const workspace_id = patch.workspace_id ?? cur.workspace_id;
  if (patch.workspace_id) {
    const ws = db
      .prepare("SELECT id FROM wpn_workspace WHERE id = ? AND owner_id = ?")
      .get(workspace_id, ownerId);
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

export function wpnSqliteDeleteProject(db: Database, ownerId: string, id: string): boolean {
  const r = db
    .prepare(
      `DELETE FROM wpn_project WHERE id = ? AND EXISTS (
         SELECT 1 FROM wpn_workspace w
         WHERE w.id = wpn_project.workspace_id AND w.owner_id = ?
       )`,
    )
    .run(id, ownerId);
  return r.changes > 0;
}

export function wpnSqliteProjectOwnedBy(
  db: Database,
  ownerId: string,
  projectId: string,
): boolean {
  const r = db
    .prepare(
      `SELECT 1 FROM wpn_project p
       INNER JOIN wpn_workspace w ON w.id = p.workspace_id
       WHERE p.id = ? AND w.owner_id = ?`,
    )
    .get(projectId, ownerId);
  return r != null;
}
