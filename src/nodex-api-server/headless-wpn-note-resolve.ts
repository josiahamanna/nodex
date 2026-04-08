import { getNotesDatabase } from "../core/workspace-store";
import { getWpnOwnerId } from "../core/wpn/wpn-owner";
import { wpnJsonGetNoteById, wpnJsonUpdateNote } from "../core/wpn/wpn-json-notes";
import {
  wpnJsonApplyVfsRewritesAfterTitleChange,
} from "../core/wpn/wpn-rename-vfs-rewrite";
import type { WpnNoteDetail } from "../shared/wpn-v2-types";

/**
 * Resolve a WPN note for the headless HTTP API (same order as Electron GET_NOTE).
 * @param wpnOwnerId When the client is authenticated (Bearer), pass `req.user.id` so WPN
 *   rows match `/wpn/*` (workspaces use JWT `sub` as owner). Otherwise defaults to {@link getWpnOwnerId}.
 */
export async function headlessGetWpnNoteById(
  noteId: string,
  wpnOwnerId?: string,
): Promise<WpnNoteDetail | null> {
  const ownerId = wpnOwnerId ?? getWpnOwnerId();
  const store = getNotesDatabase();
  if (!store) {
    return null;
  }
  return wpnJsonGetNoteById(store, ownerId, noteId);
}

export async function headlessPatchWpnNote(
  noteId: string,
  patch: {
    title?: string;
    content?: string;
    metadata?: Record<string, unknown> | null;
    updateVfsDependentLinks?: boolean;
  },
  wpnOwnerId?: string,
): Promise<WpnNoteDetail | null> {
  const ownerId = wpnOwnerId ?? getWpnOwnerId();
  const store = getNotesDatabase();
  if (!store) {
    return null;
  }
  const updateVfsDependentLinks = patch.updateVfsDependentLinks !== false;
  const { updateVfsDependentLinks: _u, ...notePatch } = patch;
  const before =
    notePatch.title !== undefined ? wpnJsonGetNoteById(store, ownerId, noteId) : null;
  const after = wpnJsonUpdateNote(store, ownerId, noteId, notePatch);
  if (
    updateVfsDependentLinks &&
    after &&
    before &&
    notePatch.title !== undefined &&
    (notePatch.title.trim() || before.title) !== before.title
  ) {
    try {
      wpnJsonApplyVfsRewritesAfterTitleChange(
        store,
        ownerId,
        noteId,
        before.title,
        after.title,
      );
    } catch (e) {
      console.error("[headlessPatchWpnNote] VFS link rewrite failed after title change:", e);
      throw e;
    }
  }
  return after;
}
