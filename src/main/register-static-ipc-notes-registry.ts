import { ipcMain } from "electron";
import {
  ensureNotesSeeded,
  createNote as createNoteInStore,
  getFirstNote,
  getNoteById,
  getNotesFlat,
  renameNote as renameNoteInStore,
  setNoteContent as setNoteContentInStore,
  setNotePluginUiState,
} from "../core/notes-store";
import { MAX_NOTE_CONTENT_CHARS } from "../core/notes-store-duplicate-create";
import { registry } from "../core/registry";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import type { Note } from "../shared/nodex-renderer-api";
import { isValidNoteId, isValidNoteType } from "../shared/validators";
import { ctx } from "./main-context";
import {
  assertProjectOpenForNotes,
  persistNotes,
} from "./main-helpers";
import { pushNotesUndoSnapshot } from "../core/nodex-undo";

export function registerStaticIpcNotesRegistryHandlers(): void {
ipcMain.handle(IPC_CHANNELS.GET_NOTE, async (_event, noteId?: string) => {
  if (!ctx.projectRootPath) {
    if (noteId !== undefined) {
      throw new Error("Open a project folder first (Notes → Open project).");
    }
    return null;
  }
  const registeredTypes = registry.getRegisteredTypes();
  ensureNotesSeeded(registeredTypes);

  if (noteId) {
    if (!isValidNoteId(noteId)) {
      throw new Error("Invalid note id");
    }
    const note = getNoteById(noteId);
    if (!note) {
      throw new Error("Note not found");
    }
    const { id, type, title, content, metadata } = note;
    return { id, type, title, content, metadata };
  }

  const first = getFirstNote();
  if (!first) {
    return null;
  }
  const { id, type, title, content, metadata } = first;
  return { id, type, title, content, metadata };
});

ipcMain.handle(IPC_CHANNELS.GET_ALL_NOTES, async () => {
  if (!ctx.projectRootPath) {
    return [];
  }
  const registeredTypes = registry.getRegisteredTypes();
  ensureNotesSeeded(registeredTypes);
  return getNotesFlat();
});

const MAX_NOTE_TITLE_CHARS = 4_000;

ipcMain.handle(
  IPC_CHANNELS.CREATE_NOTE,
  async (
    _event,
    payload: {
      anchorId?: string;
      relation: string;
      type: string;
      content?: string;
      title?: string;
    },
  ) => {
    assertProjectOpenForNotes();
    const registeredTypes = registry.getRegisteredTypes();
    ensureNotesSeeded(registeredTypes);

    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid payload");
    }
    const { type } = payload;
    const selectable = registry.getSelectableNoteTypes();
    if (!isValidNoteType(type) || !selectable.includes(type)) {
      throw new Error("Invalid note type");
    }
    const rel = payload.relation;
    if (rel !== "child" && rel !== "sibling" && rel !== "root") {
      throw new Error("Invalid relation");
    }
    let anchorId = payload.anchorId;
    if (anchorId !== undefined && !isValidNoteId(anchorId)) {
      throw new Error("Invalid anchor id");
    }
    if (rel === "root") {
      anchorId = undefined;
    }
    if (payload.content !== undefined) {
      if (typeof payload.content !== "string") {
        throw new Error("Invalid content");
      }
      if (payload.content.length > MAX_NOTE_CONTENT_CHARS) {
        throw new Error("Content too large");
      }
    }
    if (payload.title !== undefined) {
      if (typeof payload.title !== "string") {
        throw new Error("Invalid title");
      }
      if (payload.title.length > MAX_NOTE_TITLE_CHARS) {
        throw new Error("Title too long");
      }
    }
    pushNotesUndoSnapshot();
    const created = createNoteInStore({
      anchorId,
      relation: rel,
      type,
      content: payload.content,
      title: payload.title,
    });
    persistNotes();
    return { id: created.id };
  },
);

ipcMain.handle(IPC_CHANNELS.RENAME_NOTE, async (_event, id: string, title: string) => {
  assertProjectOpenForNotes();
  const registeredTypes = registry.getRegisteredTypes();
  ensureNotesSeeded(registeredTypes);

  if (!isValidNoteId(id)) {
    throw new Error("Invalid note id");
  }
  if (typeof title !== "string") {
    throw new Error("Invalid title");
  }
  pushNotesUndoSnapshot();
  renameNoteInStore(id, title);
  persistNotes();
});

ipcMain.handle(
  IPC_CHANNELS.SAVE_NOTE_PLUGIN_UI_STATE,
  async (_event, noteId: string, state: unknown) => {
    assertProjectOpenForNotes();
    const registeredTypes = registry.getRegisteredTypes();
    ensureNotesSeeded(registeredTypes);

    if (!isValidNoteId(noteId)) {
      throw new Error("Invalid note id");
    }
    setNotePluginUiState(noteId, state);
    persistNotes();
  },
);

ipcMain.handle(
  IPC_CHANNELS.SAVE_NOTE_CONTENT,
  async (_event, noteId: string, content: string) => {
    assertProjectOpenForNotes();
    const registeredTypes = registry.getRegisteredTypes();
    ensureNotesSeeded(registeredTypes);

    if (!isValidNoteId(noteId)) {
      throw new Error("Invalid note id");
    }
    if (typeof content !== "string") {
      throw new Error("Invalid content");
    }
    setNoteContentInStore(noteId, content);
    persistNotes();
  },
);

ipcMain.handle(IPC_CHANNELS.GET_COMPONENT, async (_event, type: string) => {
  if (!isValidNoteType(type)) {
    throw new Error("Invalid note type");
  }

  const component = registry.getComponent(type);
  if (!component) {
    return null;
  }

  return component;
});

ipcMain.handle(
  IPC_CHANNELS.GET_PLUGIN_HTML,
  async (_event, type: string, note: Note) => {
    if (!isValidNoteType(type)) {
      throw new Error("Invalid note type");
    }

    const renderer = registry.getRenderer(type);
    if (!renderer) {
      return null;
    }

    try {
      const html = await Promise.resolve(renderer.render(note));
      return html;
    } catch (error) {
      console.error(
        `[Main] Error rendering plugin HTML for type ${type}:`,
        error,
      );
      throw error;
    }
  },
);

ipcMain.handle(IPC_CHANNELS.GET_REGISTERED_TYPES, async () => {
  return registry.getRegisteredTypes();
});

ipcMain.handle(IPC_CHANNELS.GET_SELECTABLE_NOTE_TYPES, async () => {
  return registry.getSelectableNoteTypes();
});
}
