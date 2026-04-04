import * as os from "os";
import * as path from "path";
import { clearNodexUndoRedo } from "../core/nodex-undo";
import {
  activateWorkspace,
  readProjectPrefs,
  type ActivateProjectResult,
} from "../core/project-session";
import { registerBuiltinMarkdownNoteRenderer } from "../core/register-builtin-markdown-note-type";
import { registerBuiltinObservableNoteRenderer } from "../core/register-builtin-observable-note-type";
import {
  getHeadlessSessionRegistry,
  loadPersistedHeadlessSessionPlugins,
} from "./headless-marketplace-session";

/** Types passed to `activateWorkspace` / seeding when no Electron plugin registry is loaded. */
const HEADLESS_REGISTERED_TYPES = ["markdown", "text", "root"];

let lastResult: ActivateProjectResult | null = null;
let userDataPath = "";

export function initHeadlessFromEnv(): ActivateProjectResult {
  const raw = process.env.NODEX_PROJECT_ROOT?.trim();
  if (!raw) {
    return { ok: false, error: "Set NODEX_PROJECT_ROOT to an absolute project folder" };
  }
  const projectRoot = path.resolve(raw);
  userDataPath =
    process.env.NODEX_USER_DATA_DIR?.trim() ||
    path.join(os.homedir(), ".nodex-headless-data");
  clearNodexUndoRedo();
  const r = activateWorkspace(
    [projectRoot],
    userDataPath,
    HEADLESS_REGISTERED_TYPES,
  );
  lastResult = r;
  if (r.ok && r.workspaceRoots.length > 0) {
    loadPersistedHeadlessSessionPlugins(userDataPath);
    registerBuiltinObservableNoteRenderer(getHeadlessSessionRegistry());
    registerBuiltinMarkdownNoteRenderer(getHeadlessSessionRegistry());
  }
  if (r.ok && r.workspaceRoots.length === 0) {
    return {
      ok: false,
      error:
        "NODEX_PROJECT_ROOT is missing, not a directory, or could not be opened",
    };
  }
  return r;
}

export function getHeadlessActivateResult(): ActivateProjectResult | null {
  return lastResult;
}

export function getHeadlessUserDataPath(): string {
  return userDataPath;
}

export function getHeadlessProjectStateView(): {
  rootPath: string | null;
  notesDbPath: string | null;
  workspaceRoots: string[];
  workspaceLabels: Record<string, string>;
} {
  const r = lastResult;
  if (!r?.ok || r.workspaceRoots.length === 0) {
    return {
      rootPath: null,
      notesDbPath: null,
      workspaceRoots: [],
      workspaceLabels: {},
    };
  }
  const prefs = readProjectPrefs(userDataPath);
  return {
    rootPath: r.root,
    notesDbPath: r.dbPath,
    workspaceRoots: r.workspaceRoots,
    workspaceLabels: prefs.workspaceLabels ?? {},
  };
}

export function assertProjectOpen(): void {
  const r = lastResult;
  if (!r?.ok || !r.workspaceRoots.length) {
    throw new Error(
      r?.ok === false ? r.error : "No workspace open (headless init failed)",
    );
  }
}

export function headlessWorkspaceRoots(): string[] {
  const r = lastResult;
  if (!r?.ok) {
    return [];
  }
  return [...r.workspaceRoots];
}

export function headlessRegisteredTypes(): string[] {
  const extra = getHeadlessSessionRegistry().getRegisteredTypes();
  return [...new Set([...HEADLESS_REGISTERED_TYPES, ...extra])].sort();
}

/**
 * Types allowed when creating a note via the HTTP API / web shim.
 * Only types backed by a loaded session plugin ({@link loadProductionPluginAt}) — no implicit markdown/text.
 * Opening existing notes and seeding still use {@link headlessRegisteredTypes} (includes baseline types).
 */
export function headlessSelectableNoteTypes(): string[] {
  const types = getHeadlessSessionRegistry().getSelectableNoteTypes();
  return [...types].sort();
}

/**
 * When the API runs with Postgres WPN only (no `NODEX_PROJECT_ROOT`), set a minimal
 * `userDataPath` so marketplace / prefs code that reads it does not see an empty path.
 */
export function initHeadlessPgOnlyFromEnv(): void {
  userDataPath =
    process.env.NODEX_USER_DATA_DIR?.trim() ||
    path.join(os.tmpdir(), "nodex-headless-pg-only");
  loadPersistedHeadlessSessionPlugins(userDataPath);
  registerBuiltinObservableNoteRenderer(getHeadlessSessionRegistry());
  registerBuiltinMarkdownNoteRenderer(getHeadlessSessionRegistry());
}
