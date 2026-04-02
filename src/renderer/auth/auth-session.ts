export type AuthUser = { id: string; email: string; username: string; isAdmin?: boolean };

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token && token.trim().length > 0 ? token.trim() : null;
}

