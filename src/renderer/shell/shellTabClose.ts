import { store } from "../store";
import { clearCurrentNote, fetchNote } from "../store/notesSlice";
import { SHELL_TAB_NOTE } from "./first-party/shellWorkspaceIds";
import type { ShellTabsRegistry } from "./registries/ShellTabsRegistry";
import { dispatchShellNoteTabClosed } from "./shellTabUrlSync";

function collectOpenNoteIds(tabs: ShellTabsRegistry): Set<string> {
  const ids = new Set<string>();
  for (const t of tabs.listOpenTabs()) {
    if (t.tabTypeId !== SHELL_TAB_NOTE) continue;
    const nid = (t.state as { noteId?: string } | undefined)?.noteId;
    if (typeof nid === "string" && nid.length > 0) ids.add(nid);
  }
  return ids;
}

/**
 * Close a main-area shell tab, optionally open Welcome when empty, sync URL hash via tabs.emit,
 * clear Redux current note when its tab is gone, and fetch the newly active note tab.
 */
export function closeShellTabInstance(tabs: ShellTabsRegistry, instanceId: string): void {
  const inst = tabs.listOpenTabs().find((t) => t.instanceId === instanceId);
  const closedNoteId =
    inst?.tabTypeId === SHELL_TAB_NOTE
      ? (inst.state as { noteId?: string } | undefined)?.noteId
      : undefined;

  tabs.closeTab(instanceId);

  if (typeof closedNoteId === "string" && closedNoteId) {
    dispatchShellNoteTabClosed(closedNoteId);
  }

  const openNoteIds = collectOpenNoteIds(tabs);
  const curId = store.getState().notes.currentNote?.id;
  if (
    curId &&
    typeof closedNoteId === "string" &&
    curId === closedNoteId &&
    !openNoteIds.has(curId)
  ) {
    store.dispatch(clearCurrentNote());
  }

  if (tabs.listOpenTabs().length === 0) {
    tabs.openOrReuseTab("shell.tab.welcome", { title: "Welcome", reuseKey: "shell:welcome" });
  }

  const active = tabs.getActiveTab();
  if (active?.tabTypeId === SHELL_TAB_NOTE) {
    const nid = (active.state as { noteId?: string } | undefined)?.noteId;
    if (typeof nid === "string" && nid) {
      void store.dispatch(fetchNote(nid));
    }
  }
}

/**
 * Close every main-area note tab whose `state.noteId` is in `noteIds`, then reconcile Redux, URL (via emit),
 * and Welcome — same end state as calling {@link closeShellTabInstance} for each, with a single `fetchNote` for the new active tab.
 */
export function closeShellTabsForNoteIds(tabs: ShellTabsRegistry, noteIds: readonly string[]): void {
  const idSet = new Set(noteIds.filter((id) => typeof id === "string" && id.length > 0));
  if (idSet.size === 0) return;

  const open = tabs.listOpenTabs();
  const toClose = open.filter((t) => {
    if (t.tabTypeId !== SHELL_TAB_NOTE) return false;
    const nid = (t.state as { noteId?: string } | undefined)?.noteId;
    return typeof nid === "string" && idSet.has(nid);
  });
  if (toClose.length === 0) return;

  const closedNoteIds = new Set<string>();
  for (const t of toClose) {
    const nid = (t.state as { noteId?: string } | undefined)?.noteId;
    if (typeof nid === "string" && nid.length > 0) closedNoteIds.add(nid);
  }

  for (const t of toClose) {
    tabs.closeTab(t.instanceId);
  }

  for (const nid of closedNoteIds) {
    dispatchShellNoteTabClosed(nid);
  }

  const openNoteIds = collectOpenNoteIds(tabs);
  const curId = store.getState().notes.currentNote?.id;
  if (curId && idSet.has(curId) && !openNoteIds.has(curId)) {
    store.dispatch(clearCurrentNote());
  }

  if (tabs.listOpenTabs().length === 0) {
    tabs.openOrReuseTab("shell.tab.welcome", { title: "Welcome", reuseKey: "shell:welcome" });
  }

  const active = tabs.getActiveTab();
  if (active?.tabTypeId === SHELL_TAB_NOTE) {
    const nid = (active.state as { noteId?: string } | undefined)?.noteId;
    if (typeof nid === "string" && nid) {
      void store.dispatch(fetchNote(nid));
    }
  }
}
