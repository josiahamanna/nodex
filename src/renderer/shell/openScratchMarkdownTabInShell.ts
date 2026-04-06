import { store } from "../store";
import { createNote, fetchAllNotes } from "../store/notesSlice";
import {
  NOTES_EXPLORER_VIEW_SIDEBAR,
  SHELL_TAB_SCRATCH_MARKDOWN,
} from "./first-party/shellWorkspaceIds";
import type { ShellNavigationDeps } from "./shellRailNavigation";

const LS_KEY = "nodex.scratchMarkdown.noteId.v1";

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
    try {
      const { id } = await store
        .dispatch(
          createNote({
            relation: "root",
            type: "markdown",
            title: "Scratch",
            content: "",
          }),
        )
        .unwrap();
      noteId = id;
      try {
        localStorage.setItem(LS_KEY, id);
      } catch {
        /* ignore */
      }
      await store.dispatch(fetchAllNotes()).unwrap();
    } catch {
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
