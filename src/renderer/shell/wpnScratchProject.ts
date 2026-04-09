import { getNodex } from "../../shared/nodex-host-access";
import { getAccessToken } from "../auth/auth-session";
import { isWebScratchSession } from "../auth/web-scratch";
import { syncWpnNotesBackend } from "../nodex-web-shim";
import { scratchWpnProjectExists } from "../wpnscratch/wpn-scratch-store";
import { computeNextScratchBufferTitle } from "./scratch-buffer-titles";

/** Web try-out: WPN in IndexedDB (same condition as {@link useWebTryoutWpnIndexedDb}). */
function useWebScratchIdbWpn(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return isWebScratchSession() && !getAccessToken();
  } catch {
    return false;
  }
}

/**
 * Remembers the last WPN project the user had open in the explorer so shell commands
 * (e.g. Scratch) can create a root note without a flat legacy `createNote` API.
 */
export const NODEX_LAST_WPN_PROJECT_ID_SESSION_KEY = "nodex-last-wpn-project-id";

/** Default WPN container for scratch notes when no explorer project is remembered. */
export const SCRATCH_WORKSPACE_NAME = "Scratch";
export const SCRATCH_PROJECT_NAME = "Scratch";

export function rememberWpnProjectIdForScratch(projectId: string | null): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    if (projectId && projectId.trim()) {
      sessionStorage.setItem(NODEX_LAST_WPN_PROJECT_ID_SESSION_KEY, projectId.trim());
    }
  } catch {
    /* quota / private mode */
  }
}

export function clearRememberedWpnProjectId(): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.removeItem(NODEX_LAST_WPN_PROJECT_ID_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** True when the project exists in the current WPN store (sync, file vault, or IDB scratch). */
export async function wpnProjectIdExists(projectId: string): Promise<boolean> {
  const id = projectId.trim();
  if (!id) {
    return false;
  }
  if (useWebScratchIdbWpn()) {
    return scratchWpnProjectExists(id);
  }
  try {
    await getNodex().wpnListNotes(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * True when `wpnListWorkspaces` works (browser scratch store, sync API, or headless with auth).
 */
export async function wpnNotesApiAvailable(): Promise<boolean> {
  try {
    await getNodex().wpnListWorkspaces();
    return true;
  } catch {
    return false;
  }
}

export async function scratchNotesUseWpnPath(): Promise<boolean> {
  return syncWpnNotesBackend() || (await wpnNotesApiAvailable());
}

/** Last project id the user selected in the Notes explorer, if it still exists in the WPN store. */
export async function getValidRememberedWpnProjectId(): Promise<string | null> {
  if (typeof window === "undefined" || !window.Nodex) {
    return null;
  }
  try {
    const sid =
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem(NODEX_LAST_WPN_PROJECT_ID_SESSION_KEY)?.trim()
        : "";
    if (!sid) {
      return null;
    }
    if (await wpnProjectIdExists(sid)) {
      return sid;
    }
    clearRememberedWpnProjectId();
    return null;
  } catch {
    return null;
  }
}

/**
 * Prefer last-selected project from the WPN explorer if it still exists; otherwise first project
 * in the first workspace.
 */
export async function resolveWpnProjectIdForRootNote(): Promise<string | null> {
  const remembered = await getValidRememberedWpnProjectId();
  if (remembered) {
    return remembered;
  }
  if (typeof window === "undefined" || !window.Nodex) {
    return null;
  }
  try {
    const { workspaces } = await getNodex().wpnListWorkspaces();
    const w = workspaces?.[0];
    if (!w) {
      return null;
    }
    const { projects } = await getNodex().wpnListProjects(w.id);
    return projects?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function findOrCreateScratchBucketProjectId(): Promise<string> {
  const { workspaces } = await getNodex().wpnListWorkspaces();
  const w = workspaces.find((x) => x.name === SCRATCH_WORKSPACE_NAME);
  if (w) {
    const { projects } = await getNodex().wpnListProjects(w.id);
    const p = projects.find((x) => x.name === SCRATCH_PROJECT_NAME);
    if (p) {
      return p.id;
    }
    const { project } = await getNodex().wpnCreateProject(w.id, SCRATCH_PROJECT_NAME);
    return project.id;
  }
  const { workspace } = await getNodex().wpnCreateWorkspace(SCRATCH_WORKSPACE_NAME);
  const { project } = await getNodex().wpnCreateProject(workspace.id, SCRATCH_PROJECT_NAME);
  return project.id;
}

/**
 * Explorer-selected project if remembered and still valid; otherwise the dedicated Scratch / Scratch
 * WPN project (created when missing). Does not fall back to “first workspace’s first project”.
 */
export async function ensureScratchMarkdownProjectId(): Promise<string> {
  const remembered = await getValidRememberedWpnProjectId();
  if (remembered) {
    return remembered;
  }
  return findOrCreateScratchBucketProjectId();
}

/** Root note titles in `projectId` that are exactly `Scratch` (first match wins). */
export async function findRootNoteIdWithTitle(
  projectId: string,
  title: string,
): Promise<string | null> {
  const { notes } = await getNodex().wpnListNotes(projectId);
  const row = notes.find(
    (n) => n.parent_id === null && n.title.trim() === title,
  );
  return row?.id ?? null;
}

export { computeNextScratchBufferTitle };

export async function nextScratchBufferTitle(projectId: string): Promise<string> {
  const { notes } = await getNodex().wpnListNotes(projectId);
  const rootTitles = notes.filter((n) => n.parent_id === null).map((n) => n.title);
  return computeNextScratchBufferTitle(rootTitles);
}
