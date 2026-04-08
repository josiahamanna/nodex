import { getNodex } from "../../shared/nodex-host-access";
import {
  resolveNoteIdByCanonicalVfsPath,
  resolveSameProjectRelativeVfsToCanonical,
  isSameProjectRelativeVfsPath,
} from "../../shared/note-vfs-path";

/**
 * Resolves explorer-style canonical path `Workspace/Project/Title`, or same-project `./Title` when
 * `baseNoteId` identifies the referrer note (for relative links in markdown).
 */
export async function resolveNoteIdFromVfsPath(
  vfsPath: string,
  baseNoteId?: string,
): Promise<string | null> {
  const nodex = typeof window !== "undefined" ? getNodex() : undefined;
  if (!nodex?.wpnListAllNotesWithContext) return null;
  try {
    const { notes } = await nodex.wpnListAllNotesWithContext();
    const list = Array.isArray(notes) ? notes : [];
    let canonical = vfsPath.trim();
    if (isSameProjectRelativeVfsPath(canonical) && baseNoteId) {
      const baseRow = list.find((n) => n.id === baseNoteId);
      if (baseRow) {
        const mapped = resolveSameProjectRelativeVfsToCanonical(canonical, baseRow);
        if (mapped) {
          canonical = mapped;
        }
      }
    }
    return resolveNoteIdByCanonicalVfsPath(list, canonical);
  } catch {
    return null;
  }
}
