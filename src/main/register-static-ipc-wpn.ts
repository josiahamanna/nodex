import { ipcMain } from "electron";
import { registry } from "../core/registry";
import { getNotesDatabase } from "../core/notes-sqlite";
import { getWpnOwnerId } from "../core/wpn/wpn-owner";
import {
  wpnSqliteCreateProject,
  wpnSqliteCreateWorkspace,
  wpnSqliteDeleteProject,
  wpnSqliteDeleteWorkspace,
  wpnSqliteListProjects,
  wpnSqliteListWorkspaces,
  wpnSqliteUpdateProject,
  wpnSqliteUpdateWorkspace,
} from "../core/wpn/wpn-sqlite-service";
import {
  wpnSqliteCreateNote,
  wpnSqliteDeleteNotes,
  wpnSqliteDuplicateNoteSubtree,
  wpnSqliteGetExplorerExpanded,
  wpnSqliteGetNoteById,
  wpnSqliteListNotesFlat,
  wpnSqliteMoveNote,
  wpnSqliteSetExplorerExpanded,
  wpnSqliteUpdateNote,
} from "../core/wpn/wpn-sqlite-notes";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import type { NoteMovePlacement } from "../shared/nodex-renderer-api";
import { isValidNoteId, isValidNoteType } from "../shared/validators";
import type {
  WpnProjectPatch,
  WpnWorkspacePatch,
} from "../shared/wpn-v2-types";
import { assertProjectOpenForNotes } from "./main-helpers";

function requireNotesDb() {
  assertProjectOpenForNotes();
  const db = getNotesDatabase();
  if (!db) {
    throw new Error("Notes database is not open");
  }
  return db;
}

export function registerStaticIpcWpnHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WPN_LIST_WORKSPACES, async () => {
    const db = requireNotesDb();
    const ownerId = getWpnOwnerId();
    return { workspaces: wpnSqliteListWorkspaces(db, ownerId) };
  });

  ipcMain.handle(IPC_CHANNELS.WPN_CREATE_WORKSPACE, async (_e, name?: unknown) => {
    const db = requireNotesDb();
    const ownerId = getWpnOwnerId();
    const n = typeof name === "string" ? name : "Workspace";
    const workspace = wpnSqliteCreateWorkspace(db, ownerId, n);
    return { workspace };
  });

  ipcMain.handle(
    IPC_CHANNELS.WPN_UPDATE_WORKSPACE,
    async (_e, id: unknown, patch: unknown) => {
      if (typeof id !== "string" || !id) {
        throw new Error("Invalid workspace id");
      }
      const db = requireNotesDb();
      const ownerId = getWpnOwnerId();
      const p = (patch && typeof patch === "object"
        ? patch
        : {}) as WpnWorkspacePatch;
      const workspace = wpnSqliteUpdateWorkspace(db, ownerId, id, p);
      if (!workspace) {
        throw new Error("Workspace not found");
      }
      return { workspace };
    },
  );

  ipcMain.handle(IPC_CHANNELS.WPN_DELETE_WORKSPACE, async (_e, id: unknown) => {
    if (typeof id !== "string" || !id) {
      throw new Error("Invalid workspace id");
    }
    const db = requireNotesDb();
    const ownerId = getWpnOwnerId();
    const ok = wpnSqliteDeleteWorkspace(db, ownerId, id);
    if (!ok) {
      throw new Error("Workspace not found");
    }
    return { ok: true as const };
  });

  ipcMain.handle(
    IPC_CHANNELS.WPN_LIST_PROJECTS,
    async (_e, workspaceId: unknown) => {
      if (typeof workspaceId !== "string" || !workspaceId) {
        throw new Error("Invalid workspace id");
      }
      const db = requireNotesDb();
      const ownerId = getWpnOwnerId();
      return { projects: wpnSqliteListProjects(db, ownerId, workspaceId) };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WPN_CREATE_PROJECT,
    async (_e, workspaceId: unknown, name?: unknown) => {
      if (typeof workspaceId !== "string" || !workspaceId) {
        throw new Error("Invalid workspace id");
      }
      const db = requireNotesDb();
      const ownerId = getWpnOwnerId();
      const n = typeof name === "string" ? name : "Project";
      const project = wpnSqliteCreateProject(db, ownerId, workspaceId, n);
      if (!project) {
        throw new Error("Workspace not found");
      }
      return { project };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WPN_UPDATE_PROJECT,
    async (_e, id: unknown, patch: unknown) => {
      if (typeof id !== "string" || !id) {
        throw new Error("Invalid project id");
      }
      const db = requireNotesDb();
      const ownerId = getWpnOwnerId();
      const p = (patch && typeof patch === "object"
        ? patch
        : {}) as WpnProjectPatch;
      const project = wpnSqliteUpdateProject(db, ownerId, id, p);
      if (!project) {
        throw new Error("Project not found");
      }
      return { project };
    },
  );

  ipcMain.handle(IPC_CHANNELS.WPN_DELETE_PROJECT, async (_e, id: unknown) => {
    if (typeof id !== "string" || !id) {
      throw new Error("Invalid project id");
    }
    const db = requireNotesDb();
    const ownerId = getWpnOwnerId();
    const ok = wpnSqliteDeleteProject(db, ownerId, id);
    if (!ok) {
      throw new Error("Project not found");
    }
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.WPN_LIST_NOTES, async (_e, projectId: unknown) => {
    if (typeof projectId !== "string" || !projectId) {
      throw new Error("Invalid project id");
    }
    const db = requireNotesDb();
    const ownerId = getWpnOwnerId();
    return { notes: wpnSqliteListNotesFlat(db, ownerId, projectId) };
  });

  ipcMain.handle(IPC_CHANNELS.WPN_GET_NOTE, async (_e, noteId: unknown) => {
    if (typeof noteId !== "string" || !noteId) {
      throw new Error("Invalid note id");
    }
    const db = requireNotesDb();
    const ownerId = getWpnOwnerId();
    const note = wpnSqliteGetNoteById(db, ownerId, noteId);
    if (!note) {
      throw new Error("Note not found");
    }
    return { note };
  });

  ipcMain.handle(IPC_CHANNELS.WPN_GET_EXPLORER_STATE, async (_e, projectId: unknown) => {
    if (typeof projectId !== "string" || !projectId) {
      throw new Error("Invalid project id");
    }
    const db = requireNotesDb();
    const ownerId = getWpnOwnerId();
    return { expanded_ids: wpnSqliteGetExplorerExpanded(db, ownerId, projectId) };
  });

  ipcMain.handle(
    IPC_CHANNELS.WPN_SET_EXPLORER_STATE,
    async (_e, projectId: unknown, expandedIds: unknown) => {
      if (typeof projectId !== "string" || !projectId) {
        throw new Error("Invalid project id");
      }
      const ids = Array.isArray(expandedIds)
        ? expandedIds.filter((x): x is string => typeof x === "string")
        : [];
      const db = requireNotesDb();
      const ownerId = getWpnOwnerId();
      wpnSqliteSetExplorerExpanded(db, ownerId, projectId, ids);
      return { expanded_ids: ids };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WPN_CREATE_NOTE_IN_PROJECT,
    async (_e, projectId: unknown, payload: unknown) => {
      if (typeof projectId !== "string" || !projectId) {
        throw new Error("Invalid project id");
      }
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid payload");
      }
      const p = payload as {
        type?: string;
        relation?: string;
        anchorId?: string;
        content?: string;
        title?: string;
      };
      const type = typeof p.type === "string" ? p.type : "";
      const selectable = registry.getSelectableNoteTypes();
      if (!isValidNoteType(type) || !selectable.includes(type)) {
        throw new Error("Invalid note type");
      }
      const rel = p.relation;
      if (rel !== "child" && rel !== "sibling" && rel !== "root") {
        throw new Error("Invalid relation");
      }
      const db = requireNotesDb();
      const ownerId = getWpnOwnerId();
      return wpnSqliteCreateNote(db, ownerId, projectId, {
        anchorId: rel === "root" ? undefined : p.anchorId,
        relation: rel,
        type,
        content: typeof p.content === "string" ? p.content : undefined,
        title: typeof p.title === "string" ? p.title : undefined,
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.WPN_PATCH_NOTE, async (_e, noteId: unknown, patch: unknown) => {
    if (typeof noteId !== "string" || !noteId) {
      throw new Error("Invalid note id");
    }
    const p =
      patch && typeof patch === "object"
        ? (patch as {
            title?: string;
            content?: string;
            type?: string;
            metadata?: Record<string, unknown> | null;
          })
        : {};
    const db = requireNotesDb();
    const ownerId = getWpnOwnerId();
    const note = wpnSqliteUpdateNote(db, ownerId, noteId, p);
    if (!note) {
      throw new Error("Note not found");
    }
    return { note };
  });

  ipcMain.handle(IPC_CHANNELS.WPN_DELETE_NOTES, async (_e, ids: unknown) => {
    if (!Array.isArray(ids)) {
      throw new Error("Invalid ids");
    }
    const list = ids.filter((x): x is string => typeof x === "string" && isValidNoteId(x));
    const db = requireNotesDb();
    const ownerId = getWpnOwnerId();
    wpnSqliteDeleteNotes(db, ownerId, list);
    return { ok: true as const };
  });

  ipcMain.handle(
    IPC_CHANNELS.WPN_MOVE_NOTE,
    async (
      _e,
      payload: {
        projectId?: string;
        draggedId?: string;
        targetId?: string;
        placement?: string;
      },
    ) => {
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid payload");
      }
      const { projectId, draggedId, targetId, placement } = payload;
      if (
        typeof projectId !== "string" ||
        typeof draggedId !== "string" ||
        typeof targetId !== "string"
      ) {
        throw new Error("projectId, draggedId, targetId required");
      }
      if (placement !== "before" && placement !== "after" && placement !== "into") {
        throw new Error("Invalid placement");
      }
      const db = requireNotesDb();
      const ownerId = getWpnOwnerId();
      wpnSqliteMoveNote(
        db,
        ownerId,
        projectId,
        draggedId,
        targetId,
        placement as NoteMovePlacement,
      );
      return { ok: true as const };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WPN_DUPLICATE_NOTE_SUBTREE,
    async (_e, projectId: unknown, noteId: unknown) => {
      if (typeof projectId !== "string" || typeof noteId !== "string") {
        throw new Error("projectId and noteId required");
      }
      const db = requireNotesDb();
      const ownerId = getWpnOwnerId();
      return wpnSqliteDuplicateNoteSubtree(db, ownerId, projectId, noteId);
    },
  );
}
