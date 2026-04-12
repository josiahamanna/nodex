/**
 * ADR-016 P2: when `NODEX_LOCAL_RXDB_WPN` is on, prefer WPN reads from the local RxDB mirror
 * (fed by main debounced push + pull on project-root changes). Writes still use IPC + JSON persist.
 */
import { getWpnOwnerId } from "../../core/wpn/wpn-owner";
import type { NodexRendererApi } from "../../shared/nodex-renderer-api";
import { isLocalRxdbWpnMirrorEnabled } from "./flags";
import {
  tryWpnGetExplorerStateFromLocalRxdb,
  tryWpnGetNoteFromLocalRxdb,
  tryWpnListAllNotesWithContextFromLocalRxdb,
  tryWpnListBacklinksFromLocalRxdb,
  tryWpnListNotesFromLocalRxdb,
  tryWpnListProjectsFromLocalRxdb,
  tryWpnListWorkspacesFromLocalRxdb,
} from "./wpn-local-rxdb-mirror";
import { getOpenWorkspaceWpnRxDb } from "./workspace-wpn-rxdb";

export function createElectronWorkspaceRxdbNodexOverlay(base: NodexRendererApi): NodexRendererApi {
  if (!isLocalRxdbWpnMirrorEnabled()) {
    return base;
  }
  const ownerId = getWpnOwnerId();
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === "then") {
        return undefined;
      }
      const db = getOpenWorkspaceWpnRxDb();
      if (prop === "wpnListWorkspaces") {
        return async () => {
          const local = db ? await tryWpnListWorkspacesFromLocalRxdb(db, ownerId) : null;
          if (local) {
            return { workspaces: local };
          }
          return Reflect.get(target, prop, receiver).bind(target)();
        };
      }
      if (prop === "wpnListProjects") {
        return async (workspaceId: string) => {
          const local = db ? await tryWpnListProjectsFromLocalRxdb(db, workspaceId) : null;
          if (local) {
            return { projects: local };
          }
          return Reflect.get(target, prop, receiver).bind(target)(workspaceId);
        };
      }
      if (prop === "wpnListNotes") {
        return async (projectId: string) => {
          const local = db ? await tryWpnListNotesFromLocalRxdb(db, projectId) : null;
          if (local) {
            return { notes: local };
          }
          return Reflect.get(target, prop, receiver).bind(target)(projectId);
        };
      }
      if (prop === "wpnGetNote") {
        return async (noteId: string) => {
          const local = db ? await tryWpnGetNoteFromLocalRxdb(db, noteId) : null;
          if (local) {
            return { note: local };
          }
          return Reflect.get(target, prop, receiver).bind(target)(noteId);
        };
      }
      if (prop === "wpnGetExplorerState") {
        return async (projectId: string) => {
          const local = db ? await tryWpnGetExplorerStateFromLocalRxdb(db, projectId) : null;
          if (local) {
            return { expanded_ids: local };
          }
          return Reflect.get(target, prop, receiver).bind(target)(projectId);
        };
      }
      if (prop === "wpnListAllNotesWithContext") {
        return async () => {
          const local = db ? await tryWpnListAllNotesWithContextFromLocalRxdb(db) : null;
          if (local) {
            return { notes: local };
          }
          return Reflect.get(target, prop, receiver).bind(target)();
        };
      }
      if (prop === "wpnListBacklinksToNote") {
        return async (targetNoteId: string) => {
          const local = db ? await tryWpnListBacklinksFromLocalRxdb(db, targetNoteId) : null;
          if (local) {
            return { sources: local };
          }
          return Reflect.get(target, prop, receiver).bind(target)(targetNoteId);
        };
      }
      const v = Reflect.get(target, prop, target);
      if (typeof v === "function") {
        return v.bind(target);
      }
      return v;
    },
  }) as NodexRendererApi;
}
