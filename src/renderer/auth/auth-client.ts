import { getAccessToken, setAccessToken, type AuthUser } from "./auth-session";

type AuthResponse = { token: string; user: AuthUser };

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
    let msg = `Request failed (${res.status})`;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (typeof j.error === "string" && j.error.trim()) msg = j.error;
    } catch {
      if (text.trim()) msg = text.trim();
    }
    throw new Error(msg);
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

