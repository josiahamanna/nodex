import type { Note } from "@nodex/ui-types";
import type { ShellProjectMountKind } from "../../../useShellProjectWorkspace";

/**
 * Loads a bundled documentation note by its manifest logical id (SQLite / folder) or `wpn-docs:{ws}:{id}` on WPN Postgres.
 */
export async function fetchBundledDocumentationNote(
  logicalId: string,
  mountKind: ShellProjectMountKind | undefined,
): Promise<Note> {
  if (mountKind === "wpn-postgres") {
    const { workspaces } = await window.Nodex.wpnListWorkspaces();
    const ws0 = workspaces[0];
    if (!ws0) {
      throw new Error("No workspace available to load bundled documentation.");
    }
    const noteId = `wpn-docs:${ws0.id}:${logicalId}`;
    const r = await window.Nodex.wpnGetNote(noteId);
    return r.note as unknown as Note;
  }
  return (await window.Nodex.getNote(logicalId)) as unknown as Note;
}
