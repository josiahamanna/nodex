import type { Note } from "@nodex/ui-types";

/**
 * Loads a bundled documentation note by logical id: tries legacy notes first, then
 * `wpn-docs:{workspaceId}:{logicalId}` in the first WPN workspace.
 */
export async function fetchBundledDocumentationNote(logicalId: string): Promise<Note> {
  try {
    const n = await window.Nodex.getNote(logicalId);
    if (n && typeof (n as { id?: unknown }).id === "string") {
      return n as unknown as Note;
    }
  } catch {
    /* try WPN composite id */
  }
  const { workspaces } = await window.Nodex.wpnListWorkspaces();
  const ws0 = workspaces[0];
  if (!ws0) {
    throw new Error("No workspace available to load bundled documentation.");
  }
  const noteId = `wpn-docs:${ws0.id}:${logicalId}`;
  const r = await window.Nodex.wpnGetNote(noteId);
  return r.note as unknown as Note;
}
