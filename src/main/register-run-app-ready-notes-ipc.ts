import { ipcMain } from "electron";
import { getNotesDatabase } from "../core/notes-sqlite";
import {
  deleteNoteSubtrees,
  duplicateSubtreeAt,
  ensureNotesSeeded,
  moveNote as moveNoteInStore,
  moveNotesBulk as moveNotesBulkInStore,
} from "../core/notes-store";
import { getWpnOwnerId } from "../core/wpn/wpn-owner";
import {
  wpnSqliteDeleteNotes,
  wpnSqliteGetNoteById,
  wpnSqliteMoveNote,
} from "../core/wpn/wpn-sqlite-notes";
import { pushNotesUndoSnapshot } from "../core/nodex-undo";
import { registry } from "../core/registry";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import { isWorkspaceMountNoteId } from "../shared/note-workspace";
import { isValidNoteId } from "../shared/validators";
import {
  assertProjectOpenForNotes,
  persistNotes,
} from "./main-helpers";

export function registerRunAppReadyNotesTreeIpc(): void {
  ipcMain.removeHandler(IPC_CHANNELS.MOVE_NOTE);
  ipcMain.removeHandler(IPC_CHANNELS.MOVE_NOTES_BULK);
  ipcMain.removeHandler(IPC_CHANNELS.DELETE_NOTES);
  ipcMain.removeHandler(IPC_CHANNELS.PASTE_SUBTREE);
  ipcMain.handle(
    IPC_CHANNELS.DELETE_NOTES,
    async (_event, ids: unknown) => {
      assertProjectOpenForNotes();
      const registeredTypes = registry.getRegisteredTypes();
      ensureNotesSeeded(registeredTypes);
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error("Invalid ids");
      }
      for (const id of ids) {
        if (typeof id !== "string" || !isValidNoteId(id)) {
          throw new Error("Invalid note id");
        }
      }
      const deletable = (ids as string[]).filter(
        (id) => !isWorkspaceMountNoteId(id),
      );
      if (deletable.length === 0) {
        return;
      }
      const db = getNotesDatabase();
      const ownerId = getWpnOwnerId();
      const wpnIds: string[] = [];
      const legacyIds: string[] = [];
      for (const id of deletable) {
        if (db && wpnSqliteGetNoteById(db, ownerId, id)) {
          wpnIds.push(id);
        } else {
          legacyIds.push(id);
        }
      }
      if (wpnIds.length > 0 && db) {
        wpnSqliteDeleteNotes(db, ownerId, wpnIds);
      }
      if (legacyIds.length > 0) {
        pushNotesUndoSnapshot();
        deleteNoteSubtrees(legacyIds);
        persistNotes();
      }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.MOVE_NOTES_BULK,
    async (
      _event,
      payload: { ids: string[]; targetId: string; placement: string },
    ) => {
      assertProjectOpenForNotes();
      const registeredTypes = registry.getRegisteredTypes();
      ensureNotesSeeded(registeredTypes);
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid payload");
      }
      const { ids, targetId } = payload;
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error("Invalid ids");
      }
      for (const id of ids) {
        if (typeof id !== "string" || !isValidNoteId(id)) {
          throw new Error("Invalid note id");
        }
      }
      if (typeof targetId !== "string" || !isValidNoteId(targetId)) {
        throw new Error("Invalid target id");
      }
      const p = payload.placement;
      if (p !== "before" && p !== "after" && p !== "into") {
        throw new Error("Invalid placement");
      }
      pushNotesUndoSnapshot();
      moveNotesBulkInStore(ids as string[], targetId, p);
      persistNotes();
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.MOVE_NOTE,
    async (
      _event,
      payload: { draggedId: string; targetId: string; placement: string },
    ) => {
      assertProjectOpenForNotes();
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid payload");
      }
      const { draggedId, targetId } = payload;
      if (!isValidNoteId(draggedId) || !isValidNoteId(targetId)) {
        throw new Error("Invalid id");
      }
      const p = payload.placement;
      if (p !== "before" && p !== "after" && p !== "into") {
        throw new Error("Invalid placement");
      }
      const db = getNotesDatabase();
      if (db) {
        const ownerId = getWpnOwnerId();
        const a = wpnSqliteGetNoteById(db, ownerId, draggedId);
        const b = wpnSqliteGetNoteById(db, ownerId, targetId);
        if (a && b && a.project_id === b.project_id) {
          wpnSqliteMoveNote(db, ownerId, a.project_id, draggedId, targetId, p);
          return;
        }
      }
      const registeredTypes = registry.getRegisteredTypes();
      ensureNotesSeeded(registeredTypes);
      pushNotesUndoSnapshot();
      moveNoteInStore(draggedId, targetId, p);
      persistNotes();
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.PASTE_SUBTREE,
    async (
      _event,
      payload: {
        sourceId: string;
        targetId: string;
        mode: string;
        placement: string;
      },
    ) => {
      assertProjectOpenForNotes();
      const registeredTypes = registry.getRegisteredTypes();
      ensureNotesSeeded(registeredTypes);

      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid payload");
      }
      const { sourceId, targetId, mode, placement } = payload;
      if (!isValidNoteId(sourceId) || !isValidNoteId(targetId)) {
        throw new Error("Invalid id");
      }
      if (mode !== "cut" && mode !== "copy") {
        throw new Error("Invalid mode");
      }
      if (
        placement !== "before" &&
        placement !== "after" &&
        placement !== "into"
      ) {
        throw new Error("Invalid placement");
      }
      if (mode === "cut") {
        pushNotesUndoSnapshot();
        moveNoteInStore(sourceId, targetId, placement);
        persistNotes();
        return {};
      }
      pushNotesUndoSnapshot();
      const { newRootId } = duplicateSubtreeAt(sourceId, targetId, placement);
      persistNotes();
      return { newRootId };
    },
  );
}
