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
  if (msg === "NODEX_UNAUTHORIZED" || msg.includes("(401)")) {
    return unauthenticatedToolResult(
      msg === "NODEX_UNAUTHORIZED" ? "Session expired or invalid (401)." : msg,
    );
  }
  return null;
}
