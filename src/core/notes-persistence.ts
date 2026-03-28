import * as fs from "fs";
import * as path from "path";
import {
  ensureNotesSeeded,
  exportSerializedState,
  getTreeRootId,
  importSerializedState,
  mergeMultipleRootsIfNeeded,
  resetNotesStore,
} from "./notes-store";

export type NotesLoadResult = "ok" | "missing" | "invalid";

export function loadNotesState(filePath: string): NotesLoadResult {
  if (!fs.existsSync(filePath)) {
    return "missing";
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const ok = importSerializedState(JSON.parse(raw) as unknown);
    if (!ok) {
      return "invalid";
    }
    mergeMultipleRootsIfNeeded();
    return "ok";
  } catch {
    return "invalid";
  }
}

export function saveNotesState(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(exportSerializedState()), "utf8");
}

export function bootstrapNotesTree(
  filePath: string,
  registeredTypes: string[],
): void {
  const loaded = loadNotesState(filePath);
  if (loaded !== "ok") {
    if (loaded === "invalid") {
      resetNotesStore();
    }
    ensureNotesSeeded(registeredTypes);
    saveNotesState(filePath);
    return;
  }
  if (!getTreeRootId() && registeredTypes.length > 0) {
    resetNotesStore();
    ensureNotesSeeded(registeredTypes);
    saveNotesState(filePath);
  }
}
