import type { Pool } from "pg";

export const AUTH_SCHEMA_VERSION = 1;

export async function ensureAuthPgSchema(pool: Pool): Promise<void> {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS auth_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS auth_user (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at_ms BIGINT NOT NULL,
      updated_at_ms BIGINT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS auth_refresh_session (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
      refresh_token_hash TEXT NOT NULL UNIQUE,
      created_at_ms BIGINT NOT NULL,
      expires_at_ms BIGINT NOT NULL,
      revoked_at_ms BIGINT,
      user_agent TEXT,
      ip TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_auth_refresh_session_user ON auth_refresh_session(user_id)`,
    `CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
      prefs_json TEXT NOT NULL DEFAULT '{}',
      updated_at_ms BIGINT NOT NULL
    )`,
  ];

  for (const sql of stmts) {
    await pool.query(sql);
  }

  // Ensure forward-compatible schema (older installs may already have the table).
  await pool.query("ALTER TABLE auth_user ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE");

  const { rows } = await pool.query<{ value: string }>(
    "SELECT value FROM auth_meta WHERE key = $1",
    ["schema_version"],
  );
  if (rows.length === 0) {
    await pool.query("INSERT INTO auth_meta (key, value) VALUES ($1, $2)", [
      "schema_version",
      String(AUTH_SCHEMA_VERSION),
    ]);
  }
}

