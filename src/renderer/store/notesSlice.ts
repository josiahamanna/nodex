import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import {
  CreateNoteRelation,
  Note,
  NoteListItem,
} from "../../preload";

interface NotesState {
  currentNote: Note | null;
  notesList: NoteListItem[];
  loading: boolean;
  error: string | null;
}

const initialState: NotesState = {
  currentNote: null,
  notesList: [],
  loading: false,
  error: null,
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

const notesSlice = createSlice({
  name: "notes",
  initialState,
  reducers: {
    setCurrentNote: (state, action: PayloadAction<Note>) => {
      state.currentNote = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNote.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNote.fulfilled, (state, action) => {
        state.loading = false;
        state.currentNote = action.payload ?? null;
      })
      .addCase(fetchNote.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch note";
      })
      .addCase(fetchAllNotes.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAllNotes.fulfilled, (state, action) => {
        state.loading = false;
        state.notesList = action.payload;
      })
      .addCase(fetchAllNotes.rejected, (state, action) => {
        state.loading = false;
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
        if (state.currentNote?.id === action.payload.id) {
          state.currentNote = {
            ...state.currentNote,
            title: action.payload.title.trim(),
          };
        }
      })
      .addCase(renameNote.rejected, (state, action) => {
        state.error = action.error.message || "Failed to rename note";
      });
  },
});

export const { setCurrentNote, clearError } = notesSlice.actions;
export default notesSlice.reducer;
