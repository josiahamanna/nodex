import type { ShellTabInstance } from "./registries/ShellTabsRegistry";
import { SHELL_TAB_NOTE } from "./first-party/shellWorkspaceIds";

export type ParsedShellHash =
  | { kind: "note"; noteId: string }
  | { kind: "tab"; instanceId: string };

export function parseShellHash(): ParsedShellHash | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "").trim();
  if (!raw) return null;
  if (raw.startsWith("/n/")) {
    const noteId = raw.slice("/n/".length).split("/")[0]?.trim();
    if (noteId) return { kind: "note", noteId };
  }
  if (raw.startsWith("n/")) {
    const noteId = raw.slice("n/".length).split("/")[0]?.trim();
    if (noteId) return { kind: "note", noteId };
  }
  if (raw.startsWith("note/")) {
    const noteId = raw.slice("note/".length).split("/")[0]?.trim();
    if (noteId) return { kind: "note", noteId };
  }
  const tabPart = raw.startsWith("/") ? raw.slice(1) : raw;
  if (tabPart.startsWith("t/")) {
    const instanceId = tabPart.slice("t/".length).split("/")[0]?.trim();
    if (instanceId) return { kind: "tab", instanceId };
  }
  return null;
}

export function hashForActiveTab(tab: ShellTabInstance | null): string {
  if (!tab) return "";
  const st = tab.state as { noteId?: string } | undefined;
  if (tab.tabTypeId === SHELL_TAB_NOTE && st?.noteId) {
    return `#/n/${st.noteId}`;
  }
  return `#/t/${tab.instanceId}`;
}

export function replaceWindowHash(nextHash: string): void {
  if (typeof window === "undefined") return;
  const u = new URL(window.location.href);
  const normalized = nextHash.startsWith("#") ? nextHash : `#${nextHash}`;
  if (u.hash === normalized) return;
  u.hash = normalized;
  window.history.replaceState(null, "", `${u.pathname}${u.search}${normalized}`);
}

/** Fired when a main-area shell note tab is closed (×, command, etc.). Notes explorer listens to cancel debounced single-click opens. */
export const NODEX_SHELL_NOTE_TAB_CLOSED_EVENT = "nodex:shell-note-tab-closed";

export function dispatchShellNoteTabClosed(noteId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(NODEX_SHELL_NOTE_TAB_CLOSED_EVENT, { detail: { noteId } }),
  );
}
