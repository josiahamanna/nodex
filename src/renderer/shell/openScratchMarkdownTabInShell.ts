import { getNodex } from "../../shared/nodex-host-access";
import { syncWpnNotesBackend } from "../nodex-web-shim";
import { store } from "../store";
import { createNote, fetchAllNotes } from "../store/notesSlice";
import { resolveWpnProjectIdForRootNote } from "./wpnScratchProject";
import {
  NOTES_EXPLORER_VIEW_SIDEBAR,
  SHELL_TAB_SCRATCH_MARKDOWN,
} from "./first-party/shellWorkspaceIds";
import type { ShellNavigationDeps } from "./shellRailNavigation";

const LS_KEY = "nodex.scratchMarkdown.noteId.v1";

/** IPC and RTK sometimes reject with plain `{ message }` objects, not `Error` instances. */
function messageFromCaught(e: unknown): string {
  if (e == null) return "Unknown error";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message || e.name || "Error";
  if (typeof e === "object") {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
    const err = (e as { error?: unknown }).error;
    if (typeof err === "string" && err.length > 0) return err;
    try {
      const s = JSON.stringify(e);
      if (s && s !== "{}") return s;
    } catch {
      /* ignore */
    }
  }
  return String(e);
}

/** True when `wpnListWorkspaces` works (browser scratch store, sync API, or headless with auth). */
async function wpnNotesApiAvailable(): Promise<boolean> {
  try {
    await getNodex().wpnListWorkspaces();
    return true;
  } catch {
    return false;
  }
}

/**
 * Prefer last-selected project; otherwise first project; otherwise create workspace + project so Scratch can create a note.
 */
async function ensureProjectIdForScratchMarkdown(): Promise<string> {
  const fromExplorer = await resolveWpnProjectIdForRootNote();
  if (fromExplorer) {
    return fromExplorer;
  }
  const { workspaces } = await getNodex().wpnListWorkspaces();
  if (!workspaces.length) {
    const { workspace } = await getNodex().wpnCreateWorkspace("Workspace");
    const { project } = await getNodex().wpnCreateProject(workspace.id, "Project");
    return project.id;
  }
  const w = workspaces[0]!;
  const { projects } = await getNodex().wpnListProjects(w.id);
  if (!projects.length) {
    const { project } = await getNodex().wpnCreateProject(w.id, "Project");
    return project.id;
  }
  return projects[0]!.id;
}

/**
 * Opens or focuses the shell Scratch markdown tab (one reusable root markdown note per browser profile).
 */
export async function openScratchMarkdownTabInShell(deps: ShellNavigationDeps): Promise<void> {
  deps.layout.setVisible("menuRail", true);
  deps.layout.setVisible("sidebarPanel", true);
  deps.views.openView(NOTES_EXPLORER_VIEW_SIDEBAR, "primarySidebar");

  let noteId: string | undefined;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw?.trim()) {
      const id = raw.trim();
      if (store.getState().notes.notesList.some((n) => n.id === id)) {
        noteId = id;
      } else {
        try {
          localStorage.removeItem(LS_KEY);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }

  if (!noteId) {
    const useWpnPath = syncWpnNotesBackend() || (await wpnNotesApiAvailable());
    try {
      let id: string;
      if (useWpnPath) {
        const projectId = await ensureProjectIdForScratchMarkdown();
        const created = await getNodex().wpnCreateNoteInProject(projectId, {
          relation: "root",
          type: "markdown",
          title: "Scratch",
          content: "",
        });
        id = created.id;
      } else {
        const r = await store
          .dispatch(
            createNote({
              relation: "root",
              type: "markdown",
              title: "Scratch",
              content: "",
            }),
          )
          .unwrap();
        id = r.id;
      }
      noteId = id;
      try {
        localStorage.setItem(LS_KEY, id);
      } catch {
        /* ignore */
      }
      await store.dispatch(fetchAllNotes()).unwrap();
    } catch (e) {
      const msg = messageFromCaught(e);
      window.alert(`Could not open Scratch markdown: ${msg}`);
      return;
    }
  }

  const title =
    store.getState().notes.notesList.find((n) => n.id === noteId)?.title?.trim() || "Scratch";

  deps.tabs.openOrReuseTab(SHELL_TAB_SCRATCH_MARKDOWN, {
    title,
    reuseKey: "shell:scratch-markdown",
    state: { noteId },
  });
  const inst = deps.tabs.getActiveTab();
  if (inst) {
    const mainViewId = deps.tabs.resolveViewForInstance(inst.instanceId);
    if (mainViewId) deps.views.openView(mainViewId, "mainArea");
  }
}
