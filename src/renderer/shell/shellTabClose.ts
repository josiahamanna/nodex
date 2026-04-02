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
