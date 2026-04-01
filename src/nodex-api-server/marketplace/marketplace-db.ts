import * as fs from "fs";
import * as path from "path";
import type { Database } from "better-sqlite3";

function requireBetterSqlite(): typeof import("better-sqlite3") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("better-sqlite3");
}

function openDb(filePath: string): Database {
  const BetterSqlite = requireBetterSqlite();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = BetterSqlite(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

function ensureSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS marketplace_plugins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      owner_user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES marketplace_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS marketplace_releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin_id INTEGER NOT NULL,
      version TEXT NOT NULL,
      object_key TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      UNIQUE (plugin_id, version),
      FOREIGN KEY (plugin_id) REFERENCES marketplace_plugins(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS marketplace_publish_intents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plugin_name TEXT NOT NULL,
      version TEXT NOT NULL,
      object_key TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      finalize_token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES marketplace_users(id) ON DELETE CASCADE
    );
  `);
}

export function openMarketplaceDb(dbPath: string): Database {
  const db = openDb(dbPath);
  ensureSchema(db);
  return db;
}

