const SYNC_API_V1_SUFFIX = "/api/v1";

/**
 * Ensures the sync HTTP base ends with `/api/v1` (no trailing slash) when the URL is only an origin
 * (e.g. `http://127.0.0.1:4010`). Leaves URLs that already include a path segment unchanged.
 */
export function normalizeSyncApiBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) {
    return "";
  }
  const lc = trimmed.toLowerCase();
  if (lc.endsWith(SYNC_API_V1_SUFFIX)) {
    return trimmed;
  }
  try {
    const u = new URL(trimmed);
    const path = u.pathname.replace(/\/$/, "") || "";
    if (path === "" || path === "/") {
      u.pathname = SYNC_API_V1_SUFFIX;
      return u.toString().replace(/\/$/, "");
    }
  } catch {
    /* non-absolute URL or invalid — return trimmed as-is */
  }
  return trimmed;
}

/**
 * Resolves the Fastify sync API base URL (no trailing slash).
 * Precedence: `getSyncApiBaseUrl` option → `window.__NODEX_SYNC_API_BASE__` →
 * `NEXT_PUBLIC_NODEX_SYNC_API_URL` / `NODEX_SYNC_API_URL` → dev default `http://127.0.0.1:4010/api/v1`.
 */
export function createSyncBaseUrlResolver(
  override?: () => string,
): () => string {
  return () => {
    if (override) {
      const o = normalizeSyncApiBaseUrl(override());
      if (o) {
        return o;
      }
    }
    if (typeof window !== "undefined") {
      const w = window as Window & { __NODEX_SYNC_API_BASE__?: string };
      const fromWin = w.__NODEX_SYNC_API_BASE__?.trim();
      if (fromWin) {
        return normalizeSyncApiBaseUrl(fromWin);
      }
    }
    try {
      const pub =
        typeof process !== "undefined" &&
        typeof process.env?.NEXT_PUBLIC_NODEX_SYNC_API_URL === "string"
          ? process.env.NEXT_PUBLIC_NODEX_SYNC_API_URL.trim()
          : "";
      if (pub) {
        return normalizeSyncApiBaseUrl(pub);
      }
      const env =
        typeof process !== "undefined" &&
        typeof process.env?.NODEX_SYNC_API_URL === "string"
          ? process.env.NODEX_SYNC_API_URL.trim()
          : "";
      if (env) {
        return normalizeSyncApiBaseUrl(env);
      }
      if (
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development"
      ) {
        return "http://127.0.0.1:4010/api/v1";
      }
    } catch {
      /* no process in browser without bundler */
    }
    return "";
  };
}
