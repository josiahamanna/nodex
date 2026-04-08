import { normalizeVfsSegment } from "../../shared/note-vfs-path";
import type { WorkspaceStore } from "../workspace-store";
import {
  rewriteMarkdownForWpnNoteTitleChange,
  vfsCanonicalPathsForTitleChange,
} from "../../shared/note-vfs-link-rewrite";
import {
  wpnJsonGetNoteWithContextById,
  wpnJsonListAllNoteContentsForOwner,
  wpnJsonUpdateNote,
} from "./wpn-json-notes";

export type WpnVfsRewriteResult = { updatedNoteCount: number };

export type WpnVfsPreviewTitleChangeResult = {
  dependentNoteCount: number;
  dependentNoteIds: string[];
};

/**
 * Notes that would gain updated markdown if the given note's title changed (canonical `#/w/...` and same-project `./...` links).
 */
export function wpnJsonPreviewVfsRewritesAfterTitleChange(
  store: WorkspaceStore,
  ownerId: string,
  renamedNoteId: string,
  oldTitle: string,
  newTitle: string,
): WpnVfsPreviewTitleChangeResult {
  const ctx = wpnJsonGetNoteWithContextById(store, ownerId, renamedNoteId);
  if (!ctx) {
    return { dependentNoteCount: 0, dependentNoteIds: [] };
  }
  const paths = vfsCanonicalPathsForTitleChange(ctx, oldTitle, newTitle);
  if (!paths) {
    return { dependentNoteCount: 0, dependentNoteIds: [] };
  }
  const { oldCanonical, newCanonical } = paths;
  const oldSeg = normalizeVfsSegment(oldTitle, "Untitled");
  const newSeg = normalizeVfsSegment(newTitle, "Untitled");
  const rows = wpnJsonListAllNoteContentsForOwner(store, ownerId);
  const dependentNoteIds: string[] = [];
  for (const row of rows) {
    const content = row.content ?? "";
    const next = rewriteMarkdownForWpnNoteTitleChange(
      content,
      row.project_id,
      ctx.project_id,
      oldCanonical,
      newCanonical,
      oldSeg,
      newSeg,
    );
    if (next !== content) {
      dependentNoteIds.push(row.id);
    }
  }
  return { dependentNoteCount: dependentNoteIds.length, dependentNoteIds };
}

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
  const oldSeg = normalizeVfsSegment(oldTitle, "Untitled");
  const newSeg = normalizeVfsSegment(newTitle, "Untitled");
  const rows = wpnJsonListAllNoteContentsForOwner(store, ownerId);
  let updatedNoteCount = 0;
  for (const row of rows) {
    const content = row.content ?? "";
    const next = rewriteMarkdownForWpnNoteTitleChange(
      content,
      row.project_id,
      ctx.project_id,
      oldCanonical,
      newCanonical,
      oldSeg,
      newSeg,
    );
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
