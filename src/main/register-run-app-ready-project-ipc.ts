import { ipcMain, shell } from "electron";
import * as path from "path";
import { readAppPrefs, writeAppPrefs } from "../core/app-prefs";
import {
  activateProject,
  activateWorkspace,
  closeWorkspace,
} from "../core/project-session";
import { clearNodexUndoRedo } from "../core/nodex-undo";
import { setSeedSampleNotesPreference } from "../core/notes-store";
import { registry } from "../core/registry";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import { ctx } from "./main-context";
import {
  applyWorkspaceActivateResult,
  broadcastProjectRootChanged,
  showOpenDialogWithParent,
} from "./main-helpers";

export function registerRunAppReadyProjectIpc(userDataPath: string): void {
  ipcMain.handle(IPC_CHANNELS.PROJECT_GET_STATE, () => ({
    rootPath: ctx.projectRootPath,
    notesDbPath: ctx.notesPersistencePath,
    workspaceRoots: [...ctx.workspaceRoots],
  }));

  ipcMain.handle(IPC_CHANNELS.APP_GET_PREFS, () => readAppPrefs(userDataPath));

  ipcMain.handle(
    IPC_CHANNELS.APP_SET_SEED_SAMPLE_NOTES,
    (_e, enabled: unknown) => {
      if (typeof enabled !== "boolean") {
        return { ok: false as const, error: "Invalid value" };
      }
      const next = writeAppPrefs(userDataPath, { seedSampleNotes: enabled });
      setSeedSampleNotesPreference(next.seedSampleNotes);
      return { ok: true as const, seedSampleNotes: next.seedSampleNotes };
    },
  );

  ipcMain.handle(IPC_CHANNELS.PROJECT_SELECT_FOLDER, async () => {
    const r = await showOpenDialogWithParent({
      properties: ["openDirectory", "createDirectory"],
      title: "Open Nodex project folder",
    });
    if (r.canceled || r.filePaths.length === 0) {
      return { ok: false as const, cancelled: true as const };
    }
    const chosen = r.filePaths[0]!;
    const res = activateProject(
      chosen,
      userDataPath,
      registry.getRegisteredTypes(),
    );
    if (!res.ok) {
      return { ok: false as const, error: res.error };
    }
    applyWorkspaceActivateResult(res);
    clearNodexUndoRedo();
    broadcastProjectRootChanged();
    return {
      ok: true as const,
      rootPath: ctx.projectRootPath,
      workspaceRoots: [...ctx.workspaceRoots],
    };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_ADD_WORKSPACE_FOLDER, async () => {
    if (!ctx.projectRootPath || ctx.workspaceRoots.length === 0) {
      return {
        ok: false as const,
        error: "Open a project folder first (Notes → Open project).",
      };
    }
    const r = await showOpenDialogWithParent({
      properties: ["openDirectory", "createDirectory"],
      title: "Add another project folder to the workspace",
    });
    if (r.canceled || r.filePaths.length === 0) {
      return { ok: false as const, cancelled: true as const };
    }
    const chosen = path.resolve(r.filePaths[0]!);
    if (ctx.workspaceRoots.includes(chosen)) {
      return {
        ok: false as const,
        error: "That folder is already in the workspace.",
      };
    }
    const next = [...ctx.workspaceRoots, chosen];
    const res = activateWorkspace(next, userDataPath, registry.getRegisteredTypes());
    if (!res.ok) {
      return { ok: false as const, error: res.error };
    }
    applyWorkspaceActivateResult(res);
    broadcastProjectRootChanged();
    return {
      ok: true as const,
      rootPath: ctx.projectRootPath,
      workspaceRoots: [...ctx.workspaceRoots],
    };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_OPEN_PATH, async (_e, absPath: unknown) => {
    if (typeof absPath !== "string" || absPath.length === 0) {
      return { ok: false as const, error: "Invalid path" };
    }
    const res = activateProject(
      absPath,
      userDataPath,
      registry.getRegisteredTypes(),
    );
    if (!res.ok) {
      return { ok: false as const, error: res.error };
    }
    applyWorkspaceActivateResult(res);
    clearNodexUndoRedo();
    broadcastProjectRootChanged();
    return {
      ok: true as const,
      rootPath: ctx.projectRootPath,
      workspaceRoots: [...ctx.workspaceRoots],
    };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_REVEAL_FOLDER, async (_e, folderPath: unknown) => {
    if (typeof folderPath !== "string" || folderPath.length === 0) {
      return { ok: false as const, error: "Invalid path" };
    }
    const abs = path.resolve(folderPath);
    const allowed = ctx.workspaceRoots.some((r) => path.resolve(r) === abs);
    if (!allowed) {
      return {
        ok: false as const,
        error: "Path is not an open project folder",
      };
    }
    const err = await shell.openPath(abs);
    if (err) {
      return { ok: false as const, error: err };
    }
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_REFRESH_WORKSPACE, () => {
    if (ctx.workspaceRoots.length === 0) {
      return { ok: false as const, error: "No workspace open" };
    }
    const res = activateWorkspace(
      [...ctx.workspaceRoots],
      userDataPath,
      registry.getRegisteredTypes(),
    );
    if (!res.ok) {
      return { ok: false as const, error: res.error };
    }
    applyWorkspaceActivateResult(res);
    clearNodexUndoRedo();
    broadcastProjectRootChanged();
    return {
      ok: true as const,
      rootPath: ctx.projectRootPath,
      workspaceRoots: [...ctx.workspaceRoots],
    };
  });

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_REMOVE_WORKSPACE_ROOT,
    async (_e, payload: unknown) => {
      if (!payload || typeof payload !== "object") {
        return { ok: false as const, error: "Invalid payload" };
      }
      const raw = payload as {
        projectRootAbs?: unknown;
        moveToTrash?: unknown;
      };
      if (
        typeof raw.projectRootAbs !== "string" ||
        raw.projectRootAbs.trim().length === 0
      ) {
        return { ok: false as const, error: "Invalid path" };
      }
      const abs = path.resolve(raw.projectRootAbs.trim());
      const moveToTrash = raw.moveToTrash === true;
      const idx = ctx.workspaceRoots.findIndex(
        (r) => path.resolve(r) === abs,
      );
      if (idx < 0) {
        return {
          ok: false as const,
          error: "That folder is not in the workspace",
        };
      }
      const next = ctx.workspaceRoots.filter((_, i) => i !== idx);
      const res =
        next.length === 0
          ? closeWorkspace(userDataPath)
          : activateWorkspace(
              next,
              userDataPath,
              registry.getRegisteredTypes(),
            );
      if (!res.ok) {
        return { ok: false as const, error: res.error };
      }
      applyWorkspaceActivateResult(res);
      clearNodexUndoRedo();
      broadcastProjectRootChanged();
      let trashError: string | undefined;
      if (moveToTrash) {
        try {
          await shell.trashItem(abs);
        } catch (e) {
          trashError = e instanceof Error ? e.message : String(e);
        }
      }
      return {
        ok: true as const,
        rootPath: ctx.projectRootPath,
        workspaceRoots: [...ctx.workspaceRoots],
        trashError,
      };
    },
  );
}
