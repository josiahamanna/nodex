export type {
  CreateNoteRelation,
  DesktopHost,
  LocalStore,
  NodexPlatformDeps,
  NodexPlatformProfile,
  Note,
  NoteListItem,
  NoteMovePlacement,
  NotesPersistencePort,
  PasteSubtreePayload,
  RemoteApi,
} from "./ports";
export type { SyncDocument, SyncPullResponse, SyncPushResponse } from "./sync-types";
export {
  createElectronDesktopHost,
  createElectronOfflineFirstLocalStore,
  createNoopDesktopHost,
  createNodexPlatformDeps,
  createStubRemoteApi,
  createWebThinLocalStore,
} from "./implementations";
export { createFetchRemoteApi } from "./remote-fetch";
export {
  createSyncBaseUrlResolver,
  normalizeSyncApiBaseUrl,
} from "./resolve-sync-base";
export { withSyncRetry } from "./sync-retry";
export {
  NODEX_POST_AUTH_REDIRECT_KEY,
  NODEX_SYNC_ACCESS_TOKEN_KEY,
  NODEX_SYNC_REFRESH_TOKEN_KEY,
} from "./sync-auth-storage-keys";
