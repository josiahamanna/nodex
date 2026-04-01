import type { Pool } from "pg";
import { WPN_SCHEMA_VERSION } from "./wpn-types";

/** Postgres DDL aligned with {@link ensureWpnV2Schema} (SQLite). */
export async function ensureWpnPgSchema(pool: Pool): Promise<void> {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS wpn_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS wpn_workspace (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      sort_index INTEGER NOT NULL DEFAULT 0,
      color_token TEXT,
      created_at_ms BIGINT NOT NULL,
      updated_at_ms BIGINT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS wpn_project (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES wpn_workspace(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_index INTEGER NOT NULL DEFAULT 0,
      color_token TEXT,
      created_at_ms BIGINT NOT NULL,
      updated_at_ms BIGINT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS wpn_note (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES wpn_project(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES wpn_note(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      metadata_json TEXT,
      sibling_index INTEGER NOT NULL DEFAULT 0,
      created_at_ms BIGINT NOT NULL,
      updated_at_ms BIGINT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_wpn_project_workspace ON wpn_project(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_wpn_note_project ON wpn_note(project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_wpn_note_parent ON wpn_note(parent_id)`,
    `CREATE TABLE IF NOT EXISTS wpn_explorer_state (
      project_id TEXT PRIMARY KEY NOT NULL REFERENCES wpn_project(id) ON DELETE CASCADE,
      expanded_ids_json TEXT NOT NULL DEFAULT '[]'
    )`,
  ];
  for (const sql of stmts) {
    await pool.query(sql);
  }
  const { rows } = await pool.query("SELECT value FROM wpn_meta WHERE key = $1", [
    "schema_version",
  ]);
  if (rows.length === 0) {
    await pool.query("INSERT INTO wpn_meta (key, value) VALUES ($1, $2)", [
      "schema_version",
      String(WPN_SCHEMA_VERSION),
    ]);
  }
}
