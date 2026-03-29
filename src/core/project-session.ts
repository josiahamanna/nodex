import * as fs from "fs";
import * as path from "path";
import { getNodexDatabasePath } from "./nodex-paths";
import { bootstrapNotesTree, closeNotesSqlite } from "./notes-persistence";
import { resetNotesStore } from "./notes-store";

const PREFS_FILE = "nodex-project-prefs.json";

export type ProjectPrefs = {
  lastProjectRoot: string | null;
};

export function readProjectPrefs(userDataPath: string): ProjectPrefs {
  const p = path.join(userDataPath, PREFS_FILE);
  if (!fs.existsSync(p)) {
    return { lastProjectRoot: null };
  }
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<ProjectPrefs>;
    if (j.lastProjectRoot != null && typeof j.lastProjectRoot !== "string") {
      return { lastProjectRoot: null };
    }
    return {
      lastProjectRoot:
        typeof j.lastProjectRoot === "string" ? j.lastProjectRoot : null,
    };
  } catch {
    return { lastProjectRoot: null };
  }
}

export function writeProjectPrefs(
  userDataPath: string,
  prefs: ProjectPrefs,
): void {
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(
    path.join(userDataPath, PREFS_FILE),
    JSON.stringify(prefs, null, 2),
    "utf8",
  );
}

/** `projectRoot/data/nodex.sqlite` */
export function getProjectNotesDbPath(projectRoot: string): string {
  return path.resolve(projectRoot, "data", "nodex.sqlite");
}

/** `projectRoot/data/notes-tree.json` (legacy JSON migration target inside project). */
export function getProjectLegacyNotesJsonPath(projectRoot: string): string {
  return path.join(projectRoot, "data", "notes-tree.json");
}

/** `projectRoot/assets` */
export function getProjectAssetsDir(projectRoot: string): string {
  return path.resolve(projectRoot, "assets");
}

export function ensureProjectDirectories(projectRoot: string): void {
  const root = path.resolve(projectRoot);
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.mkdirSync(path.join(root, "assets"), { recursive: true });
}

/**
 * If the project has no DB yet but userData has a legacy SQLite file, copy it once.
 */
export function migrateLegacyUserDataDbIfNeeded(
  projectRoot: string,
  userDataPath: string,
): void {
  const dest = getProjectNotesDbPath(projectRoot);
  if (fs.existsSync(dest)) {
    return;
  }
  const legacy = getNodexDatabasePath(userDataPath);
  if (!fs.existsSync(legacy)) {
    return;
  }
  try {
    const st = fs.statSync(legacy);
    if (st.size === 0) {
      return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(legacy, dest);
    try {
      fs.renameSync(legacy, `${legacy}.migrated-to-project.bak`);
    } catch {
      /* non-fatal */
    }
  } catch (e) {
    console.warn("[Project] Legacy DB migration failed:", e);
  }
}

export type ActivateProjectResult =
  | { ok: true; root: string; dbPath: string }
  | { ok: false; error: string };

/**
 * Close current notes DB, reset store, apply new project root, bootstrap SQLite, persist prefs.
 */
export function activateProject(
  projectRootAbs: string,
  userDataPath: string,
  registeredTypes: string[],
): ActivateProjectResult {
  const root = path.resolve(projectRootAbs);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return { ok: false, error: "Not a valid directory" };
  }
  ensureProjectDirectories(root);
  migrateLegacyUserDataDbIfNeeded(root, userDataPath);
  try {
    closeNotesSqlite();
  } catch {
    /* ignore */
  }
  resetNotesStore();
  const dbPath = getProjectNotesDbPath(root);
  const legacyJson = getProjectLegacyNotesJsonPath(root);
  bootstrapNotesTree(dbPath, legacyJson, registeredTypes);
  writeProjectPrefs(userDataPath, { lastProjectRoot: root });
  return { ok: true, root, dbPath };
}

export function deactivateProject(): void {
  try {
    closeNotesSqlite();
  } catch {
    /* ignore */
  }
  resetNotesStore();
}
