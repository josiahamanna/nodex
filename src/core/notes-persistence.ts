import * as fs from "fs";
import {
  ensureNotesSeeded,
  getNotesFlat,
  importSerializedState,
  mergeMultipleRootsIfNeeded,
  resetNotesStore,
} from "./notes-store";
import {
  closeNotesSqlite,
  countNotesInDb,
  getNotesDatabase,
  initNotesSqlite,
  loadFromDatabase,
  saveToDatabase,
} from "./notes-sqlite";

export type NotesLoadResult = "ok" | "missing" | "invalid";

/** Load notes from legacy `notes-tree.json` into memory (migration only). */
export function loadNotesStateFromJsonFile(filePath: string): NotesLoadResult {
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

export function saveNotesState(): void {
  const db = getNotesDatabase();
  if (!db) {
    throw new Error("Notes database not initialized");
  }
  saveToDatabase(db);
}

/**
 * Open SQLite, migrate from legacy JSON if DB empty, seed if still empty.
 * `dbPath` = e.g. userData/data/nodex.sqlite; `legacyJsonPath` = userData/notes-tree.json
 */
export function bootstrapNotesTree(
  dbPath: string,
  legacyJsonPath: string,
  registeredTypes: string[],
): void {
  const db = initNotesSqlite(dbPath);

  if (countNotesInDb(db) === 0 && fs.existsSync(legacyJsonPath)) {
    resetNotesStore();
    const migrated = loadNotesStateFromJsonFile(legacyJsonPath);
    if (migrated === "ok" && getNotesFlat().length > 0) {
      saveToDatabase(db);
      try {
        fs.renameSync(legacyJsonPath, `${legacyJsonPath}.migrated.bak`);
      } catch {
        /* non-fatal */
      }
    }
  }

  resetNotesStore();

  if (countNotesInDb(db) === 0) {
    ensureNotesSeeded(registeredTypes);
    saveToDatabase(db);
    return;
  }

  if (!loadFromDatabase(db)) {
    resetNotesStore();
    ensureNotesSeeded(registeredTypes);
    saveToDatabase(db);
    return;
  }

  mergeMultipleRootsIfNeeded();

  if (getNotesFlat().length === 0 && registeredTypes.length > 0) {
    resetNotesStore();
    ensureNotesSeeded(registeredTypes);
    saveToDatabase(db);
  }
}

export { closeNotesSqlite };
