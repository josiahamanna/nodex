import * as fs from "fs";
import * as path from "path";
import type { Database } from "better-sqlite3";
import {
  exportSerializedState,
  importSerializedState,
  type SerializedNotesState,
} from "./notes-store";

const SchemaVersion = 1;

function requireBetterSqlite(): typeof import("better-sqlite3") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("better-sqlite3");
}

function openDb(filePath: string): Database {
  const BetterSqlite = requireBetterSqlite();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const db = BetterSqlite(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

function ensureSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY NOT NULL,
      parent_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata_json TEXT
    );
    CREATE TABLE IF NOT EXISTS child_order (
      parent_key TEXT NOT NULL,
      ord INTEGER NOT NULL,
      child_id TEXT NOT NULL,
      PRIMARY KEY (parent_key, ord)
    );
  `);
  const row = db
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .get("schema_version") as { value: string } | undefined;
  if (!row) {
    db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run(
      "schema_version",
      String(SchemaVersion),
    );
  }
}

export function countNotesInDb(db: Database): number {
  const r = db.prepare("SELECT COUNT(*) AS c FROM notes").get() as { c: number };
  return r.c;
}

export function loadFromDatabase(db: Database): boolean {
  const n = countNotesInDb(db);
  if (n === 0) {
    return false;
  }
  const rows = db.prepare("SELECT * FROM notes").all() as Array<{
    id: string;
    parent_id: string | null;
    type: string;
    title: string;
    content: string;
    metadata_json: string | null;
  }>;
  const orderRows = db
    .prepare(
      "SELECT parent_key, child_id FROM child_order ORDER BY parent_key, ord ASC",
    )
    .all() as Array<{ parent_key: string; child_id: string }>;
  const order: Record<string, string[]> = {};
  for (const r of orderRows) {
    if (!order[r.parent_key]) {
      order[r.parent_key] = [];
    }
    order[r.parent_key]!.push(r.child_id);
  }
  const records = rows.map((r) => {
    let metadata: Record<string, unknown> | undefined;
    if (r.metadata_json != null && r.metadata_json.length > 0) {
      try {
        metadata = JSON.parse(r.metadata_json) as Record<string, unknown>;
      } catch {
        metadata = undefined;
      }
    }
    return {
      id: r.id,
      parentId: r.parent_id,
      type: r.type,
      title: r.title,
      content: r.content,
      metadata,
    };
  });
  const state: SerializedNotesState = { v: 1, records, order };
  return importSerializedState(state);
}

export function saveToDatabase(db: Database): void {
  const state = exportSerializedState();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM child_order").run();
    db.prepare("DELETE FROM notes").run();
    const insNote = db.prepare(
      `INSERT INTO notes (id, parent_id, type, title, content, metadata_json)
       VALUES (@id, @parent_id, @type, @title, @content, @metadata_json)`,
    );
    for (const r of state.records) {
      insNote.run({
        id: r.id,
        parent_id: r.parentId,
        type: r.type,
        title: r.title,
        content: r.content,
        metadata_json:
          r.metadata != null ? JSON.stringify(r.metadata) : null,
      });
    }
    const insOrd = db.prepare(
      "INSERT INTO child_order (parent_key, ord, child_id) VALUES (?, ?, ?)",
    );
    for (const [parentKey, ids] of Object.entries(state.order)) {
      if (!Array.isArray(ids)) {
        continue;
      }
      ids.forEach((childId, ord) => {
        if (typeof childId === "string") {
          insOrd.run(parentKey, ord, childId);
        }
      });
    }
  });
  tx();
}

let notesDb: Database | null = null;

export function initNotesSqlite(dbFilePath: string): Database {
  if (notesDb) {
    try {
      notesDb.close();
    } catch {
      /* ignore */
    }
  }
  notesDb = openDb(dbFilePath);
  ensureSchema(notesDb);
  return notesDb;
}

export function getNotesDatabase(): Database | null {
  return notesDb;
}

export function closeNotesSqlite(): void {
  if (notesDb) {
    try {
      notesDb.close();
    } catch {
      /* ignore */
    }
    notesDb = null;
  }
}
