import * as fs from "fs";
import * as path from "path";
import {
  ensureNotesSeeded,
  getNotesFlat,
  importSerializedState,
  mergeAttachedSerializedIntoStore,
  mergeMultipleRootsIfNeeded,
  resetNotesStore,
  seedAttachedWorkspaceIfEmpty,
} from "./notes-store";
import { seedBundledDocumentationNotesFromDir } from "./bundled-docs-seed";
import {
  closeNotesSqlite,
  countNotesInDb,
  getHomeWelcomeMarkdown,
  getNotesDatabase,
  initWorkspaceNotesDatabase,
  loadFromDatabase,
  readSerializedFromAlias,
  saveWorkspaceToDatabases,
} from "./notes-sqlite";

function trySeedBundledDocsAndSave(db: ReturnType<typeof getNotesDatabase>): void {
  if (!db) {
    return;
  }
  try {
    if (seedBundledDocumentationNotesFromDir()) {
      saveWorkspaceToDatabases(db);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[Nodex] bundled documentation seed failed:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

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
  saveWorkspaceToDatabases(db);
}

/**
 * Load primary + attached project DBs into memory. `legacyJsonPath` is for the first root only.
 */
export function bootstrapWorkspaceNotes(
  roots: string[],
  legacyJsonPath: string,
  registeredTypes: string[],
): void {
  for (const r of roots) {
    const root = path.resolve(r);
    fs.mkdirSync(path.join(root, "data"), { recursive: true });
    fs.mkdirSync(path.join(root, "assets"), { recursive: true });
  }

  const db = initWorkspaceNotesDatabase(roots);

  if (countNotesInDb(db) === 0 && fs.existsSync(legacyJsonPath)) {
    resetNotesStore();
    const migrated = loadNotesStateFromJsonFile(legacyJsonPath);
    if (migrated === "ok" && getNotesFlat().length > 0) {
      saveWorkspaceToDatabases(db);
      try {
        fs.renameSync(legacyJsonPath, `${legacyJsonPath}.migrated.bak`);
      } catch {
        /* non-fatal */
      }
    }
  }

  resetNotesStore();

  const mainEmpty = countNotesInDb(db) === 0;
  let allAttachedEmpty = true;
  for (let i = 1; i < roots.length; i++) {
    const st = readSerializedFromAlias(db, `ext${i}`);
    if (st.records.length > 0) {
      allAttachedEmpty = false;
    }
  }

  if (mainEmpty && allAttachedEmpty) {
    ensureNotesSeeded(registeredTypes, {
      homeMarkdown: getHomeWelcomeMarkdown(db),
    });
    mergeMultipleRootsIfNeeded();
    saveWorkspaceToDatabases(db);
    trySeedBundledDocsAndSave(db);
    return;
  }

  if (!loadFromDatabase(db)) {
    resetNotesStore();
    ensureNotesSeeded(registeredTypes, {
      homeMarkdown: getHomeWelcomeMarkdown(db),
    });
    mergeMultipleRootsIfNeeded();
    saveWorkspaceToDatabases(db);
    trySeedBundledDocsAndSave(db);
    return;
  }

  mergeMultipleRootsIfNeeded();

  for (let i = 1; i < roots.length; i++) {
    const data = readSerializedFromAlias(db, `ext${i}`);
    mergeAttachedSerializedIntoStore(i, roots[i]!, data, registeredTypes);
    // Always attempt seed: seedAttachedWorkspaceIfEmpty no-ops if mount already has children
    // (avoids skipping when SQLite has stray rows but the tree under the mount is empty).
    seedAttachedWorkspaceIfEmpty(i, registeredTypes);
  }
  mergeMultipleRootsIfNeeded();

  if (roots.length > 1) {
    saveWorkspaceToDatabases(db);
  }

  if (getNotesFlat().length === 0 && registeredTypes.length > 0) {
    resetNotesStore();
    ensureNotesSeeded(registeredTypes, {
      homeMarkdown: getHomeWelcomeMarkdown(db),
    });
    mergeMultipleRootsIfNeeded();
    saveWorkspaceToDatabases(db);
    trySeedBundledDocsAndSave(db);
    return;
  }

  mergeMultipleRootsIfNeeded();
  trySeedBundledDocsAndSave(db);
}

/**
 * Open SQLite, migrate from legacy JSON if DB empty, seed if still empty.
 * `dbPath` = e.g. project/data/nodex.sqlite; `legacyJsonPath` = project/data/notes-tree.json
 */
export function bootstrapNotesTree(
  dbPath: string,
  legacyJsonPath: string,
  registeredTypes: string[],
): void {
  const root = path.dirname(path.dirname(path.resolve(dbPath)));
  bootstrapWorkspaceNotes([root], legacyJsonPath, registeredTypes);
}

export { closeNotesSqlite };
