/**
 * Resolve HTTP base + bearer for WPN calls.
 *
 * Cloud: NODEX_SYNC_API_BASE (must include `/api/v1`) + NODEX_ACCESS_TOKEN or NODEX_JWT.
 * Local: NODEX_LOCAL_WPN_URL (e.g. http://127.0.0.1:41234) + NODEX_LOCAL_WPN_TOKEN.
 */
export type WpnHttpConfig = {
  baseUrl: string;
  bearerToken: string;
};

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

function normalizeSyncBase(raw: string): string {
  const t = trimSlash(raw.trim());
  if (t.endsWith("/api/v1")) {
    return t;
  }
  return `${t}/api/v1`;
}

export function loadWpnHttpConfig(): WpnHttpConfig {
  const localUrl = process.env.NODEX_LOCAL_WPN_URL?.trim();
  const localToken = process.env.NODEX_LOCAL_WPN_TOKEN?.trim();
  if (localUrl && localToken) {
    return { baseUrl: trimSlash(localUrl), bearerToken: localToken };
  }

  const syncRaw = process.env.NODEX_SYNC_API_BASE?.trim();
  if (!syncRaw) {
    throw new Error(
      "Set either (NODEX_LOCAL_WPN_URL + NODEX_LOCAL_WPN_TOKEN) for Electron loopback, or " +
        "NODEX_SYNC_API_BASE (+ NODEX_ACCESS_TOKEN or NODEX_JWT) for cloud sync-api.",
    );
  }
  const token =
    process.env.NODEX_ACCESS_TOKEN?.trim() ||
    process.env.NODEX_JWT?.trim() ||
    "";
  if (!token) {
    throw new Error(
      "Cloud mode requires NODEX_ACCESS_TOKEN or NODEX_JWT (Bearer value, no 'Bearer ' prefix).",
    );
  }
  return { baseUrl: normalizeSyncBase(syncRaw), bearerToken: token };
}
