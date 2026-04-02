import * as fs from "fs";
import * as path from "path";
import type { Database } from "better-sqlite3";
import type { PluginInventoryItem } from "../shared/nodex-renderer-api";

function requireBetterSqlite(): typeof import("better-sqlite3") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("better-sqlite3");
}

export type PluginCatalogPersistRow = {
  plugin_id: string;
  host_tier: string;
  is_bundled: boolean;
  can_toggle: boolean;
  enabled: boolean;
  loaded: boolean;
  manifest_version: string | null;
};

export function getPluginCatalogSqlitePath(userDataPath: string): string {
  return path.join(userDataPath, "plugin-catalog.sqlite");
}

export function openPluginCatalogDb(userDataPath: string): Database {
  const BetterSqlite = requireBetterSqlite();
  const filePath = getPluginCatalogSqlitePath(userDataPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = BetterSqlite(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodex_plugin_catalog (
      plugin_id TEXT PRIMARY KEY NOT NULL,
      host_tier TEXT NOT NULL,
      is_bundled INTEGER NOT NULL,
      can_toggle INTEGER NOT NULL,
      enabled INTEGER NOT NULL,
      loaded INTEGER NOT NULL,
      manifest_version TEXT,
      updated_at_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_nodex_plugin_catalog_tier ON nodex_plugin_catalog(host_tier);
  `);
  return db;
}

/**
 * Replace catalog with the result of the latest filesystem scan + load pass.
 */
export function syncPluginCatalogRows(
  userDataPath: string,
  rows: PluginCatalogPersistRow[],
): void {
  const db = openPluginCatalogDb(userDataPath);
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM nodex_plugin_catalog").run();
    const ins = db.prepare(
      `INSERT INTO nodex_plugin_catalog (
        plugin_id, host_tier, is_bundled, can_toggle, enabled, loaded, manifest_version, updated_at_ms
      ) VALUES (@plugin_id, @host_tier, @is_bundled, @can_toggle, @enabled, @loaded, @manifest_version, @updated_at_ms)`,
    );
    for (const r of rows) {
      ins.run({
        plugin_id: r.plugin_id,
        host_tier: r.host_tier,
        is_bundled: r.is_bundled ? 1 : 0,
        can_toggle: r.can_toggle ? 1 : 0,
        enabled: r.enabled ? 1 : 0,
        loaded: r.loaded ? 1 : 0,
        manifest_version: r.manifest_version,
        updated_at_ms: now,
      });
    }
  });
  tx();
  db.close();
}

/** User-tier rows for Plugin Manager (same filter as before). */
export function readUserTierPluginInventory(
  userDataPath: string,
): PluginInventoryItem[] {
  const db = openPluginCatalogDb(userDataPath);
  try {
    const stmt = db.prepare(
      `SELECT plugin_id, is_bundled, can_toggle, enabled, loaded
       FROM nodex_plugin_catalog
       WHERE host_tier = 'user'
       ORDER BY plugin_id`,
    );
    const raw = stmt.all() as Array<{
      plugin_id: string;
      is_bundled: number;
      can_toggle: number;
      enabled: number;
      loaded: number;
    }>;
    return raw.map((r) => ({
      id: r.plugin_id,
      isBundled: r.is_bundled === 1,
      canToggle: r.can_toggle === 1,
      enabled: r.enabled === 1,
      loaded: r.loaded === 1,
    }));
  } finally {
    db.close();
  }
}

/** Loaded user-tier plugin ids (matches prior getUserFacingLoadedPlugins semantics). */
export function readUserLoadedPluginIds(userDataPath: string): string[] {
  const db = openPluginCatalogDb(userDataPath);
  try {
    const stmt = db.prepare(
      `SELECT plugin_id FROM nodex_plugin_catalog
       WHERE host_tier = 'user' AND loaded = 1
       ORDER BY plugin_id`,
    );
    const raw = stmt.all() as Array<{ plugin_id: string }>;
    return raw.map((r) => r.plugin_id);
  } finally {
    db.close();
  }
}
