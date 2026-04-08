import { getNodex } from "../../shared/nodex-host-access";
/**
 * Remembers the last WPN project the user had open in the explorer so shell commands
 * (e.g. Scratch) can create a root note without a flat legacy `createNote` API.
 */
export const NODEX_LAST_WPN_PROJECT_ID_SESSION_KEY = "nodex-last-wpn-project-id";

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

/**
 * Prefer last-selected project from the WPN explorer; otherwise first project in the first workspace.
 */
export async function resolveWpnProjectIdForRootNote(): Promise<string | null> {
  if (typeof window === "undefined" || !window.Nodex) {
    return null;
  }
  try {
    const sid =
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem(NODEX_LAST_WPN_PROJECT_ID_SESSION_KEY)?.trim()
        : "";
    if (sid) {
      return sid;
    }
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
