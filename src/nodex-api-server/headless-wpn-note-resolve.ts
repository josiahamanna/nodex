import { getNotesDatabase } from "../core/notes-sqlite";
import { getWpnOwnerId } from "../core/wpn/wpn-owner";
import { getWpnPgPool } from "../core/wpn/wpn-pg-pool";
import { wpnPgGetNoteById, wpnPgUpdateNote } from "../core/wpn/wpn-pg-notes";
import {
  wpnSqliteGetNoteById,
  wpnSqliteUpdateNote,
} from "../core/wpn/wpn-sqlite-notes";
import type { WpnNoteDetail } from "../shared/wpn-v2-types";

/**
 * Resolve a WPN note for the headless HTTP API (same order as Electron GET_NOTE).
 * @param wpnOwnerId When the client is authenticated (Bearer), pass `req.user.id` so Postgres WPN
 *   rows match `/wpn/*` (workspaces use JWT `sub` as owner). Otherwise defaults to {@link getWpnOwnerId}.
 */
export async function headlessGetWpnNoteById(
  noteId: string,
  wpnOwnerId?: string,
): Promise<WpnNoteDetail | null> {
  const ownerId = wpnOwnerId ?? getWpnOwnerId();
  const pool = getWpnPgPool();
  if (pool) {
    return wpnPgGetNoteById(pool, ownerId, noteId);
  }
  const db = getNotesDatabase();
  if (!db) return null;
  return wpnSqliteGetNoteById(db, ownerId, noteId);
}

export async function headlessPatchWpnNote(
  noteId: string,
  patch: {
    title?: string;
    content?: string;
    metadata?: Record<string, unknown> | null;
  },
  wpnOwnerId?: string,
): Promise<WpnNoteDetail | null> {
  const ownerId = wpnOwnerId ?? getWpnOwnerId();
  const pool = getWpnPgPool();
  if (pool) {
    return wpnPgUpdateNote(pool, ownerId, noteId, patch);
  }
  const db = getNotesDatabase();
  if (!db) return null;
  return wpnSqliteUpdateNote(db, ownerId, noteId, patch);
}
