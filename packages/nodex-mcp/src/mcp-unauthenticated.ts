import { jsonResult, type ToolReturn } from "./text-result.js";

export const SUGGESTED_LOGIN_TOOLS = [
  "nodex_login_browser_start",
  "nodex_login_browser_poll",
  "nodex_login",
] as const;

export function unauthenticatedToolResult(detail: string): ToolReturn {
  return jsonResult({
    error: "unauthenticated",
    suggested_tools: [...SUGGESTED_LOGIN_TOOLS],
    detail,
  });
}

export function mapWpnCaughtError(e: unknown, cloudSession: boolean): ToolReturn | null {
  const msg = e instanceof Error ? e.message : String(e);
  if (!cloudSession) {
    return null;
  }
  if (msg.startsWith("NODEX_UNAUTHORIZED") || msg.includes("(401)")) {
    let detail: string;
    if (msg.startsWith("NODEX_UNAUTHORIZED")) {
      const apiPart = msg.slice("NODEX_UNAUTHORIZED".length).replace(/^:\s*/, "").trim();
      detail = apiPart
        ? `Session expired or invalid (401): ${apiPart}`
        : "Session expired or invalid (401).";
    } else {
      detail = msg;
    }
    return unauthenticatedToolResult(detail);
  }
  return null;
}
