import type { Database } from "better-sqlite3";
import type { Pool } from "pg";
import {
  rewriteVfsCanonicalLinksInMarkdown,
  vfsCanonicalPathsForTitleChange,
} from "../../shared/note-vfs-link-rewrite";
import {
  wpnPgGetNoteWithContextById,
  wpnPgListAllNoteContentsForOwner,
  wpnPgUpdateNote,
} from "./wpn-pg-notes";
import {
  wpnSqliteGetNoteWithContextById,
  wpnSqliteListAllNoteContentsForOwner,
  wpnSqliteUpdateNote,
} from "./wpn-sqlite-notes";

export type WpnVfsRewriteResult = { updatedNoteCount: number };

/**
 * After a note title change, rewrite `#/w/...` and `w/...` links across all notes for this owner.
 */
export function wpnSqliteApplyVfsRewritesAfterTitleChange(
  db: Database,
  ownerId: string,
  renamedNoteId: string,
  oldTitle: string,
  newTitle: string,
): WpnVfsRewriteResult {
  const ctx = wpnSqliteGetNoteWithContextById(db, ownerId, renamedNoteId);
  if (!ctx) return { updatedNoteCount: 0 };
  const paths = vfsCanonicalPathsForTitleChange(ctx, oldTitle, newTitle);
  if (!paths) return { updatedNoteCount: 0 };
  const { oldCanonical, newCanonical } = paths;
  const rows = wpnSqliteListAllNoteContentsForOwner(db, ownerId);
  let updatedNoteCount = 0;
  for (const row of rows) {
    const content = row.content ?? "";
    const next = rewriteVfsCanonicalLinksInMarkdown(content, oldCanonical, newCanonical);
    if (next !== content) {
      wpnSqliteUpdateNote(db, ownerId, row.id, { content: next });
      updatedNoteCount++;
    }
  }
  if (updatedNoteCount > 0) {
    console.info(
      `[wpn] VFS link rewrite (SQLite): updated ${updatedNoteCount} note(s) after title change`,
    );
  }
  return { updatedNoteCount };
}

export async function wpnPgApplyVfsRewritesAfterTitleChange(
  pool: Pool,
  ownerId: string,
  renamedNoteId: string,
  oldTitle: string,
  newTitle: string,
): Promise<WpnVfsRewriteResult> {
  const ctx = await wpnPgGetNoteWithContextById(pool, ownerId, renamedNoteId);
  if (!ctx) return { updatedNoteCount: 0 };
  const paths = vfsCanonicalPathsForTitleChange(ctx, oldTitle, newTitle);
  if (!paths) return { updatedNoteCount: 0 };
  const { oldCanonical, newCanonical } = paths;
  const rows = await wpnPgListAllNoteContentsForOwner(pool, ownerId);
  let updatedNoteCount = 0;
  for (const row of rows) {
    const content = row.content ?? "";
    const next = rewriteVfsCanonicalLinksInMarkdown(content, oldCanonical, newCanonical);
    if (next !== content) {
      await wpnPgUpdateNote(pool, ownerId, row.id, { content: next });
      updatedNoteCount++;
    }
  }
  if (updatedNoteCount > 0) {
    console.info(
      `[wpn] VFS link rewrite (Postgres): updated ${updatedNoteCount} note(s) after title change`,
    );
  }
  return { updatedNoteCount };
}
