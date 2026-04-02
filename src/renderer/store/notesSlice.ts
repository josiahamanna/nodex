import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import {
  CreateNoteRelation,
  Note,
  NoteListItem,
  NoteMovePlacement,
  PasteSubtreePayload,
} from "@nodex/ui-types";
import { PLUGIN_UI_METADATA_KEY } from "../../shared/plugin-state-protocol";

interface NotesState {
  currentNote: Note | null;
  notesList: NoteListItem[];
  /** Sidebar / tree list fetch */
  listLoading: boolean;
  /** Selected note body fetch */
  detailLoading: boolean;
  error: string | null;
  /**
   * Incremented on successful `renameNote` (IPC / API). WPN Notes explorer listens
   * and refetches the open project tree so titles stay in sync with the editor header.
   */
  noteRenameEpoch: number;
}

const initialState: NotesState = {
  currentNote: null,
  notesList: [],
  listLoading: false,
  detailLoading: false,
  error: null,
  noteRenameEpoch: 0,
};

export const fetchNote = createAsyncThunk(
  "notes/fetchNote",
  async (noteId?: string) => {
    return await window.Nodex.getNote(noteId);
  },
);

export const fetchAllNotes = createAsyncThunk(
  "notes/fetchAllNotes",
  async () => {
    return await window.Nodex.getAllNotes();
  },
);

export const createNote = createAsyncThunk(
  "notes/createNote",
  async (payload: {
    anchorId?: string;
    relation: CreateNoteRelation;
    type: string;
    content?: string;
    title?: string;
  }) => {
    return await window.Nodex.createNote(payload);
  },
);

export const renameNote = createAsyncThunk(
  "notes/renameNote",
  async ({ id, title }: { id: string; title: string }) => {
    await window.Nodex.renameNote(id, title);
    return { id, title };
  },
);

export const moveNoteInTree = createAsyncThunk(
  "notes/moveNote",
  async (payload: {
    draggedId: string;
    targetId: string;
    placement: NoteMovePlacement;
  }) => {
    await window.Nodex.moveNote(
      payload.draggedId,
      payload.targetId,
      payload.placement,
    );
  },
);

export const moveNotesBulkInTree = createAsyncThunk(
  "notes/moveNotesBulk",
  async (payload: {
    ids: string[];
    targetId: string;
    placement: NoteMovePlacement;
  }) => {
    await window.Nodex.moveNotesBulk(
      payload.ids,
      payload.targetId,
      payload.placement,
    );
  },
);

export const deleteNotesInTree = createAsyncThunk(
  "notes/deleteNotes",
  async (ids: string[]) => {
    await window.Nodex.deleteNotes(ids);
  },
);

export const pasteSubtree = createAsyncThunk(
  "notes/pasteSubtree",
  async (payload: PasteSubtreePayload) => {
    return await window.Nodex.pasteSubtree(payload);
  },
);

export const saveNotePluginUiState = createAsyncThunk(
  "notes/saveNotePluginUiState",
  async ({ noteId, state }: { noteId: string; state: unknown }) => {
    await window.Nodex.saveNotePluginUiState(noteId, state);
    return { noteId, state };
  },
);

export const saveNoteContent = createAsyncThunk(
  "notes/saveNoteContent",
  async ({ noteId, content }: { noteId: string; content: string }) => {
    await window.Nodex.saveNoteContent(noteId, content);
    return { noteId, content };
  },
);

export const patchNoteMetadata = createAsyncThunk(
  "notes/patchNoteMetadata",
  async ({ noteId, patch }: { noteId: string; patch: Record<string, unknown> }) => {
    await window.Nodex.patchNoteMetadata(noteId, patch);
    return { noteId, patch };
  },
);

const notesSlice = createSlice({
  name: "notes",
  initialState,
  reducers: {
    setCurrentNote: (state, action: PayloadAction<Note>) => {
      state.currentNote = action.payload;
    },
    clearCurrentNote: (state) => {
      state.currentNote = null;
      state.detailLoading = false;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNote.pending, (state) => {
        state.detailLoading = true;
        state.error = null;
      })
      .addCase(fetchNote.fulfilled, (state, action) => {
        state.detailLoading = false;
        state.currentNote = action.payload ?? null;
      })
      .addCase(fetchNote.rejected, (state, action) => {
        state.detailLoading = false;
        state.error = action.error.message || "Failed to fetch note";
      })
      .addCase(fetchAllNotes.pending, (state) => {
        state.listLoading = true;
        state.error = null;
      })
      .addCase(fetchAllNotes.fulfilled, (state, action) => {
        state.listLoading = false;
        state.notesList = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(fetchAllNotes.rejected, (state, action) => {
        state.listLoading = false;
        state.error = action.error.message || "Failed to fetch notes list";
      })
      .addCase(createNote.fulfilled, (state) => {
        state.error = null;
      })
      .addCase(createNote.rejected, (state, action) => {
        state.error = action.error.message || "Failed to create note";
      })
      .addCase(renameNote.fulfilled, (state, action) => {
        state.error = null;
        state.noteRenameEpoch += 1;
        if (state.currentNote?.id === action.payload.id) {
          state.currentNote = {
            ...state.currentNote,
            title: action.payload.title.trim(),
          };
        }
      })
      .addCase(renameNote.rejected, (state, action) => {
        state.error = action.error.message || "Failed to rename note";
      })
      .addCase(moveNoteInTree.rejected, (state, action) => {
        state.error = action.error.message || "Failed to move note";
      })
      .addCase(moveNotesBulkInTree.rejected, (state, action) => {
        state.error = action.error.message || "Failed to move notes";
      })
      .addCase(deleteNotesInTree.rejected, (state, action) => {
        state.error = action.error.message || "Failed to delete notes";
      })
      .addCase(pasteSubtree.rejected, (state, action) => {
        state.error = action.error.message || "Failed to paste";
      })
      .addCase(saveNotePluginUiState.fulfilled, (state, action) => {
        const { noteId, state: snap } = action.payload;
        if (state.currentNote?.id === noteId) {
          state.currentNote = {
            ...state.currentNote,
            metadata: {
              ...(state.currentNote.metadata ?? {}),
              [PLUGIN_UI_METADATA_KEY]: snap,
            },
          };
        }
      })
      .addCase(saveNotePluginUiState.rejected, (state, action) => {
        state.error =
          action.error.message || "Failed to save plugin UI state";
      })
      .addCase(saveNoteContent.fulfilled, (state, action) => {
        const { noteId, content } = action.payload;
        if (state.currentNote?.id === noteId) {
          state.currentNote = { ...state.currentNote, content };
        }
      })
      .addCase(saveNoteContent.rejected, (state, action) => {
        state.error =
          action.error.message || "Failed to save note content";
      });
    builder
      .addCase(patchNoteMetadata.fulfilled, (state, action) => {
        const { noteId, patch } = action.payload;
        if (state.currentNote?.id === noteId) {
          state.currentNote = {
            ...state.currentNote,
            metadata: { ...(state.currentNote.metadata ?? {}), ...patch },
          };
        }
      })
      .addCase(patchNoteMetadata.rejected, (state, action) => {
        state.error =
          action.error.message || "Failed to save note metadata";
      });
  },
});

export const { setCurrentNote, clearCurrentNote, clearError } = notesSlice.actions;
export default notesSlice.reducer;
