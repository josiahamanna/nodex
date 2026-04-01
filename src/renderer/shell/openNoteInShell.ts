import { store } from "../store";
import { fetchNote } from "../store/notesSlice";
import {
  NOTES_EXPLORER_VIEW_SIDEBAR,
  SHELL_TAB_NOTE,
} from "./first-party/shellWorkspaceIds";
import type { ShellNavigationDeps } from "./shellRailNavigation";

export function openNoteInShell(noteId: string, deps: ShellNavigationDeps): void {
  const notesList = store.getState().notes.notesList;
  const row = notesList.find((n) => n.id === noteId);
  const title = row?.title?.trim() || "Note";
  deps.layout.setVisible("menuRail", true);
  deps.layout.setVisible("sidebarPanel", true);
  deps.views.openView(NOTES_EXPLORER_VIEW_SIDEBAR, "primarySidebar");
  const existing = deps.tabs.findNoteTabByNoteId(noteId, SHELL_TAB_NOTE);
  if (existing) {
    deps.tabs.setActiveTab(existing.instanceId);
    deps.tabs.updateTabPresentation(existing.instanceId, { title, state: { noteId } });
  } else {
    deps.tabs.openOrReuseTab(SHELL_TAB_NOTE, {
      title,
      reuseKey: "note:preview",
      state: { noteId },
    });
  }
  void store.dispatch(fetchNote(noteId));
}
