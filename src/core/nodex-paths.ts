import * as path from "path";

/**
 * Cross-platform Nodex paths under Electron `userData` / `cache`.
 * Never hardcode `~/.config` or `~/.nodex` — OS layout differs (Windows %APPDATA%, etc.).
 */

function assertUnderBase(baseAbs: string, candidateAbs: string, label: string): void {
  const rel = path.relative(baseAbs, candidateAbs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`${label} must resolve under ${baseAbs}`);
  }
}

/** `userData/plugins` — sources/, bin/, IDE metadata (same layout as before, portable). */
export function getNodexUserPluginsDir(userDataPath: string): string {
  const base = path.resolve(userDataPath);
  const resolved = path.resolve(base, "plugins");
  assertUnderBase(base, resolved, "plugins directory");
  return resolved;
}

/** `userData/data/nodex.sqlite` */
export function getNodexDatabasePath(userDataPath: string): string {
  const base = path.resolve(userDataPath);
  const resolved = path.resolve(base, "data", "nodex.sqlite");
  assertUnderBase(base, resolved, "database path");
  return resolved;
}

/** Legacy JSON notes path (migration source only). */
export function getLegacyNotesJsonPath(userDataPath: string): string {
  return path.join(userDataPath, "notes-tree.json");
}

/**
 * `userData/nodex-cache` — regenerable caches (Electron 41 typings omit `getPath("cache")`;
 * keeping caches under userData stays portable and easy to wipe).
 */
export function getNodexDerivedCacheRoot(userDataPath: string): string {
  const base = path.resolve(userDataPath);
  const resolved = path.resolve(base, "nodex-cache");
  assertUnderBase(base, resolved, "nodex-cache directory");
  return resolved;
}

/** Per-plugin npm installs (regenerable). */
export function getNodexPluginCacheRoot(userDataPath: string): string {
  return path.join(getNodexDerivedCacheRoot(userDataPath), "plugin-cache");
}

/** JSX compile cache (regenerable). */
export function getNodexJsxCacheRoot(userDataPath: string): string {
  return path.join(getNodexDerivedCacheRoot(userDataPath), "jsx-cache");
}
