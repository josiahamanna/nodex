export type OrgRole = "admin" | "member";

export type AuthUserOrg = {
  orgId: string;
  name: string;
  slug: string;
  role: OrgRole;
  isDefault: boolean;
};

export type SpaceRole = "owner" | "member" | "viewer";

export type AuthUserSpace = {
  spaceId: string;
  orgId: string;
  name: string;
  kind: "default" | "normal";
  role: SpaceRole;
};

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  isAdmin?: boolean;
  /** Platform-wide master admin — distinct from per-org admin. */
  isMasterAdmin?: boolean;
  orgs?: AuthUserOrg[];
  activeOrgId?: string | null;
};

const ACTIVE_ORG_KEY = "nodex_active_org_id";
const ACTIVE_SPACE_KEY = "nodex_active_space_id";

function readFromStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeToStorage(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

let accessToken: string | null = null;
let activeOrgId: string | null = readFromStorage(ACTIVE_ORG_KEY);
// Note: activeSpaceId is NOT persisted - it's always re-fetched for the active org
// on startup via loadOrgSpacesThunk to avoid stale space IDs from a different org
let activeSpaceId: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token && token.trim().length > 0 ? token.trim() : null;
}

export function getActiveOrgId(): string | null {
  return activeOrgId;
}

export function setActiveOrgId(orgId: string | null): void {
  activeOrgId = orgId && orgId.trim().length > 0 ? orgId.trim() : null;
  writeToStorage(ACTIVE_ORG_KEY, activeOrgId);
}

export function getActiveSpaceId(): string | null {
  return activeSpaceId;
}

export function setActiveSpaceId(spaceId: string | null): void {
  activeSpaceId = spaceId && spaceId.trim().length > 0 ? spaceId.trim() : null;
  // Also clear any legacy persisted value to avoid stale reads from previous versions
  if (!activeSpaceId) {
    writeToStorage(ACTIVE_SPACE_KEY, null);
  }
}

