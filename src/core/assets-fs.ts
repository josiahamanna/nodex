import * as fs from "fs";
import * as path from "path";
import { getProjectAssetsDir } from "./project-session";

export type AssetListEntry = {
  name: string;
  isDirectory: boolean;
};

/**
 * Normalize relative path under assets: reject `..`, absolute, and drive tricks.
 * Returns POSIX-style relative segments joined for display, or null if invalid.
 */
export function safeAssetsRelativePath(raw: string): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const norm = raw.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (norm === "" || norm === ".") {
    return "";
  }
  const parts = norm.split("/").filter((p) => p.length > 0);
  for (const p of parts) {
    if (p === ".." || p.startsWith(".")) {
      return null;
    }
  }
  return parts.join(path.sep);
}

/**
 * List direct children of `assets/<relativePath>`. Skips dotfiles/dotdirs.
 */
export function listProjectAssets(
  projectRoot: string,
  relativePath: string,
): { ok: true; entries: AssetListEntry[] } | { ok: false; error: string } {
  const rel = safeAssetsRelativePath(relativePath);
  if (rel === null) {
    return { ok: false, error: "Invalid path" };
  }
  const assetsRoot = path.resolve(getProjectAssetsDir(projectRoot));
  const dir = rel ? path.join(assetsRoot, rel) : assetsRoot;
  const resolved = path.resolve(dir);
  if (!resolved.startsWith(assetsRoot + path.sep) && resolved !== assetsRoot) {
    return { ok: false, error: "Path escapes assets" };
  }
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: "Not found" };
  }
  if (!fs.statSync(resolved).isDirectory()) {
    return { ok: false, error: "Not a directory" };
  }
  const entries: AssetListEntry[] = [];
  for (const ent of fs.readdirSync(resolved, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) {
      continue;
    }
    entries.push({
      name: ent.name,
      isDirectory: ent.isDirectory(),
    });
  }
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return { ok: true, entries };
}

/** Resolved absolute path to a file under assets, or null if invalid / not a file. */
export function resolveAssetFilePath(
  projectRoot: string,
  relativePath: string,
): string | null {
  const rel = safeAssetsRelativePath(relativePath);
  if (rel === null) {
    return null;
  }
  const assetsRoot = path.resolve(getProjectAssetsDir(projectRoot));
  const full = path.resolve(path.join(assetsRoot, rel));
  if (!full.startsWith(assetsRoot + path.sep) && full !== assetsRoot) {
    return null;
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return null;
  }
  return full;
}
