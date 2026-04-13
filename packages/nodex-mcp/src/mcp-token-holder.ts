/** Mutable access + refresh tokens for cloud MCP (session or env). */
export class McpTokenHolder {
  accessToken = "";
  refreshToken: string | null = null;

  setTokens(access: string, refresh: string | null): void {
    this.accessToken = access.trim();
    this.refreshToken = refresh?.trim() ? refresh.trim() : null;
  }

  clear(): void {
    this.accessToken = "";
    this.refreshToken = null;
  }

  hasAccess(): boolean {
    return this.accessToken.length > 0;
  }
}
