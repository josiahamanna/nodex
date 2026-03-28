import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Note, NoteListItem } from '../../preload';

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
  'notes/fetchNote',
  async (noteId?: string) => {
    return await window.modux.getNote(noteId);
  }
);

export const fetchAllNotes = createAsyncThunk(
  'notes/fetchAllNotes',
  async () => {
    return await window.modux.getAllNotes();
  }
);

const notesSlice = createSlice({
  name: 'notes',
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
        state.currentNote = action.payload;
      })
      .addCase(fetchNote.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch note';
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
        state.error = action.error.message || 'Failed to fetch notes list';
      });
  },
});

export const { setCurrentNote, clearError } = notesSlice.actions;
export default notesSlice.reducer;
