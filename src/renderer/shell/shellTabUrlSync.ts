import type { ShellTabInstance } from "./registries/ShellTabsRegistry";
import { SHELL_TAB_NOTE } from "./first-party/shellWorkspaceIds";

export type ParsedShellHash =
  | { kind: "note"; noteId: string }
  | { kind: "tab"; instanceId: string };

export function parseShellHash(): ParsedShellHash | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "").trim();
  if (!raw) return null;
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
    return `#note/${st.noteId}`;
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
