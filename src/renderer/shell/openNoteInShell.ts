import { store } from "../store";
import {
  NOTES_EXPLORER_VIEW_SIDEBAR,
  SHELL_TAB_NOTE,
} from "./first-party/shellWorkspaceIds";
import type { ShellNavigationDeps } from "./shellRailNavigation";
import type { ShellNoteTabState } from "./shellTabUrlSync";

export type OpenNoteInShellOptions = {
  markdownHeadingSlug?: string;
  /** Always add a new note tab instead of focusing an existing tab for this note. */
  newTab?: boolean;
};

export function openNoteInShell(
  noteId: string,
  deps: ShellNavigationDeps,
  options?: OpenNoteInShellOptions,
): void {
  const notesList = store.getState().notes.notesList;
  const row = notesList.find((n) => n.id === noteId);
  const title = row?.title?.trim() || "Note";
  deps.layout.setVisible("menuRail", true);
  deps.layout.setVisible("sidebarPanel", true);
  deps.views.openView(NOTES_EXPLORER_VIEW_SIDEBAR, "primarySidebar");
  const state: ShellNoteTabState =
    options?.markdownHeadingSlug !== undefined && options.markdownHeadingSlug !== ""
      ? { noteId, markdownHeadingSlug: options.markdownHeadingSlug }
      : { noteId };
  if (options?.newTab) {
    deps.tabs.openTab(SHELL_TAB_NOTE, title, state);
    return;
  }
  const existing = deps.tabs.findNoteTabByNoteId(noteId, SHELL_TAB_NOTE);
  if (existing) {
    deps.tabs.setActiveTab(existing.instanceId);
    deps.tabs.updateTabPresentation(existing.instanceId, { title, state });
  } else {
    deps.tabs.openOrReuseTab(SHELL_TAB_NOTE, {
      title,
      reuseKey: "note:preview",
      state,
    });
  }
}
