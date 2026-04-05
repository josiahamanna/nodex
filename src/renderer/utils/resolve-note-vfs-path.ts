import { resolveNoteIdByCanonicalVfsPath } from "../../../shared/note-vfs-path";

/** Resolves explorer-style canonical path `Workspace/Project/Title` to a WPN note id. */
export async function resolveNoteIdFromVfsPath(canonicalPath: string): Promise<string | null> {
  const nodex = typeof window !== "undefined" ? window.Nodex : undefined;
  if (!nodex?.wpnListAllNotesWithContext) return null;
  try {
    const { notes } = await nodex.wpnListAllNotesWithContext();
    const list = Array.isArray(notes) ? notes : [];
    return resolveNoteIdByCanonicalVfsPath(list, canonicalPath);
  } catch {
    return null;
  }
}
