import * as fs from "fs";
import * as path from "path";

export type AuthJsonUserRow = {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  is_admin: boolean;
  created_at_ms: number;
  updated_at_ms: number;
};

export type AuthJsonSessionRow = {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  created_at_ms: number;
  expires_at_ms: number;
  revoked_at_ms: number | null;
  user_agent: string | null;
  ip: string | null;
};

function usersPath(userDataPath: string): string {
  return path.join(userDataPath, "auth", "users.json");
}

function sessionsPath(userDataPath: string): string {
  return path.join(userDataPath, "auth", "refresh_sessions.json");
}

function atomicWrite(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), "utf8");
  fs.renameSync(tmp, filePath);
}

function readUsers(userDataPath: string): AuthJsonUserRow[] {
  const p = usersPath(userDataPath);
  if (!fs.existsSync(p)) {
    return [];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as { users?: AuthJsonUserRow[] };
    return Array.isArray(raw.users) ? raw.users : [];
  } catch {
    return [];
  }
}

function writeUsers(userDataPath: string, users: AuthJsonUserRow[]): void {
  atomicWrite(usersPath(userDataPath), { users });
}

function readSessions(userDataPath: string): AuthJsonSessionRow[] {
  const p = sessionsPath(userDataPath);
  if (!fs.existsSync(p)) {
    return [];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as {
      sessions?: AuthJsonSessionRow[];
    };
    return Array.isArray(raw.sessions) ? raw.sessions : [];
  } catch {
    return [];
  }
}

function writeSessions(userDataPath: string, sessions: AuthJsonSessionRow[]): void {
  atomicWrite(sessionsPath(userDataPath), { sessions });
}

export function emailOrUsernameTaken(
  userDataPath: string,
  email: string,
  username: string,
): boolean {
  const e = email.trim().toLowerCase();
  const u = username.trim().toLowerCase();
  return readUsers(userDataPath).some(
    (x) => x.email === e || x.username.toLowerCase() === u,
  );
}

export function readUserByEmail(
  userDataPath: string,
  email: string,
): AuthJsonUserRow | null {
  const e = email.trim().toLowerCase();
  return readUsers(userDataPath).find((u) => u.email === e) ?? null;
}

export function readUserById(userDataPath: string, id: string): AuthJsonUserRow | null {
  return readUsers(userDataPath).find((u) => u.id === id) ?? null;
}

export function insertUser(userDataPath: string, user: AuthJsonUserRow): void {
  const users = readUsers(userDataPath);
  users.push(user);
  writeUsers(userDataPath, users);
}

export function setUserAdminFlag(
  userDataPath: string,
  id: string,
  is_admin: boolean,
  updated_at_ms: number,
): void {
  const users = readUsers(userDataPath);
  const i = users.findIndex((u) => u.id === id);
  if (i < 0) {
    return;
  }
  users[i] = { ...users[i]!, is_admin, updated_at_ms };
  writeUsers(userDataPath, users);
}

export function insertRefreshSession(
  userDataPath: string,
  row: AuthJsonSessionRow,
): void {
  const sessions = readSessions(userDataPath);
  sessions.push(row);
  writeSessions(userDataPath, sessions);
}

export function findRefreshSessionByHash(
  userDataPath: string,
  tokenHash: string,
): AuthJsonSessionRow | null {
  return readSessions(userDataPath).find((s) => s.refresh_token_hash === tokenHash) ?? null;
}

export function revokeRefreshSessionById(
  userDataPath: string,
  id: string,
  revoked_at_ms: number,
): void {
  const sessions = readSessions(userDataPath);
  const next = sessions.map((s) =>
    s.id === id ? { ...s, revoked_at_ms } : s,
  );
  writeSessions(userDataPath, next);
}

export function revokeRefreshSessionByHashIfActive(
  userDataPath: string,
  tokenHash: string,
  revoked_at_ms: number,
): void {
  const sessions = readSessions(userDataPath);
  const next = sessions.map((s) =>
    s.refresh_token_hash === tokenHash && s.revoked_at_ms == null
      ? { ...s, revoked_at_ms }
      : s,
  );
  writeSessions(userDataPath, next);
}
