/**
 * Load production .nodexplugin packages into a Registry for the headless API process
 * so browser + web shim can install marketplace plugins for this server session and
 * render notes via POST /plugins/render-html.
 */
import * as fs from "fs";
import * as path from "path";
import { Registry } from "../core/registry";
import { manifestValidator } from "../core/manifest-validator";
import {
  packageManager,
  type PackageInfo,
} from "../core/package-manager";
import type { PluginManifest } from "../core/plugin-loader-types";
import type { NoteRenderer } from "../shared/plugin-api";
import { isSafePluginName } from "../shared/validators";

const sessionRegistry = new Registry();
const loadedPluginIds = new Set<string>();

export function getHeadlessSessionRegistry(): Registry {
  return sessionRegistry;
}

/** Package ids loaded into the headless session registry (persisted + marketplace installs). */
export function getHeadlessSessionLoadedPluginIds(): string[] {
  return [...loadedPluginIds].sort();
}

function assertPluginFilesExist(
  pluginPath: string,
  manifest: PluginManifest,
): void {
  const mainAbs = path.join(pluginPath, manifest.main);
  if (!fs.existsSync(mainAbs)) {
    throw new Error(`Main entry not found: ${manifest.main}`);
  }
  if (manifest.ui) {
    const uiAbs = path.join(pluginPath, manifest.ui);
    if (!fs.existsSync(uiAbs)) {
      throw new Error(`UI entry not found: ${manifest.ui}`);
    }
  }
  if (manifest.html) {
    const htmlAbs = path.join(pluginPath, manifest.html);
    if (!fs.existsSync(htmlAbs)) {
      throw new Error(`HTML entry not found: ${manifest.html}`);
    }
  }
}

/**
 * Load an extracted production plugin folder (manifest.json + bundles on disk).
 */
export function loadProductionPluginAt(
  pluginPath: string,
  registry: Registry,
): void {
  const folder = path.basename(pluginPath);
  const manifestPath = path.join(pluginPath, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No manifest.json in ${folder}`);
  }

  const manifest: PluginManifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8"),
  );

  const validationResult = manifestValidator.validateForLoad(
    manifest,
    pluginPath,
  );
  if (!validationResult.valid) {
    const errorMessage = manifestValidator.formatErrors(validationResult);
    throw new Error(
      `Invalid manifest: ${errorMessage || validationResult.errors[0]?.message || "validation failed"}`,
    );
  }

  if (manifest.mode !== "production") {
    throw new Error("Headless session load requires mode: production");
  }

  assertPluginFilesExist(pluginPath, manifest);

  const mainFile = path.join(pluginPath, manifest.main);
  const dynamicRequire = eval("require") as NodeRequire;
  if (dynamicRequire.cache[mainFile]) {
    delete dynamicRequire.cache[mainFile];
  }

  const pluginModule = dynamicRequire(mainFile);
  if (!pluginModule || typeof pluginModule.activate !== "function") {
    throw new Error("Plugin must export an activate function");
  }

  const context = { subscriptions: [] as { dispose?: () => void }[] };
  const api: {
    registerNoteRenderer: (type: string, renderer: NoteRenderer) => {
      dispose: () => void;
    };
    getNote: () => null;
    getUiBootstrap?: () => Promise<string>;
  } = {
    registerNoteRenderer: (type: string, renderer: NoteRenderer) => {
      registry.registerRenderer(manifest.name, type, renderer, {
        theme: manifest.theme === "isolated" ? "isolated" : "inherit",
        designSystemVersion: manifest.designSystemVersion,
        deferDisplayUntilContentReady:
          manifest.deferDisplayUntilContentReady === true,
        hostTier: "user",
      });
      return {
        dispose: () => {
          registry.unregisterRenderer(manifest.name, type);
        },
      };
    },
    getNote: () => null,
  };

  if (manifest.ui) {
    api.getUiBootstrap = async () => {
      const uiPath = path.join(pluginPath, manifest.ui!);
      if (!fs.existsSync(uiPath)) {
        throw new Error(`UI bundle not found: ${manifest.ui}`);
      }
      return fs.readFileSync(uiPath, "utf8");
    };
  }

  pluginModule.activate(context, api);
}

const SESSION_PLUGINS_SUBDIR = "headless-session-plugins";

function sessionPluginsRoot(userDataPath: string): string {
  return path.join(userDataPath, SESSION_PLUGINS_SUBDIR);
}

/**
 * Re-load plugins extracted under userData/headless-session-plugins (e.g. after API restart).
 */
export function loadPersistedHeadlessSessionPlugins(userDataPath: string): void {
  const root = sessionPluginsRoot(userDataPath);
  if (!fs.existsSync(root)) {
    return;
  }
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith(".")) {
      continue;
    }
    if (!isSafePluginName(ent.name)) {
      continue;
    }
    if (loadedPluginIds.has(ent.name)) {
      continue;
    }
    const p = path.join(root, ent.name);
    if (!fs.existsSync(path.join(p, "manifest.json"))) {
      continue;
    }
    try {
      loadProductionPluginAt(p, sessionRegistry);
      loadedPluginIds.add(ent.name);
      console.log(`[Headless session] Restored plugin: ${ent.name}`);
    } catch (e) {
      console.warn(
        `[Headless session] Skip restore ${ent.name}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
}

export async function installHeadlessMarketplacePlugin(options: {
  marketplaceDir: string;
  packageBasename: string;
  userDataPath: string;
}): Promise<
  | { success: true; warnings?: string[] }
  | { success: false; error: string }
> {
  const { marketplaceDir, packageBasename, userDataPath } = options;
  if (!/^[a-zA-Z0-9._-]+\.nodexplugin$/.test(packageBasename)) {
    return { success: false, error: "Invalid package file name" };
  }
  const marketResolved = path.resolve(marketplaceDir);
  const zipPath = path.resolve(path.join(marketResolved, packageBasename));
  const rel = path.relative(marketResolved, zipPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { success: false, error: "Invalid path" };
  }
  if (!fs.existsSync(zipPath)) {
    return { success: false, error: "Package not found" };
  }

  const validation = await packageManager.validatePackage(zipPath);
  if (!validation.valid) {
    return {
      success: false,
      error: `Invalid package: ${validation.errors.join(", ")}`,
    };
  }

  let pkgMeta: PackageInfo;
  try {
    pkgMeta = await packageManager.getPackageInfo(zipPath);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (!isSafePluginName(pkgMeta.name)) {
    return { success: false, error: "Invalid plugin name in manifest" };
  }
  if (pkgMeta.mode !== "production") {
    return {
      success: false,
      error: "Only production .nodexplugin packages can be installed in web session",
    };
  }

  if (loadedPluginIds.has(pkgMeta.name)) {
    return { success: true, warnings: validation.warnings };
  }

  const dest = path.join(sessionPluginsRoot(userDataPath), pkgMeta.name);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  try {
    await packageManager.extractPackage(zipPath, dest);
    loadProductionPluginAt(dest, sessionRegistry);
  } catch (e) {
    fs.rmSync(dest, { recursive: true, force: true });
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  loadedPluginIds.add(pkgMeta.name);
  console.log(`[Headless session] Installed plugin: ${pkgMeta.name}`);
  return { success: true, warnings: validation.warnings };
}
