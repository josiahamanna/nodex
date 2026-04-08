/**
 * Resolves the Fastify sync API base URL (no trailing slash).
 * Precedence: `getSyncApiBaseUrl` option → `window.__NODEX_SYNC_API_BASE__` →
 * `NEXT_PUBLIC_NODEX_SYNC_API_URL` / `NODEX_SYNC_API_URL` → dev default `http://127.0.0.1:4010`.
 */
export function createSyncBaseUrlResolver(
  override?: () => string,
): () => string {
  return () => {
    if (override) {
      const o = override().trim().replace(/\/$/, "");
      if (o) {
        return o;
      }
    }
    if (typeof window !== "undefined") {
      const w = window as Window & { __NODEX_SYNC_API_BASE__?: string };
      const fromWin = w.__NODEX_SYNC_API_BASE__?.trim();
      if (fromWin) {
        return fromWin.replace(/\/$/, "");
      }
    }
    try {
      const pub =
        typeof process !== "undefined" &&
        typeof process.env?.NEXT_PUBLIC_NODEX_SYNC_API_URL === "string"
          ? process.env.NEXT_PUBLIC_NODEX_SYNC_API_URL.trim()
          : "";
      if (pub) {
        return pub.replace(/\/$/, "");
      }
      const env =
        typeof process !== "undefined" &&
        typeof process.env?.NODEX_SYNC_API_URL === "string"
          ? process.env.NODEX_SYNC_API_URL.trim()
          : "";
      if (env) {
        return env.replace(/\/$/, "");
      }
      if (
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development"
      ) {
        return "http://127.0.0.1:4010";
      }
    } catch {
      /* no process in browser without bundler */
    }
    return "";
  };
}
