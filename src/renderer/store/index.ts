import { nodexDelegatingProxy } from "../../shared/nodex-host-access";
import { configureStore } from "@reduxjs/toolkit";
import { createNodexPlatformDeps } from "@nodex/platform";
import {
  initHeadlessWebApiBaseFromUrlAndStorage,
  installNodexWebShimIfNeeded,
} from "../nodex-web-shim";
import cloudAuthReducer from "./cloudAuthSlice";
import cloudNotesReducer from "./cloudNotesSlice";
import { cloudNotesRxListener } from "./cloudNotesRxListener";
import notesReducer from "./notesSlice";
import pluginUiReducer from "./pluginUiSlice";

/**
 * Next / browser: other modules may import `store` before any client entry runs; `createNodexPlatformDeps`
 * needs `nodexDelegatingProxy` / `window.Nodex`. Electron preload sets `Nodex` first; `installNodexWebShimIfNeeded` is a no-op then.
 */
if (typeof window !== "undefined") {
  try {
    initHeadlessWebApiBaseFromUrlAndStorage();
  } catch {
    /* ignore */
  }
  installNodexWebShimIfNeeded();
}

/** Single instance: Redux thunks and optional desktop sync nudge share this. */
export const platformDeps = createNodexPlatformDeps({ notes: nodexDelegatingProxy });

export const store = configureStore({
  reducer: {
    notes: notesReducer,
    pluginUi: pluginUiReducer,
    cloudNotes: cloudNotesReducer,
    cloudAuth: cloudAuthReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      thunk: { extraArgument: platformDeps },
    }).prepend(cloudNotesRxListener.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
