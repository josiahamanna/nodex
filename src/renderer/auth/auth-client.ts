import { getAccessToken, setAccessToken, type AuthUser } from "./auth-session";

type AuthResponse = { token: string; user: AuthUser };

function errorMessageFromBody(status: number, text: string): string {
  const raw = text.trim();
  if (!raw) {
    return `Request failed (${status})`;
  }
  if (/<\s*!doctype/i.test(raw) || /<\s*html[\s>]/i.test(raw)) {
    return `Request failed (${status}): the server returned a web page instead of JSON. For local dev, either run the legacy headless API with Next proxying (set NODEX_HEADLESS_API_ORIGIN or NODEX_HEADLESS_API_ORIGIN_DEV=1), or use nodex-sync-api and sign up with sync mode enabled (NEXT_PUBLIC_NODEX_SYNC_API_URL / sync WPN env).`;
  }
  try {
    const j = JSON.parse(raw) as { error?: string };
    if (typeof j.error === "string" && j.error.trim()) {
      return j.error.trim();
    }
  } catch {
    /* plain text */
  }
  return raw.length > 500 ? `${raw.slice(0, 500)}…` : raw;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    credentials: "include",
    ...(init ?? {}),
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(errorMessageFromBody(res.status, text));
  }
  return (text ? (JSON.parse(text) as T) : (undefined as T));
}

export async function authSignup(payload: {
  email: string;
  username: string;
  password: string;
}): Promise<AuthUser> {
  const r = await requestJson<AuthResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setAccessToken(r.token);
  return r.user;
}

export async function authLogin(payload: {
  email: string;
  password: string;
}): Promise<AuthUser> {
  const r = await requestJson<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setAccessToken(r.token);
  return r.user;
}

export async function authRefresh(): Promise<AuthUser> {
  const r = await requestJson<AuthResponse>("/auth/refresh", { method: "POST" });
  setAccessToken(r.token);
  return r.user;
}

export async function authLogout(): Promise<void> {
  try {
    await requestJson<{ ok: true }>("/auth/logout", { method: "POST" });
  } finally {
    setAccessToken(null);
  }
}

export async function authMe(): Promise<AuthUser> {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Unauthorized");
  }
  const r = await requestJson<{ user: AuthUser }>("/auth/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.user;
}

