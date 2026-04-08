import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { NodexPlatformDeps } from "@nodex/platform";
import { closeCloudNotesDb } from "../cloud-sync/cloud-notes-rxdb";
import {
  readCloudSyncEmail,
  readCloudSyncRefreshToken,
  readCloudSyncToken,
  writeCloudSyncEmail,
  writeCloudSyncRefreshToken,
  writeCloudSyncToken,
} from "../cloud-sync/cloud-sync-storage";
import {
  hydrateCloudNotesFromRxDbThunk,
  resetCloudNotes,
  runCloudSyncThunk,
} from "./cloudNotesSlice";

type CloudAuthThunkExtra = { extra: NodexPlatformDeps };

async function migrateWebScratchCloudNotesIfNeeded(realUserId: string): Promise<void> {
  if (typeof window === "undefined") return;
  const { isWebScratchSession } = await import("../auth/web-scratch");
  if (!isWebScratchSession()) return;
  const { migrateWebScratchCloudNotesToUser } = await import(
    "../cloud-sync/migrate-web-scratch-cloud-notes",
  );
  await migrateWebScratchCloudNotesToUser(realUserId);
}

export type CloudAuthState = {
  status: "signedOut" | "signedIn";
  userId: string | null;
  email: string | null;
  error: string | null;
  busy: boolean;
};

const initialState: CloudAuthState = {
  status: "signedOut",
  userId: null,
  email: null,
  error: null,
  busy: false,
};

const cloudAuthSlice = createSlice({
  name: "cloudAuth",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(cloudRestoreSessionThunk.pending, (state) => {
        state.busy = true;
        state.error = null;
      })
      .addCase(cloudRestoreSessionThunk.fulfilled, (state, action) => {
        state.busy = false;
        if (action.payload) {
          state.status = "signedIn";
          state.userId = action.payload.userId;
          state.email = action.payload.email;
        } else {
          state.status = "signedOut";
          state.userId = null;
          state.email = null;
        }
      })
      .addCase(cloudRestoreSessionThunk.rejected, (state) => {
        state.busy = false;
        state.status = "signedOut";
        state.userId = null;
        state.email = null;
      })
      .addCase(cloudLoginThunk.pending, (state) => {
        state.busy = true;
        state.error = null;
      })
      .addCase(cloudLoginThunk.fulfilled, (state, action) => {
        state.busy = false;
        state.status = "signedIn";
        state.userId = action.payload.userId;
        state.email = action.payload.email;
      })
      .addCase(cloudLoginThunk.rejected, (state, action) => {
        state.busy = false;
        state.error = action.error.message ?? "Login failed";
      })
      .addCase(cloudRegisterThunk.pending, (state) => {
        state.busy = true;
        state.error = null;
      })
      .addCase(cloudRegisterThunk.fulfilled, (state, action) => {
        state.busy = false;
        state.status = "signedIn";
        state.userId = action.payload.userId;
        state.email = action.payload.email;
      })
      .addCase(cloudRegisterThunk.rejected, (state, action) => {
        state.busy = false;
        state.error = action.error.message ?? "Register failed";
      })
      .addCase(cloudLogoutThunk.fulfilled, () => initialState);
  },
});

export const cloudRestoreSessionThunk = createAsyncThunk<
  { userId: string; email: string } | null,
  void,
  CloudAuthThunkExtra
>("cloudAuth/restore", async (_, { extra, dispatch }) => {
  if (!extra.remoteApi.getBaseUrl()) {
    return null;
  }
  const token = readCloudSyncToken();
  if (!token) {
    extra.remoteApi.setAuthToken(null);
    extra.remoteApi.setRefreshToken(null);
    return null;
  }
  extra.remoteApi.setAuthToken(token);
  extra.remoteApi.setRefreshToken(readCloudSyncRefreshToken());
  try {
    const me = await extra.remoteApi.authMe();
    const email = me.email || readCloudSyncEmail();
    if (email) {
      writeCloudSyncEmail(email);
    }
    await migrateWebScratchCloudNotesIfNeeded(me.userId);
    await dispatch(
      hydrateCloudNotesFromRxDbThunk({ overrideStorageUserId: me.userId }),
    );
    await dispatch(runCloudSyncThunk({ overrideStorageUserId: me.userId }));
    return { userId: me.userId, email: me.email };
  } catch {
    writeCloudSyncToken(null);
    writeCloudSyncRefreshToken(null);
    writeCloudSyncEmail(null);
    extra.remoteApi.setAuthToken(null);
    extra.remoteApi.setRefreshToken(null);
    return null;
  }
});

export const cloudLoginThunk = createAsyncThunk<
  { userId: string; email: string },
  { email: string; password: string },
  CloudAuthThunkExtra
>("cloudAuth/login", async ({ email, password }, { extra, dispatch }) => {
  const { token, refreshToken, userId } = await extra.remoteApi.authLogin(
    email,
    password,
  );
  writeCloudSyncToken(token);
  writeCloudSyncRefreshToken(refreshToken);
  writeCloudSyncEmail(email.toLowerCase());
  extra.remoteApi.setAuthToken(token);
  extra.remoteApi.setRefreshToken(refreshToken);
  await migrateWebScratchCloudNotesIfNeeded(userId);
  await dispatch(
    hydrateCloudNotesFromRxDbThunk({ overrideStorageUserId: userId }),
  );
  await dispatch(runCloudSyncThunk({ overrideStorageUserId: userId }));
  return { userId, email: email.toLowerCase() };
});

export const cloudRegisterThunk = createAsyncThunk<
  { userId: string; email: string },
  { email: string; password: string },
  CloudAuthThunkExtra
>("cloudAuth/register", async ({ email, password }, { extra, dispatch }) => {
  const { token, refreshToken, userId } = await extra.remoteApi.authRegister(
    email,
    password,
  );
  writeCloudSyncToken(token);
  writeCloudSyncRefreshToken(refreshToken);
  writeCloudSyncEmail(email.toLowerCase());
  extra.remoteApi.setAuthToken(token);
  extra.remoteApi.setRefreshToken(refreshToken);
  await migrateWebScratchCloudNotesIfNeeded(userId);
  await dispatch(
    hydrateCloudNotesFromRxDbThunk({ overrideStorageUserId: userId }),
  );
  await dispatch(runCloudSyncThunk({ overrideStorageUserId: userId }));
  return { userId, email: email.toLowerCase() };
});

export const cloudLogoutThunk = createAsyncThunk<void, void, CloudAuthThunkExtra>(
  "cloudAuth/logout",
  async (_, { extra, dispatch }) => {
    await closeCloudNotesDb();
    writeCloudSyncToken(null);
    writeCloudSyncRefreshToken(null);
    writeCloudSyncEmail(null);
    extra.remoteApi.setAuthToken(null);
    extra.remoteApi.setRefreshToken(null);
    dispatch(resetCloudNotes());
  },
);

export default cloudAuthSlice.reducer;
