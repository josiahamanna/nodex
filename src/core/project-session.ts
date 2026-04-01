import * as fs from "fs";
import * as path from "path";
import { getNodexDatabasePath } from "./nodex-paths";
import { bootstrapWorkspaceNotes, closeNotesSqlite } from "./notes-persistence";
import { resetNotesStore } from "./notes-store";

const PREFS_FILE = "nodex-project-prefs.json";

export type ProjectPrefs = {
  lastProjectRoot: string | null;
  /** All open project folders (first = primary: notes DB anchor + assets). */
  workspaceRoots?: string[];
  /** Optional display names in the sidebar (keys = resolved absolute paths). */
  workspaceLabels?: Record<string, string>;
  /** Shell-only workbench layout/visibility (renderer-owned schema). */
  shellLayout?: unknown;
};

/** Drop labels for paths no longer in the workspace; normalize keys. */
export function pruneWorkspaceLabels(
  labels: Record<string, string> | undefined,
  roots: string[],
): Record<string, string> | undefined {
  if (!labels || Object.keys(labels).length === 0) {
    return undefined;
  }
  const rootSet = new Set(roots.map((r) => path.resolve(String(r).trim())));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(labels)) {
    const rk = path.resolve(String(k).trim());
    if (rootSet.has(rk) && typeof v === "string" && v.trim().length > 0) {
      out[rk] = v.trim();
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Keep workspace order; drop paths that are missing or not directories. */
export function filterExistingWorkspaceRoots(roots: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of roots) {
    const r = path.resolve(String(p).trim());
    if (!r || seen.has(r)) {
      continue;
    }
    try {
      if (fs.existsSync(r) && fs.statSync(r).isDirectory()) {
        seen.add(r);
        out.push(r);
      }
    } catch {
      /* skip invalid paths */
    }
  }
  return out;
}

export function getNormalizedWorkspaceRoots(prefs: ProjectPrefs): string[] {
  const raw =
    Array.isArray(prefs.workspaceRoots) && prefs.workspaceRoots.length > 0
      ? prefs.workspaceRoots
      : prefs.lastProjectRoot
        ? [prefs.lastProjectRoot]
        : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of raw) {
    if (typeof p !== "string" || !p.trim()) {
      continue;
    }
    const r = path.resolve(p.trim());
    if (seen.has(r)) {
      continue;
    }
    seen.add(r);
    out.push(r);
  }
  return out;
}

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
    let workspaceRoots: string[] | undefined;
    if (Array.isArray(j.workspaceRoots)) {
      workspaceRoots = j.workspaceRoots.filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      );
      if (workspaceRoots.length === 0) {
        workspaceRoots = undefined;
      }
    }
    let workspaceLabels: Record<string, string> | undefined;
    if (
      j.workspaceLabels &&
      typeof j.workspaceLabels === "object" &&
      !Array.isArray(j.workspaceLabels)
    ) {
      const wl: Record<string, string> = {};
      for (const [k, v] of Object.entries(
        j.workspaceLabels as Record<string, unknown>,
      )) {
        if (
          typeof k === "string" &&
          k.trim().length > 0 &&
          typeof v === "string" &&
          v.trim().length > 0
        ) {
          wl[path.resolve(k.trim())] = v.trim();
        }
      }
      if (Object.keys(wl).length > 0) {
        workspaceLabels = wl;
      }
    }
    return {
      lastProjectRoot:
        typeof j.lastProjectRoot === "string" ? j.lastProjectRoot : null,
      workspaceRoots,
      workspaceLabels,
      shellLayout: j.shellLayout,
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
  | { ok: true; root: string; dbPath: string; workspaceRoots: string[] }
  | { ok: false; error: string };

/**
 * Close current notes DB, reset store, open multiple project folders (merged tree), persist prefs.
 */
export function activateWorkspace(
  rootsInput: string[],
  userDataPath: string,
  registeredTypes: string[],
): ActivateProjectResult {
  const roots = [
    ...new Set(
      rootsInput
        .map((p) => path.resolve(String(p).trim()))
        .filter((p) => p.length > 0),
    ),
  ];
  if (roots.length === 0) {
    return { ok: false, error: "No folders selected" };
  }
  const existing = filterExistingWorkspaceRoots(roots);
  if (existing.length === 0) {
    try {
      closeNotesSqlite();
    } catch {
      /* ignore */
    }
    resetNotesStore();
    writeProjectPrefs(userDataPath, {
      lastProjectRoot: null,
      workspaceRoots: undefined,
    });
    return { ok: true, root: "", dbPath: "", workspaceRoots: [] };
  }
  const rootsResolved = existing;
  ensureProjectDirectories(rootsResolved[0]!);
  migrateLegacyUserDataDbIfNeeded(rootsResolved[0]!, userDataPath);
  try {
    closeNotesSqlite();
  } catch {
    /* ignore */
  }
  resetNotesStore();
  const dbPath = getProjectNotesDbPath(rootsResolved[0]!);
  const legacyJson = getProjectLegacyNotesJsonPath(rootsResolved[0]!);
  bootstrapWorkspaceNotes(rootsResolved, legacyJson, registeredTypes);
  const prevPrefs = readProjectPrefs(userDataPath);
  writeProjectPrefs(userDataPath, {
    lastProjectRoot: rootsResolved[0]!,
    workspaceRoots: rootsResolved,
    workspaceLabels: pruneWorkspaceLabels(
      prevPrefs.workspaceLabels,
      rootsResolved,
    ),
  });
  return {
    ok: true,
    root: rootsResolved[0]!,
    dbPath,
    workspaceRoots: rootsResolved,
  };
}

export function setWorkspaceFolderLabel(
  userDataPath: string,
  rootPath: string,
  label: string | null,
):
  | { ok: true; workspaceLabels: Record<string, string> }
  | { ok: false; error: string } {
  const prefs = readProjectPrefs(userDataPath);
  const roots = getNormalizedWorkspaceRoots(prefs);
  const norm = path.resolve(String(rootPath).trim());
  if (!roots.some((r) => path.resolve(r) === norm)) {
    return { ok: false, error: "Path is not in the workspace" };
  }
  const nextLabels: Record<string, string> = {
    ...(prefs.workspaceLabels ?? {}),
  };
  if (label == null || label.trim() === "") {
    delete nextLabels[norm];
  } else {
    nextLabels[norm] = label.trim();
  }
  const pruned = pruneWorkspaceLabels(nextLabels, roots) ?? {};
  writeProjectPrefs(userDataPath, {
    lastProjectRoot: prefs.lastProjectRoot,
    workspaceRoots: prefs.workspaceRoots,
    workspaceLabels: Object.keys(pruned).length > 0 ? pruned : undefined,
  });
  return { ok: true, workspaceLabels: pruned };
}

/** Replace workspace with a single folder. */
export function activateProject(
  projectRootAbs: string,
  userDataPath: string,
  registeredTypes: string[],
): ActivateProjectResult {
  return activateWorkspace([projectRootAbs], userDataPath, registeredTypes);
}

export function deactivateProject(): void {
  try {
    closeNotesSqlite();
  } catch {
    /* ignore */
  }
  resetNotesStore();
}

/** Close DB, clear in-memory notes, clear saved workspace prefs (no folders open). */
export function closeWorkspace(userDataPath: string): ActivateProjectResult {
  try {
    closeNotesSqlite();
  } catch {
    /* ignore */
  }
  resetNotesStore();
  writeProjectPrefs(userDataPath, {
    lastProjectRoot: null,
    workspaceRoots: undefined,
  });
  return { ok: true, root: "", dbPath: "", workspaceRoots: [] };
}
