import type { WorkspaceStore } from "../workspace-store";
import {
  rewriteVfsCanonicalLinksInMarkdown,
  vfsCanonicalPathsForTitleChange,
} from "../../shared/note-vfs-link-rewrite";
import {
  wpnJsonGetNoteWithContextById,
  wpnJsonListAllNoteContentsForOwner,
  wpnJsonUpdateNote,
} from "./wpn-json-notes";

export type WpnVfsRewriteResult = { updatedNoteCount: number };

/**
 * After a note title change, rewrite `#/w/...` and `w/...` links across all notes for this owner.
 */
export function wpnJsonApplyVfsRewritesAfterTitleChange(
  store: WorkspaceStore,
  ownerId: string,
  renamedNoteId: string,
  oldTitle: string,
  newTitle: string,
): WpnVfsRewriteResult {
  const ctx = wpnJsonGetNoteWithContextById(store, ownerId, renamedNoteId);
  if (!ctx) {
    return { updatedNoteCount: 0 };
  }
  const paths = vfsCanonicalPathsForTitleChange(ctx, oldTitle, newTitle);
  if (!paths) {
    return { updatedNoteCount: 0 };
  }
  const { oldCanonical, newCanonical } = paths;
  const rows = wpnJsonListAllNoteContentsForOwner(store, ownerId);
  let updatedNoteCount = 0;
  for (const row of rows) {
    const content = row.content ?? "";
    const next = rewriteVfsCanonicalLinksInMarkdown(content, oldCanonical, newCanonical);
    if (next !== content) {
      wpnJsonUpdateNote(store, ownerId, row.id, { content: next });
      updatedNoteCount++;
    }
  }
  if (updatedNoteCount > 0) {
    console.info(
      `[wpn] VFS link rewrite (JSON): updated ${updatedNoteCount} note(s) after title change`,
    );
  }
  return { updatedNoteCount };
}

/** @deprecated Use wpnJsonApplyVfsRewritesAfterTitleChange */
export const wpnSqliteApplyVfsRewritesAfterTitleChange =
  wpnJsonApplyVfsRewritesAfterTitleChange;
