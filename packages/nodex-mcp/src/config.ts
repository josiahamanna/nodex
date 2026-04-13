/**
 * Resolve HTTP base + mutable tokens for WPN calls.
 *
 * Local: NODEX_LOCAL_WPN_URL + NODEX_LOCAL_WPN_TOKEN.
 * Cloud: NODEX_SYNC_API_BASE (must include `/api/v1`) + NODEX_ACCESS_TOKEN or NODEX_JWT,
 *   or with NODEX_MCP_CLOUD_SESSION=1 optional env token + optional persisted session file.
 */
import { McpTokenHolder } from "./mcp-token-holder.js";
import { readPersistedMcpAuth, resolveMcpAuthPersistPath } from "./mcp-cloud-auth-persist.js";

export type WpnHttpConfig = {
  baseUrl: string;
  bearerToken: string;
};

export type McpAuthRuntime = {
  baseUrl: string;
  holder: McpTokenHolder;
  /** True when NODEX_MCP_CLOUD_SESSION=1 (cloud only). */
  cloudSession: boolean;
  /** Absolute path for cloud session persistence; null for local / env-only cloud. */
  persistPath: string | null;
  /** local | cloud_env | cloud_session */
  mode: "local" | "cloud_env" | "cloud_session";
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

function truthyEnv(v: string | undefined): boolean {
  const t = v?.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

/**
 * Load MCP auth: local loopback, cloud with required env token, or cloud session (optional token + persist).
 */
export function loadMcpAuthRuntime(): McpAuthRuntime {
  const localUrl = process.env.NODEX_LOCAL_WPN_URL?.trim();
  const localToken = process.env.NODEX_LOCAL_WPN_TOKEN?.trim();
  if (localUrl && localToken) {
    const holder = new McpTokenHolder();
    holder.setTokens(localToken, null);
    return {
      baseUrl: trimSlash(localUrl),
      holder,
      cloudSession: false,
      persistPath: null,
      mode: "local",
    };
  }

  const syncRaw = process.env.NODEX_SYNC_API_BASE?.trim();
  if (!syncRaw) {
    throw new Error(
      "Set either (NODEX_LOCAL_WPN_URL + NODEX_LOCAL_WPN_TOKEN) for Electron loopback, or " +
        "NODEX_SYNC_API_BASE for cloud sync-api.",
    );
  }
  const baseUrl = normalizeSyncBase(syncRaw);
  const envAccess =
    process.env.NODEX_ACCESS_TOKEN?.trim() || process.env.NODEX_JWT?.trim() || "";
  const cloudSession = truthyEnv(process.env.NODEX_MCP_CLOUD_SESSION);

  if (!cloudSession) {
    if (!envAccess) {
      throw new Error(
        "Cloud mode requires NODEX_ACCESS_TOKEN or NODEX_JWT (Bearer value, no 'Bearer ' prefix), " +
          "or set NODEX_MCP_CLOUD_SESSION=1 for interactive login / persisted session.",
      );
    }
    const holder = new McpTokenHolder();
    holder.setTokens(envAccess, null);
    return {
      baseUrl,
      holder,
      cloudSession: false,
      persistPath: null,
      mode: "cloud_env",
    };
  }

  const persistPath = resolveMcpAuthPersistPath();
  const persisted = readPersistedMcpAuth(persistPath);
  const initialAccess = envAccess || persisted?.accessToken || "";
  const initialRefresh = persisted?.refreshToken?.trim()
    ? persisted.refreshToken
    : null;
  const holder = new McpTokenHolder();
  holder.setTokens(initialAccess, initialRefresh);
  return {
    baseUrl,
    holder,
    cloudSession: true,
    persistPath,
    mode: "cloud_session",
  };
}

/** @deprecated use loadMcpAuthRuntime + holder */
export function loadWpnHttpConfig(): WpnHttpConfig {
  const r = loadMcpAuthRuntime();
  return { baseUrl: r.baseUrl, bearerToken: r.holder.accessToken };
}
