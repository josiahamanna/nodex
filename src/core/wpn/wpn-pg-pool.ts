import { Pool } from "pg";

let cached: Pool | null | undefined;

/** Postgres pool when `NODEX_PG_DATABASE_URL` is set; otherwise `null`. */
export function getWpnPgPool(): Pool | null {
  if (cached !== undefined) {
    return cached;
  }
  const url = process.env.NODEX_PG_DATABASE_URL?.trim();
  if (!url) {
    cached = null;
    return null;
  }
  cached = new Pool({ connectionString: url });
  return cached;
}
