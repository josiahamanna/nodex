import { configureStore } from "@reduxjs/toolkit";
import notesReducer from "./notesSlice";
import pluginUiReducer from "./pluginUiSlice";

export const store = configureStore({
  reducer: {
    notes: notesReducer,
    pluginUi: pluginUiReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
