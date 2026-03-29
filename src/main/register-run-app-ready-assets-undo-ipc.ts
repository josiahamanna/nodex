import { ipcMain, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import {
  listProjectAssets,
  moveProjectAsset,
  resolveAssetFilePath,
} from "../core/assets-fs";
import {
  nodexRedo,
  nodexUndo,
  recordAssetMoveForUndo,
} from "../core/nodex-undo";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import { ctx } from "./main-context";
import {
  assetsRootForIpc,
  parseAssetIpcPayload,
  persistNotes,
} from "./main-helpers";

export function registerRunAppReadyAssetsUndoIpc(): void {
  ipcMain.handle(IPC_CHANNELS.ASSET_LIST, (_e, payload: unknown) => {
    const { rel, projectRoot: prOpt } = parseAssetIpcPayload(payload);
    const root = assetsRootForIpc(prOpt);
    if (!root) {
      return {
        ok: false as const,
        error: prOpt
          ? "Unknown project folder for assets"
          : "No project open",
      };
    }
    return listProjectAssets(root, rel);
  });

  ipcMain.handle(IPC_CHANNELS.ASSET_GET_INFO, (_e, payload: unknown) => {
    const { rel, projectRoot: prOpt } = parseAssetIpcPayload(payload);
    if (typeof rel !== "string" || rel.length === 0) {
      return null;
    }
    const root = assetsRootForIpc(prOpt);
    if (!root) {
      return null;
    }
    const full = resolveAssetFilePath(root, rel);
    if (!full) {
      return null;
    }
    try {
      const st = fs.statSync(full);
      const base = path.basename(full);
      const ext = path.extname(base).slice(1).toLowerCase();
      return {
        name: base,
        ext,
        size: st.size,
        relativePath: rel.replace(/\\/g, "/"),
      };
    } catch {
      return null;
    }
  });

  const MAX_ASSET_TEXT = 2_000_000;
  ipcMain.handle(IPC_CHANNELS.ASSET_READ_TEXT, (_e, payload: unknown) => {
    const { rel, projectRoot: prOpt } = parseAssetIpcPayload(payload);
    if (typeof rel !== "string" || rel.length === 0) {
      return { ok: false as const, error: "Invalid request" };
    }
    const root = assetsRootForIpc(prOpt);
    if (!root) {
      return { ok: false as const, error: "No project open" };
    }
    const full = resolveAssetFilePath(root, rel);
    if (!full) {
      return { ok: false as const, error: "Not found" };
    }
    try {
      const st = fs.statSync(full);
      if (st.size > MAX_ASSET_TEXT) {
        return { ok: false as const, error: "File too large for text preview" };
      }
      const text = fs.readFileSync(full, "utf8");
      return { ok: true as const, text };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ASSET_OPEN_EXTERNAL, async (_e, payload: unknown) => {
    const { rel, projectRoot: prOpt } = parseAssetIpcPayload(payload);
    if (typeof rel !== "string" || rel.length === 0) {
      return { ok: false as const, error: "Invalid request" };
    }
    const root = assetsRootForIpc(prOpt);
    if (!root) {
      return { ok: false as const, error: "No project open" };
    }
    const full = resolveAssetFilePath(root, rel);
    if (!full) {
      return { ok: false as const, error: "Not found" };
    }
    const err = await shell.openPath(full);
    if (err) {
      return { ok: false as const, error: err };
    }
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.ASSET_MOVE, (_e, payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      return { ok: false as const, error: "Invalid payload" };
    }
    const o = payload as Record<string, unknown>;
    const fromProject =
      typeof o.fromProject === "string" ? o.fromProject : "";
    const fromRel = typeof o.fromRel === "string" ? o.fromRel : "";
    const toProject = typeof o.toProject === "string" ? o.toProject : "";
    const toDirRel = typeof o.toDirRel === "string" ? o.toDirRel : "";
    if (!fromProject || !fromRel || !toProject) {
      return { ok: false as const, error: "Invalid paths" };
    }
    const roots = ctx.workspaceRoots.map((w) => path.resolve(w));
    const moved = moveProjectAsset(roots, fromProject, fromRel, toProject, toDirRel);
    if (!moved.ok) {
      return { ok: false as const, error: moved.error };
    }
    recordAssetMoveForUndo({
      fromProject,
      fromRel,
      toProject,
      toRel: moved.toRel,
    });
    return { ok: true as const, toRel: moved.toRel };
  });

  ipcMain.handle(IPC_CHANNELS.NODEX_UNDO, () => {
    if (!ctx.projectRootPath || ctx.workspaceRoots.length === 0) {
      return {
        ok: false as const,
        error: "No workspace open",
        touchedNotes: false,
      };
    }
    const r = nodexUndo(ctx.workspaceRoots.map((w) => path.resolve(w)));
    if (!r.ok) {
      return {
        ok: false as const,
        error: r.error ?? "Undo failed",
        touchedNotes: false,
      };
    }
    if (r.touchedNotes) {
      persistNotes();
    }
    return { ok: true as const, touchedNotes: r.touchedNotes === true };
  });

  ipcMain.handle(IPC_CHANNELS.NODEX_REDO, () => {
    if (!ctx.projectRootPath || ctx.workspaceRoots.length === 0) {
      return {
        ok: false as const,
        error: "No workspace open",
        touchedNotes: false,
      };
    }
    const r = nodexRedo(ctx.workspaceRoots.map((w) => path.resolve(w)));
    if (!r.ok) {
      return {
        ok: false as const,
        error: r.error ?? "Redo failed",
        touchedNotes: false,
      };
    }
    if (r.touchedNotes) {
      persistNotes();
    }
    return { ok: true as const, touchedNotes: r.touchedNotes === true };
  });
}
