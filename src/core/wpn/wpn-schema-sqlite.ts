import type { Database } from "better-sqlite3";
import { WPN_SCHEMA_VERSION } from "./wpn-types";

/**
 * v2 tables prefixed with `wpn_` — coexist with legacy `notes` / `child_order`.
 */
export function ensureWpnV2Schema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wpn_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wpn_workspace (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      sort_index INTEGER NOT NULL DEFAULT 0,
      color_token TEXT,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wpn_project (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_index INTEGER NOT NULL DEFAULT 0,
      color_token TEXT,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES wpn_workspace(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS wpn_note (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      parent_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      metadata_json TEXT,
      sibling_index INTEGER NOT NULL DEFAULT 0,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES wpn_project(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES wpn_note(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_wpn_project_workspace ON wpn_project(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_wpn_note_project ON wpn_note(project_id);
    CREATE INDEX IF NOT EXISTS idx_wpn_note_parent ON wpn_note(parent_id);
    CREATE TABLE IF NOT EXISTS wpn_explorer_state (
      project_id TEXT PRIMARY KEY NOT NULL,
      expanded_ids_json TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (project_id) REFERENCES wpn_project(id) ON DELETE CASCADE
    );
  `);
  const row = db
    .prepare("SELECT value FROM wpn_meta WHERE key = ?")
    .get("schema_version") as { value: string } | undefined;
  if (!row) {
    db.prepare("INSERT INTO wpn_meta (key, value) VALUES (?, ?)").run(
      "schema_version",
      String(WPN_SCHEMA_VERSION),
    );
  }
}
