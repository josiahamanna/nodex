import { ipcMain } from "electron";
import { assertElectronFileVaultWindow } from "./electron-wpn-backend";
import { registry } from "../core/registry";
import { getNotesDatabase } from "../core/workspace-store";
import { getWpnOwnerId } from "../core/wpn/wpn-owner";
import {
  wpnJsonCreateProject,
  wpnJsonCreateWorkspace,
  wpnJsonDeleteProject,
  wpnJsonDeleteWorkspace,
  wpnJsonListProjects,
  wpnJsonListWorkspaces,
  wpnJsonUpdateProject,
  wpnJsonUpdateWorkspace,
} from "../core/wpn/wpn-json-service";
import {
  wpnJsonCreateNote,
  wpnJsonDeleteNotes,
  wpnJsonDuplicateNoteSubtree,
  wpnJsonGetExplorerExpanded,
  wpnJsonGetNoteById,
  wpnJsonListAllNotesWithContext,
  wpnJsonListBacklinksToNote,
  wpnJsonListNotesFlat,
  wpnJsonMoveNote,
  wpnJsonSetExplorerExpanded,
  wpnJsonUpdateNote,
} from "../core/wpn/wpn-json-notes";
import {
  wpnJsonApplyVfsRewritesAfterTitleChange,
  wpnJsonPreviewVfsRewritesAfterTitleChange,
} from "../core/wpn/wpn-rename-vfs-rewrite";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import type { NoteMovePlacement } from "../shared/nodex-renderer-api";
import { isValidNoteId, isValidNoteType } from "../shared/validators";
import type {
  WpnProjectPatch,
  WpnWorkspacePatch,
} from "../shared/wpn-v2-types";
import { assertProjectOpenForNotes } from "./main-helpers";

function requireWorkspaceStore() {
  assertProjectOpenForNotes();
  const store = getNotesDatabase();
  if (!store) {
    throw new Error("Workspace store is not open");
  }
  return store;
}

export function registerStaticIpcWpnHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WPN_LIST_WORKSPACES, async (e) => {
    assertElectronFileVaultWindow(e);
    const db = requireWorkspaceStore();
    const ownerId = getWpnOwnerId();
    return { workspaces: wpnJsonListWorkspaces(db, ownerId) };
  });

  ipcMain.handle(IPC_CHANNELS.WPN_CREATE_WORKSPACE, async (e, name?: unknown) => {
    assertElectronFileVaultWindow(e);
    const db = requireWorkspaceStore();
    const ownerId = getWpnOwnerId();
    const n = typeof name === "string" ? name : "Workspace";
    const workspace = wpnJsonCreateWorkspace(db, ownerId, n);
    return { workspace };
  });

  ipcMain.handle(
    IPC_CHANNELS.WPN_UPDATE_WORKSPACE,
    async (e, id: unknown, patch: unknown) => {
      assertElectronFileVaultWindow(e);
      if (typeof id !== "string" || !id) {
        throw new Error("Invalid workspace id");
      }
      const db = requireWorkspaceStore();
      const ownerId = getWpnOwnerId();
      const p = (patch && typeof patch === "object"
        ? patch
        : {}) as WpnWorkspacePatch;
      const workspace = wpnJsonUpdateWorkspace(db, ownerId, id, p);
      if (!workspace) {
        throw new Error("Workspace not found");
      }
      return { workspace };
    },
  );

  ipcMain.handle(IPC_CHANNELS.WPN_DELETE_WORKSPACE, async (e, id: unknown) => {
    assertElectronFileVaultWindow(e);
    if (typeof id !== "string" || !id) {
      throw new Error("Invalid workspace id");
    }
    const db = requireWorkspaceStore();
    const ownerId = getWpnOwnerId();
    const ok = wpnJsonDeleteWorkspace(db, ownerId, id);
    if (!ok) {
      throw new Error("Workspace not found");
    }
    return { ok: true as const };
  });

  ipcMain.handle(
    IPC_CHANNELS.WPN_LIST_PROJECTS,
    async (e, workspaceId: unknown) => {
      assertElectronFileVaultWindow(e);
      if (typeof workspaceId !== "string" || !workspaceId) {
        throw new Error("Invalid workspace id");
      }
      const db = requireWorkspaceStore();
      const ownerId = getWpnOwnerId();
      return { projects: wpnJsonListProjects(db, ownerId, workspaceId) };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WPN_CREATE_PROJECT,
    async (e, workspaceId: unknown, name?: unknown) => {
      assertElectronFileVaultWindow(e);
      if (typeof workspaceId !== "string" || !workspaceId) {
        throw new Error("Invalid workspace id");
      }
      const db = requireWorkspaceStore();
      const ownerId = getWpnOwnerId();
      const n = typeof name === "string" ? name : "Project";
      const project = wpnJsonCreateProject(db, ownerId, workspaceId, n);
      if (!project) {
        throw new Error("Workspace not found");
      }
      return { project };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WPN_UPDATE_PROJECT,
    async (e, id: unknown, patch: unknown) => {
      assertElectronFileVaultWindow(e);
      if (typeof id !== "string" || !id) {
        throw new Error("Invalid project id");
      }
      const db = requireWorkspaceStore();
      const ownerId = getWpnOwnerId();
      const p = (patch && typeof patch === "object"
        ? patch
        : {}) as WpnProjectPatch;
      const project = wpnJsonUpdateProject(db, ownerId, id, p);
      if (!project) {
        throw new Error("Project not found");
      }
      return { project };
    },
  );

  ipcMain.handle(IPC_CHANNELS.WPN_DELETE_PROJECT, async (e, id: unknown) => {
    assertElectronFileVaultWindow(e);
    if (typeof id !== "string" || !id) {
      throw new Error("Invalid project id");
    }
    const db = requireWorkspaceStore();
    const ownerId = getWpnOwnerId();
    const ok = wpnJsonDeleteProject(db, ownerId, id);
    if (!ok) {
      throw new Error("Project not found");
    }
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.WPN_LIST_NOTES, async (e, projectId: unknown) => {
    assertElectronFileVaultWindow(e);
    if (typeof projectId !== "string" || !projectId) {
      throw new Error("Invalid project id");
    }
    const db = requireWorkspaceStore();
    const ownerId = getWpnOwnerId();
    return { notes: wpnJsonListNotesFlat(db, ownerId, projectId) };
  });

  ipcMain.handle(IPC_CHANNELS.WPN_LIST_ALL_NOTES_WITH_CONTEXT, async (e) => {
    assertElectronFileVaultWindow(e);
    const db = requireWorkspaceStore();
    const ownerId = getWpnOwnerId();
    return { notes: wpnJsonListAllNotesWithContext(db, ownerId) };
  });

  ipcMain.handle(IPC_CHANNELS.WPN_LIST_BACKLINKS_TO_NOTE, async (e, targetNoteId: unknown) => {
    assertElectronFileVaultWindow(e);
    if (typeof targetNoteId !== "string" || !targetNoteId) {
      throw new Error("Invalid note id");
    }
    const db = requireWorkspaceStore();
    const ownerId = getWpnOwnerId();
    return { sources: wpnJsonListBacklinksToNote(db, ownerId, targetNoteId) };
  });

  ipcMain.handle(IPC_CHANNELS.WPN_GET_NOTE, async (e, noteId: unknown) => {
    assertElectronFileVaultWindow(e);
    if (typeof noteId !== "string" || !noteId) {
      throw new Error("Invalid note id");
    }
    const db = requireWorkspaceStore();
    const ownerId = getWpnOwnerId();
    const note = wpnJsonGetNoteById(db, ownerId, noteId);
    if (!note) {
      throw new Error("Note not found");
    }
    return { note };
  });

  ipcMain.handle(IPC_CHANNELS.WPN_GET_EXPLORER_STATE, async (e, projectId: unknown) => {
    assertElectronFileVaultWindow(e);
    if (typeof projectId !== "string" || !projectId) {
      throw new Error("Invalid project id");
    }
    const db = requireWorkspaceStore();
    const ownerId = getWpnOwnerId();
    return { expanded_ids: wpnJsonGetExplorerExpanded(db, ownerId, projectId) };
  });

  ipcMain.handle(
    IPC_CHANNELS.WPN_SET_EXPLORER_STATE,
    async (e, projectId: unknown, expandedIds: unknown) => {
      assertElectronFileVaultWindow(e);
      if (typeof projectId !== "string" || !projectId) {
        throw new Error("Invalid project id");
      }
      const ids = Array.isArray(expandedIds)
        ? expandedIds.filter((x): x is string => typeof x === "string")
        : [];
      const db = requireWorkspaceStore();
      const ownerId = getWpnOwnerId();
      wpnJsonSetExplorerExpanded(db, ownerId, projectId, ids);
      return { expanded_ids: ids };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WPN_CREATE_NOTE_IN_PROJECT,
    async (e, projectId: unknown, payload: unknown) => {
      assertElectronFileVaultWindow(e);
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
      const db = requireWorkspaceStore();
      const ownerId = getWpnOwnerId();
      return wpnJsonCreateNote(db, ownerId, projectId, {
        anchorId: rel === "root" ? undefined : p.anchorId,
        relation: rel,
        type,
        content: typeof p.content === "string" ? p.content : undefined,
        title: typeof p.title === "string" ? p.title : undefined,
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.WPN_PATCH_NOTE, async (e, noteId: unknown, patch: unknown) => {
    assertElectronFileVaultWindow(e);
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
            updateVfsDependentLinks?: boolean;
          })
        : {};
    const updateVfsDependentLinks = p.updateVfsDependentLinks !== false;
    const { updateVfsDependentLinks: _drop, ...notePatch } = p;
    const db = requireWorkspaceStore();
    const ownerId = getWpnOwnerId();
    const before =
      notePatch.title !== undefined ? wpnJsonGetNoteById(db, ownerId, noteId) : null;
    const note = wpnJsonUpdateNote(db, ownerId, noteId, notePatch);
    if (!note) {
      throw new Error("Note not found");
    }
    if (
      updateVfsDependentLinks &&
      before &&
      notePatch.title !== undefined &&
      (notePatch.title.trim() || before.title) !== before.title
    ) {
      try {
        wpnJsonApplyVfsRewritesAfterTitleChange(db, ownerId, noteId, before.title, note.title);
      } catch (err) {
        console.error("[WPN_PATCH_NOTE] VFS rewrite after title change:", err);
        throw err instanceof Error ? err : new Error(String(err));
      }
    }
    return { note };
  });

  ipcMain.handle(
    IPC_CHANNELS.WPN_PREVIEW_NOTE_TITLE_VFS_IMPACT,
    async (e, noteId: unknown, newTitle: unknown) => {
      assertElectronFileVaultWindow(e);
      if (typeof noteId !== "string" || !noteId) {
        throw new Error("Invalid note id");
      }
      if (typeof newTitle !== "string") {
        throw new Error("Invalid title");
      }
      const db = requireWorkspaceStore();
      const ownerId = getWpnOwnerId();
      const before = wpnJsonGetNoteById(db, ownerId, noteId);
      if (!before) {
        throw new Error("Note not found");
      }
      const nextTitle = newTitle.trim() ? newTitle.trim() : before.title;
      const preview = wpnJsonPreviewVfsRewritesAfterTitleChange(
        db,
        ownerId,
        noteId,
        before.title,
        nextTitle,
      );
      return {
        dependentNoteCount: preview.dependentNoteCount,
        dependentNoteIds: preview.dependentNoteIds,
      };
    },
  );

  ipcMain.handle(IPC_CHANNELS.WPN_DELETE_NOTES, async (e, ids: unknown) => {
    assertElectronFileVaultWindow(e);
    if (!Array.isArray(ids)) {
      throw new Error("Invalid ids");
    }
    const list = ids.filter((x): x is string => typeof x === "string" && isValidNoteId(x));
    const db = requireWorkspaceStore();
    const ownerId = getWpnOwnerId();
    wpnJsonDeleteNotes(db, ownerId, list);
    return { ok: true as const };
  });

  ipcMain.handle(
    IPC_CHANNELS.WPN_MOVE_NOTE,
    async (
      e,
      payload: {
        projectId?: string;
        draggedId?: string;
        targetId?: string;
        placement?: string;
      },
    ) => {
      assertElectronFileVaultWindow(e);
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
      const db = requireWorkspaceStore();
      const ownerId = getWpnOwnerId();
      wpnJsonMoveNote(
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
    async (e, projectId: unknown, noteId: unknown) => {
      assertElectronFileVaultWindow(e);
      if (typeof projectId !== "string" || typeof noteId !== "string") {
        throw new Error("projectId and noteId required");
      }
      const db = requireWorkspaceStore();
      const ownerId = getWpnOwnerId();
      return wpnJsonDuplicateNoteSubtree(db, ownerId, projectId, noteId);
    },
  );
}
