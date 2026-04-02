import * as fs from "fs";
import * as path from "path";
import type { Pool } from "pg";

export async function ensureHeadlessPluginCatalogPgSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nodex_headless_session_plugin (
      plugin_id TEXT PRIMARY KEY NOT NULL,
      manifest_version TEXT,
      loaded BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export type HeadlessSessionPluginRow = {
  plugin_id: string;
  manifest_version: string | null;
  loaded: boolean;
};

export async function replaceHeadlessSessionPluginCatalog(
  pool: Pool,
  rows: HeadlessSessionPluginRow[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM nodex_headless_session_plugin");
    for (const r of rows) {
      await client.query(
        `INSERT INTO nodex_headless_session_plugin (plugin_id, manifest_version, loaded, updated_at)
         VALUES ($1, $2, $3, now())`,
        [r.plugin_id, r.manifest_version, r.loaded],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function upsertHeadlessSessionPlugin(
  pool: Pool,
  row: HeadlessSessionPluginRow,
): Promise<void> {
  await pool.query(
    `INSERT INTO nodex_headless_session_plugin (plugin_id, manifest_version, loaded, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (plugin_id) DO UPDATE SET
       manifest_version = EXCLUDED.manifest_version,
       loaded = EXCLUDED.loaded,
       updated_at = now()`,
    [row.plugin_id, row.manifest_version, row.loaded],
  );
}

export async function listHeadlessSessionLoadedPluginIdsPg(
  pool: Pool,
): Promise<string[]> {
  const { rows } = await pool.query<{ plugin_id: string }>(
    "SELECT plugin_id FROM nodex_headless_session_plugin WHERE loaded = true ORDER BY plugin_id",
  );
  return rows.map((r) => r.plugin_id);
}

export function readManifestVersionFromDir(pluginDir: string): string | null {
  const mp = path.join(pluginDir, "manifest.json");
  if (!fs.existsSync(mp)) {
    return null;
  }
  try {
    const m = JSON.parse(fs.readFileSync(mp, "utf8")) as { version?: string };
    return typeof m.version === "string" ? m.version : null;
  } catch {
    return null;
  }
}
