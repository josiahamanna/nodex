/**
 * Scratch / WPN mutations that should refresh the Notes explorer and shell project workspace
 * state. `ShellProjectWorkspaceProvider` listens too so `workspaceRoots` updates if the first
 * `getProjectState` tick has not finished yet (otherwise `loadWorkspaces` used to no-op).
 */
export const NODEX_WPN_TREE_CHANGED_EVENT = "nodex:wpn-tree-changed" as const;

export function dispatchWpnTreeChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(NODEX_WPN_TREE_CHANGED_EVENT));
}
