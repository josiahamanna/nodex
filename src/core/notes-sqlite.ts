import * as fs from "fs";
import * as path from "path";
import type { Database } from "better-sqlite3";
import {
  exportSerializedState,
  importSerializedState,
  ROOT_KEY,
  type SerializedNotesState,
} from "./notes-store";
import { ensureWpnV2Schema } from "./wpn/wpn-schema-sqlite";

const SchemaVersion = 1;
const APP_META_HOME_WELCOME_MD_KEY = "home_welcome_markdown_v1";

const DEFAULT_HOME_WELCOME_MARKDOWN = `# Welcome to Nodex

This **Home** note is the workspace root — use it as your documentation landing page.

## Tips

- Add child notes for topics, specs, and runbooks.
- Use **Markdown** notes for readable docs; other note types showcase plugins.
- The tree on the left is your single outline for everything in this workspace.

---

_Edit this page anytime to match your project._`;

export function getAppMeta(db: Database, key: string): string | null {
  const row = db
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setAppMeta(db: Database, key: string, value: string): void {
  db.prepare(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

export function getHomeWelcomeMarkdown(db: Database): string {
  return getAppMeta(db, APP_META_HOME_WELCOME_MD_KEY) ?? DEFAULT_HOME_WELCOME_MARKDOWN;
}

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
  // Seed DB-backed Home/Welcome markdown once so it can be edited by changing the DB,
  // without rebuilding the app. (Used only when seeding an empty workspace.)
  const welcome = db
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .get(APP_META_HOME_WELCOME_MD_KEY) as { value: string } | undefined;
  if (!welcome) {
    db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run(
      APP_META_HOME_WELCOME_MD_KEY,
      DEFAULT_HOME_WELCOME_MARKDOWN,
    );
  }
  ensureWpnV2Schema(db);
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
  saveWorkspaceToDatabases(db);
}

function ensureSchemaOnAlias(db: Database, alias: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${alias}.app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ${alias}.notes (
      id TEXT PRIMARY KEY NOT NULL,
      parent_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata_json TEXT
    );
    CREATE TABLE IF NOT EXISTS ${alias}.child_order (
      parent_key TEXT NOT NULL,
      ord INTEGER NOT NULL,
      child_id TEXT NOT NULL,
      PRIMARY KEY (parent_key, ord)
    );
  `);
  const row = db
    .prepare(`SELECT value FROM ${alias}.app_meta WHERE key = ?`)
    .get("schema_version") as { value: string } | undefined;
  if (!row) {
    db.prepare(`INSERT INTO ${alias}.app_meta (key, value) VALUES (?, ?)`).run(
      "schema_version",
      String(SchemaVersion),
    );
  }
}

/** Read attached DB (alias `ext1`, …) into a serialized shape (native ids). */
export function readSerializedFromAlias(
  db: Database,
  alias: string,
): SerializedNotesState {
  const tp = `${alias}.`;
  const cnt = db.prepare(`SELECT COUNT(*) AS c FROM ${tp}notes`).get() as {
    c: number;
  };
  if (cnt.c === 0) {
    return { v: 1, records: [], order: {} };
  }
  const rows = db.prepare(`SELECT * FROM ${tp}notes`).all() as Array<{
    id: string;
    parent_id: string | null;
    type: string;
    title: string;
    content: string;
    metadata_json: string | null;
  }>;
  const orderRows = db
    .prepare(
      `SELECT parent_key, child_id FROM ${tp}child_order ORDER BY parent_key, ord ASC`,
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
  return { v: 1, records, order };
}

function filterOrderForMain(
  order: Record<string, string[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, ids] of Object.entries(order)) {
    if (!Array.isArray(ids)) {
      continue;
    }
    if (/^r\d+_/.test(k)) {
      continue;
    }
    out[k] = ids.filter((id) => !/^r\d+_/.test(id));
  }
  return out;
}

function buildAttachedOrder(
  order: Record<string, string[]>,
  slot: number,
  mountId: string,
  pref: string,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, ids] of Object.entries(order)) {
    if (!Array.isArray(ids)) {
      continue;
    }
    if (k === mountId) {
      out[ROOT_KEY] = ids
        .filter((id) => id.startsWith(pref))
        .map((id) => id.slice(pref.length));
      continue;
    }
    if (!k.startsWith(pref)) {
      continue;
    }
    const nk = k.slice(pref.length);
    out[nk] = ids
      .filter((id) => id.startsWith(pref))
      .map((id) => id.slice(pref.length));
  }
  return out;
}

/** Persist in-memory notes into primary + ATTACHed DBs (`rN_` prefix → extN). */
export function saveWorkspaceToDatabases(db: Database): void {
  const state = exportSerializedState();
  const tx = db.transaction(() => {
    const mainRecs = state.records.filter((r) => !/^r\d+_/.test(r.id));
    db.prepare("DELETE FROM child_order").run();
    db.prepare("DELETE FROM notes").run();
    const insNote = db.prepare(
      `INSERT INTO notes (id, parent_id, type, title, content, metadata_json)
       VALUES (@id, @parent_id, @type, @title, @content, @metadata_json)`,
    );
    for (const r of mainRecs) {
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
    const mainOrder = filterOrderForMain(state.order);
    for (const [parentKey, ids] of Object.entries(mainOrder)) {
      if (!Array.isArray(ids)) {
        continue;
      }
      ids.forEach((childId, ord) => {
        if (typeof childId === "string") {
          insOrd.run(parentKey, ord, childId);
        }
      });
    }

    for (let i = 0; i < attachedAliases.length; i++) {
      const slot = i + 1;
      const alias = attachedAliases[i]!;
      const pref = `r${slot}_`;
      const mountId = `__nodex_mount_${slot}`;
      const attachedRecs = state.records
        .filter((r) => r.id.startsWith(pref))
        .map((r) => ({
          ...r,
          id: r.id.slice(pref.length),
          parentId:
            r.parentId === mountId
              ? null
              : r.parentId != null && r.parentId.startsWith(pref)
                ? r.parentId.slice(pref.length)
                : null,
        }));
      db.prepare(`DELETE FROM ${alias}.child_order`).run();
      db.prepare(`DELETE FROM ${alias}.notes`).run();
      const insA = db.prepare(
        `INSERT INTO ${alias}.notes (id, parent_id, type, title, content, metadata_json)
         VALUES (@id, @parent_id, @type, @title, @content, @metadata_json)`,
      );
      for (const r of attachedRecs) {
        insA.run({
          id: r.id,
          parent_id: r.parentId,
          type: r.type,
          title: r.title,
          content: r.content,
          metadata_json:
            r.metadata != null ? JSON.stringify(r.metadata) : null,
        });
      }
      const attOrder = buildAttachedOrder(state.order, slot, mountId, pref);
      const insOA = db.prepare(
        `INSERT INTO ${alias}.child_order (parent_key, ord, child_id) VALUES (?, ?, ?)`,
      );
      for (const [parentKey, ids] of Object.entries(attOrder)) {
        if (!Array.isArray(ids)) {
          continue;
        }
        ids.forEach((childId, ord) => {
          if (typeof childId === "string") {
            insOA.run(parentKey, ord, childId);
          }
        });
      }
    }
  });
  tx();
}

let notesDb: Database | null = null;
let attachedAliases: string[] = [];

export function getAttachedDatabaseAliases(): string[] {
  return [...attachedAliases];
}

function detachAllAttached(db: Database): void {
  for (const a of [...attachedAliases].reverse()) {
    try {
      db.exec(`DETACH DATABASE ${a}`);
    } catch {
      /* ignore */
    }
  }
  attachedAliases = [];
}

/**
 * Primary DB at `rootPaths[0]/data/nodex.sqlite`; additional folders ATTACHed as ext1…
 */
export function initWorkspaceNotesDatabase(rootPaths: string[]): Database {
  if (rootPaths.length === 0) {
    throw new Error("initWorkspaceNotesDatabase: no roots");
  }
  if (notesDb) {
    try {
      detachAllAttached(notesDb);
      notesDb.close();
    } catch {
      /* ignore */
    }
    notesDb = null;
  }
  const mainPath = path.join(rootPaths[0]!, "data", "nodex.sqlite");
  notesDb = openDb(mainPath);
  ensureSchema(notesDb);
  attachedAliases = [];
  for (let i = 1; i < rootPaths.length; i++) {
    const dbPath = path.join(rootPaths[i]!, "data", "nodex.sqlite");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const alias = `ext${i}`;
    notesDb.prepare(`ATTACH DATABASE ? AS ${alias}`).run(dbPath);
    ensureSchemaOnAlias(notesDb, alias);
    attachedAliases.push(alias);
  }
  return notesDb;
}

/** @deprecated Use initWorkspaceNotesDatabase([path]) */
export function initNotesSqlite(dbFilePath: string): Database {
  return initWorkspaceNotesDatabase([path.dirname(path.dirname(dbFilePath))]);
}

export function getNotesDatabase(): Database | null {
  return notesDb;
}

export function closeNotesSqlite(): void {
  if (notesDb) {
    try {
      detachAllAttached(notesDb);
      notesDb.close();
    } catch {
      /* ignore */
    }
    notesDb = null;
  }
}
