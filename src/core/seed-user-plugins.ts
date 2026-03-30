import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

/** Copied into `userData/plugins/sources/<name>` on first run if missing. */
const SAMPLE_PLUGIN_NAMES = ["markdown", "tiptap"] as const;

function resolveSamplePluginSourceDir(name: string): string | null {
  if (app.isPackaged) {
    const fromResources = path.join(process.resourcesPath, name);
    if (fs.existsSync(path.join(fromResources, "manifest.json"))) {
      return fromResources;
    }
    return null;
  }
  const appRoot = app.getAppPath();
  const fromRepo = path.join(appRoot, "plugins", name);
  if (fs.existsSync(path.join(fromRepo, "manifest.json"))) {
    return fromRepo;
  }
  const fromSources = path.join(appRoot, "plugin-sources", name);
  if (fs.existsSync(path.join(fromSources, "manifest.json"))) {
    return fromSources;
  }
  return null;
}

/**
 * Seeds `sources/<name>` under the user plugins root from repo or packaged resources.
 * Does not overwrite existing folders.
 */
export function seedSamplePluginsToUserDir(userPluginsPath: string): void {
  fs.mkdirSync(userPluginsPath, { recursive: true });
  const sourcesRoot = path.join(userPluginsPath, "sources");
  fs.mkdirSync(sourcesRoot, { recursive: true });

  for (const name of SAMPLE_PLUGIN_NAMES) {
    const src = resolveSamplePluginSourceDir(name);
    if (!src) {
      continue;
    }
    const dest = path.join(sourcesRoot, name);
    if (fs.existsSync(dest)) {
      continue;
    }
    try {
      fs.cpSync(src, dest, { recursive: true });
      console.log(`[Main] Seeded user plugin '${name}' -> ${dest}`);
    } catch (e) {
      console.warn(
        `[Main] Could not seed plugin '${name}':`,
        e instanceof Error ? e.message : e,
      );
    }
  }
}
