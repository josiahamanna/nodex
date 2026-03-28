import { execFileSync, spawn } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Registry } from "./registry";
import {
  isSafePluginName,
  isSafeRelativePluginSourcePath,
} from "../shared/validators";
import { manifestValidator } from "./manifest-validator";
import { packageManager } from "./package-manager";
import { pluginCacheManager } from "./plugin-cache-manager";
import { npmPackageExistsOnRegistry } from "./npm-registry-stub";
import { emitPluginProgress } from "./plugin-progress";
import { pluginBundler } from "./plugin-bundler";
import * as esbuild from "esbuild";
import {
  typecheckPluginWorkspace,
  type TypecheckDiagnostic,
} from "./plugin-typecheck";
import { toFileUri } from "../shared/file-uri";

const zipHandler = require("./zip-handler");

export type PluginMode = "development" | "production";
export type PluginType = "ui" | "backend" | "hybrid";

export type Permission =
  | "storage.read"
  | "storage.write"
  | "db.read"
  | "db.write"
  | "fs.read"
  | "fs.write"
  | "network.http"
  | "ui.panel"
  | "ui.toolbar";

export interface NetworkConfig {
  whitelist?: string[];
  requestApproval?: boolean;
  rateLimit?: {
    requestsPerMinute?: number;
    requestsPerHour?: number;
  };
}

export interface PluginManifest {
  // Required fields
  name: string;
  version: string;
  type: PluginType;
  main: string;
  mode: PluginMode;

  // Optional fields
  displayName?: string;
  description?: string;
  author?: string;
  license?: string;
  ui?: string;
  html?: string;
  rootId?: string;
  noteTypes?: string[];
  permissions?: Permission[];
  activationEvents?: string[];
  icon?: string;
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  assets?: string[];
  /** Relative paths copied/bundled to dist/workers/ (Epic 2.3). */
  workers?: string[];
  network?: NetworkConfig;
}

export interface NodexAPI {
  ui: {
    registerComponent: (type: string, componentCode: string) => void;
  };
}

export interface Plugin {
  activate?: (Nodex: NodexAPI) => void;
  deactivate?: () => void;
}

export class PluginLoader {
  /** User-installed plugins (import, IDE edits, uninstall). */
  private userPluginsDir: string;
  /**
   * Read-only roots scanned before userPluginsDir (e.g. shipped `plugins/core`).
   * Same note `type` registered later wins — user plugins override bundled.
   */
  private bundledCoreRoots: string[];
  private loadedPlugins: Set<string> = new Set();
  private devUiBundleCache: Map<string, { mtime: number; code: string }> =
    new Map();
  private loadIssues: { folder: string; error: string }[] = [];

  constructor(userPluginsDir: string, bundledCoreRoots: string[] = []) {
    this.userPluginsDir = userPluginsDir;
    this.bundledCoreRoots = bundledCoreRoots.filter(
      (p) => typeof p === "string" && p.length > 0 && fs.existsSync(p),
    );
  }

  private static readonly RESERVED_TOP_LEVEL = new Set(["sources", "bin"]);

  private userSourcesRoot(): string {
    return path.join(this.userPluginsDir, "sources");
  }

  private userBinRoot(): string {
    return path.join(this.userPluginsDir, "bin");
  }

  /**
   * Editable plugin tree: `sources/<name>` if present, else legacy flat `userData/plugins/<name>`.
   */
  private tryResolvePluginWorkspacePath(
    installedFolderName: string,
  ): string | null {
    if (!isSafePluginName(installedFolderName)) {
      return null;
    }
    const fromSources = path.join(this.userSourcesRoot(), installedFolderName);
    if (fs.existsSync(path.join(fromSources, "manifest.json"))) {
      return fromSources;
    }
    if (PluginLoader.RESERVED_TOP_LEVEL.has(installedFolderName)) {
      return null;
    }
    const legacy = path.join(this.userPluginsDir, installedFolderName);
    if (fs.existsSync(path.join(legacy, "manifest.json"))) {
      return legacy;
    }
    return null;
  }

  /** Prefer `bin/<name>` (bundled production), else sources, else legacy flat. */
  private resolvePluginRuntimePath(installedFolderName: string): string | null {
    if (!isSafePluginName(installedFolderName)) {
      return null;
    }
    const binP = path.join(this.userBinRoot(), installedFolderName);
    if (fs.existsSync(path.join(binP, "manifest.json"))) {
      return binP;
    }
    return this.tryResolvePluginWorkspacePath(installedFolderName);
  }

  /** Folder with a production `manifest.json` (prefer `bin/<name>`). */
  private resolveProductionPluginRoot(pluginName: string): string | null {
    if (!isSafePluginName(pluginName)) {
      return null;
    }
    const candidates = [
      path.join(this.userBinRoot(), pluginName),
      path.join(this.userPluginsDir, pluginName),
    ];
    for (const c of candidates) {
      const mp = path.join(c, "manifest.json");
      if (!fs.existsSync(mp)) {
        continue;
      }
      try {
        const m = JSON.parse(fs.readFileSync(mp, "utf8")) as PluginManifest;
        if (m.mode === "production") {
          return c;
        }
      } catch {
        /* skip */
      }
    }
    return null;
  }

  private collectUserPluginIds(): string[] {
    const names = new Set<string>();
    const addFromDir = (root: string): void => {
      if (!fs.existsSync(root)) {
        return;
      }
      for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
        if (!ent.isDirectory() || ent.name.startsWith(".")) {
          continue;
        }
        const p = path.join(root, ent.name);
        if (fs.existsSync(path.join(p, "manifest.json"))) {
          names.add(ent.name);
        }
      }
    };
    addFromDir(this.userSourcesRoot());
    addFromDir(this.userBinRoot());
    if (fs.existsSync(this.userPluginsDir)) {
      for (const ent of fs.readdirSync(this.userPluginsDir, {
        withFileTypes: true,
      })) {
        if (!ent.isDirectory() || ent.name.startsWith(".")) {
          continue;
        }
        if (PluginLoader.RESERVED_TOP_LEVEL.has(ent.name)) {
          continue;
        }
        const p = path.join(this.userPluginsDir, ent.name);
        if (fs.existsSync(path.join(p, "manifest.json"))) {
          names.add(ent.name);
        }
      }
    }
    return Array.from(names).sort();
  }

  private loadUserPlugins(registry: Registry): void {
    for (const id of this.collectUserPluginIds()) {
      const loadPath = this.resolvePluginRuntimePath(id);
      if (!loadPath) {
        continue;
      }
      try {
        this.loadPluginAt(loadPath, registry);
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        console.error(`[PluginLoader] Failed to load plugin ${id}:`, error);
        this.loadIssues.push({ folder: id, error: msg });
      }
    }
  }

  /** Epic 1.1 — validate declared entry files exist before activation. */
  private assertPluginFilesExist(
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
   * Node cannot require() raw `.ts`. Compile to a cached `.cjs` beside user plugins
   * when `manifest.main` ends with `.ts`.
   */
  private resolvePluginMainRequirePath(
    pluginPath: string,
    manifest: PluginManifest,
  ): string {
    const mainAbs = path.join(pluginPath, manifest.main);
    if (!manifest.main.endsWith(".ts")) {
      return mainAbs;
    }

    const cacheRoot = path.join(this.userPluginsDir, ".plugin-main-cache");
    fs.mkdirSync(cacheRoot, { recursive: true });
    const st = fs.statSync(mainAbs);
    const id = crypto
      .createHash("sha256")
      .update(mainAbs)
      .digest("hex")
      .slice(0, 32);
    const outFile = path.join(cacheRoot, `${id}.cjs`);
    const metaFile = path.join(cacheRoot, `${id}.json`);
    let needBuild = true;
    if (fs.existsSync(metaFile) && fs.existsSync(outFile)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaFile, "utf8")) as {
          mtimeMs: number;
        };
        if (meta.mtimeMs === st.mtimeMs) {
          needBuild = false;
        }
      } catch {
        /* rebuild */
      }
    }
    if (needBuild) {
      const nodePaths: string[] = [];
      const localNm = path.join(pluginPath, "node_modules");
      if (fs.existsSync(localNm)) {
        nodePaths.push(localNm);
      }
      const cacheNm = pluginCacheManager.getNodeModulesPath(manifest.name);
      if (fs.existsSync(cacheNm)) {
        nodePaths.push(cacheNm);
      }
      try {
        esbuild.buildSync({
          absWorkingDir: pluginPath,
          entryPoints: [mainAbs],
          outfile: outFile,
          bundle: true,
          platform: "node",
          format: "cjs",
          target: ["node18"],
          logLevel: "silent",
          external: ["electron"],
          ...(nodePaths.length > 0 ? { nodePaths } : {}),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`[PluginLoader] Failed to compile ${manifest.main}: ${msg}`);
      }
      fs.writeFileSync(
        metaFile,
        JSON.stringify({ mtimeMs: st.mtimeMs }),
        "utf8",
      );
    }
    return outFile;
  }

  private copyPluginProductionAssets(
    pluginPath: string,
    stagingPath: string,
    manifest: PluginManifest,
  ): void {
    for (const extra of ["README.md", "LICENSE"]) {
      const from = path.join(pluginPath, extra);
      if (fs.existsSync(from)) {
        fs.copyFileSync(from, path.join(stagingPath, extra));
      }
    }
    if (manifest.assets?.length) {
      for (const a of manifest.assets) {
        const from = path.join(pluginPath, a);
        if (!fs.existsSync(from)) {
          continue;
        }
        const to = path.join(stagingPath, a);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        const st = fs.statSync(from);
        if (st.isDirectory()) {
          fs.cpSync(from, to, { recursive: true });
        } else {
          fs.copyFileSync(from, to);
        }
      }
    }
  }

  loadAll(registry: Registry): void {
    this.loadIssues = [];

    fs.mkdirSync(this.userPluginsDir, { recursive: true });

    for (const root of this.bundledCoreRoots) {
      this.loadPluginsInDirectory(root, registry);
    }
    this.loadUserPlugins(registry);
  }

  /** Each immediate child directory with a manifest.json is one plugin. */
  private loadPluginsInDirectory(parentDir: string, registry: Registry): void {
    if (!fs.existsSync(parentDir)) {
      return;
    }

    const entries = fs.readdirSync(parentDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith(".")) {
        continue;
      }
      const pluginPath = path.join(parentDir, ent.name);
      const manifestPath = path.join(pluginPath, "manifest.json");
      if (!fs.existsSync(manifestPath)) {
        continue;
      }
      try {
        this.loadPluginAt(pluginPath, registry);
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[PluginLoader] Failed to load plugin ${ent.name}:`,
          error,
        );
        this.loadIssues.push({ folder: ent.name, error: msg });
      }
    }
  }

  getPluginLoadIssues(): { folder: string; error: string }[] {
    return [...this.loadIssues];
  }

  private loadPluginAt(pluginPath: string, registry: Registry): void {
    const folder = path.basename(pluginPath);
    const manifestPath = path.join(pluginPath, "manifest.json");

    if (!fs.existsSync(manifestPath)) {
      console.log(`[PluginLoader] No manifest.json found in ${folder}`);
      return;
    }

    const manifestContent = fs.readFileSync(manifestPath, "utf8");
    const manifest: PluginManifest = JSON.parse(manifestContent);

    const validationResult = manifestValidator.validateForLoad(
      manifest,
      pluginPath,
    );
    if (!validationResult.valid) {
      const errorMessage = manifestValidator.formatErrors(validationResult);
      console.error(
        `[PluginLoader] Invalid manifest for ${folder}:\n${errorMessage}`,
      );
      throw new Error(
        `Invalid manifest: ${validationResult.errors[0]?.message || "validation failed"}`,
      );
    }

    // Log warnings if any
    if (validationResult.warnings.length > 0) {
      console.warn(`[PluginLoader] Manifest warnings for ${folder}:`);
      validationResult.warnings.forEach((w) => {
        console.warn(`  - [${w.field}] ${w.message}`);
      });
    }

    if (folder !== manifest.name) {
      console.warn(
        `[PluginLoader] Plugin folder "${folder}" differs from manifest name "${manifest.name}" (cache uses manifest name).`,
      );
    }

    this.assertPluginFilesExist(pluginPath, manifest);

    const mainFile = this.resolvePluginMainRequirePath(pluginPath, manifest);

    try {
      // Use dynamic require to prevent webpack from bundling plugin code
      // This is safe because it only runs in the main process (Node.js)
      const dynamicRequire = eval("require");

      // Clear require cache to allow plugin reloading
      if (dynamicRequire.cache[mainFile]) {
        delete dynamicRequire.cache[mainFile];
      }

      // Load plugin as Node.js module
      const pluginModule = dynamicRequire(mainFile);

      if (!pluginModule || typeof pluginModule.activate !== "function") {
        throw new Error("Plugin must export an activate function");
      }

      // Create plugin context
      const context = {
        subscriptions: [],
      };

      const api: {
        registerNoteRenderer: (type: string, renderer: any) => {
          dispose: () => void;
        };
        getNote: () => null;
        getUiBootstrap?: () => Promise<string>;
      } = {
        registerNoteRenderer: (type: string, renderer: any) => {
          registry.registerRenderer(manifest.name, type, renderer);
          this.loadedPlugins.add(manifest.name);
          console.log(
            `[PluginLoader] Loaded plugin: ${manifest.name} (type: ${type})`,
          );
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
          if (manifest.mode === "production") {
            if (!fs.existsSync(uiPath)) {
              throw new Error(`UI bundle not found: ${manifest.ui}`);
            }
            return fs.readFileSync(uiPath, "utf8");
          }
          if (
            manifest.ui!.endsWith(".jsx") ||
            manifest.ui!.endsWith(".tsx")
          ) {
            const stat = fs.statSync(uiPath);
            const cacheKey = `${pluginPath}:${manifest.ui}`;
            const hit = this.devUiBundleCache.get(cacheKey);
            if (hit && hit.mtime === stat.mtimeMs) {
              return hit.code;
            }
            let code: string;
            try {
              code = await pluginBundler.bundleUiForDevIframe(
                pluginPath,
                manifest.ui!,
                false,
              );
            } catch (err) {
              const msg =
                err instanceof Error ? err.message : String(err);
              emitPluginProgress({
                op: "bundle",
                phase: "error",
                message: msg,
                pluginName: manifest.name,
              });
              throw err;
            }
            this.devUiBundleCache.set(cacheKey, {
              mtime: stat.mtimeMs,
              code,
            });
            return code;
          }
          return fs.readFileSync(uiPath, "utf8");
        };
      }

      // Activate plugin
      pluginModule.activate(context, api);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        `[PluginLoader] Failed to load plugin ${manifest.name}:`,
        error,
      );
      this.loadIssues.push({ folder: manifest.name, error: msg });
    }
  }

  reload(registry: Registry): void {
    this.loadedPlugins.clear();
    this.devUiBundleCache.clear();
    registry.clear();
    this.loadAll(registry);
  }

  async importFromZip(
    zipPath: string,
    registry: Registry,
  ): Promise<{ warnings: string[] }> {
    try {
      emitPluginProgress({
        op: "import",
        phase: "start",
        message: `Importing ${path.basename(zipPath)}`,
      });

      // Validate package first
      const validation = await packageManager.validatePackage(zipPath);
      if (!validation.valid) {
        throw new Error(`Invalid package: ${validation.errors.join(", ")}`);
      }

      const importWarnings = [...validation.warnings];

      // Get package info
      const packageInfo = await packageManager.getPackageInfo(zipPath);
      if (!isSafePluginName(packageInfo.name)) {
        throw new Error("Invalid plugin name in package manifest");
      }

      console.log(
        `[PluginLoader] Importing ${packageInfo.mode} package: ${packageInfo.name} v${packageInfo.version}`,
      );

      fs.mkdirSync(this.userSourcesRoot(), { recursive: true });
      const pluginDir = path.join(this.userSourcesRoot(), packageInfo.name);
      const legacyDir = path.join(this.userPluginsDir, packageInfo.name);
      const binDir = path.join(this.userBinRoot(), packageInfo.name);

      if (
        fs.existsSync(pluginDir) ||
        fs.existsSync(legacyDir) ||
        fs.existsSync(binDir)
      ) {
        throw new Error(
          `Plugin ${packageInfo.name} already exists. Please remove it first.`,
        );
      }

      fs.mkdirSync(pluginDir, { recursive: true });

      // Extract package
      await packageManager.extractPackage(zipPath, pluginDir);

      const loadPath = this.resolvePluginRuntimePath(packageInfo.name);
      if (loadPath) {
        this.loadPluginAt(loadPath, registry);
      }

      console.log(
        `[PluginLoader] Successfully imported ${packageInfo.mode} plugin: ${packageInfo.name}`,
      );

      emitPluginProgress({
        op: "import",
        phase: "done",
        message: `Imported ${packageInfo.name}`,
        pluginName: packageInfo.name,
      });

      return { warnings: importWarnings };
    } catch (error) {
      console.error("[PluginLoader] Failed to import plugin from zip:", error);
      emitPluginProgress({
        op: "import",
        phase: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  getLoadedPlugins(): string[] {
    return Array.from(this.loadedPlugins);
  }

  uninstallPlugin(pluginName: string, registry: Registry): void {
    if (!isSafePluginName(pluginName)) {
      throw new Error("Invalid plugin name");
    }

    const binPath = path.join(this.userBinRoot(), pluginName);
    if (!fs.existsSync(binPath)) {
      throw new Error(
        `No bundled plugin in bin/ for "${pluginName}". Sources under sources/ were not removed.`,
      );
    }

    fs.rmSync(binPath, { recursive: true, force: true });

    this.loadedPlugins.delete(pluginName);

    this.reload(registry);

    console.log(
      `[PluginLoader] Removed bundled plugin from bin: ${pluginName} (sources preserved)`,
    );
  }

  async exportPluginAsDev(
    pluginName: string,
    outputDir: string,
  ): Promise<string> {
    if (!isSafePluginName(pluginName)) {
      throw new Error("Invalid plugin name");
    }

    const pluginPath = this.tryResolvePluginWorkspacePath(pluginName);

    if (!pluginPath) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    // Read manifest to verify it's in development mode
    const manifestPath = path.join(pluginPath, "manifest.json");
    const manifest: PluginManifest = JSON.parse(
      fs.readFileSync(manifestPath, "utf8"),
    );

    if (manifest.mode !== "development") {
      throw new Error(
        `Plugin ${pluginName} is not in development mode. Cannot export as dev package.`,
      );
    }

    emitPluginProgress({
      op: "export",
      phase: "start",
      message: `Export dev package: ${manifest.name}`,
      pluginName: manifest.name,
    });

    try {
      const packagePath = await packageManager.createDevPackage({
        pluginPath,
        outputPath: outputDir,
        mode: "development",
      });

      console.log(
        `[PluginLoader] Exported ${pluginName} as dev package: ${packagePath}`,
      );

      emitPluginProgress({
        op: "export",
        phase: "done",
        message: `Dev export: ${path.basename(packagePath)}`,
        pluginName: manifest.name,
      });

      return packagePath;
    } catch (e) {
      emitPluginProgress({
        op: "export",
        phase: "error",
        message: e instanceof Error ? e.message : String(e),
        pluginName: manifest.name,
      });
      throw e;
    }
  }

  async exportPluginAsProduction(
    pluginName: string,
    outputDir: string,
  ): Promise<string> {
    if (!isSafePluginName(pluginName)) {
      throw new Error("Invalid plugin name");
    }

    const pluginPath = this.resolveProductionPluginRoot(pluginName);
    if (!pluginPath) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    // Read manifest to verify it's in production mode
    const manifestPath = path.join(pluginPath, "manifest.json");
    const manifest: PluginManifest = JSON.parse(
      fs.readFileSync(manifestPath, "utf8"),
    );

    if (manifest.mode !== "production") {
      throw new Error(
        `Plugin ${pluginName} is not in production mode. Cannot export as production package.`,
      );
    }

    const packagePath = await packageManager.createProductionPackage({
      pluginPath,
      outputPath: outputDir,
      mode: "production",
    });

    console.log(
      `[PluginLoader] Exported ${pluginName} as production package: ${packagePath}`,
    );

    return packagePath;
  }

  /**
   * Build a `.Nodexplugin` from a development plugin (bundle + stage + zip), or re-package an
   * already production-mode plugin folder.
   */
  async exportProductionPackage(
    pluginName: string,
    outputDir: string,
  ): Promise<string> {
    if (!isSafePluginName(pluginName)) {
      throw new Error("Invalid plugin name");
    }

    const workspacePath = this.tryResolvePluginWorkspacePath(pluginName);
    const prodPath = this.resolveProductionPluginRoot(pluginName);
    const pluginPath = prodPath ?? workspacePath;

    if (!pluginPath) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    const manifestPath = path.join(pluginPath, "manifest.json");
    const manifest: PluginManifest = JSON.parse(
      fs.readFileSync(manifestPath, "utf8"),
    );

    emitPluginProgress({
      op: "export",
      phase: "start",
      message: `Export production: ${manifest.name}`,
      pluginName: manifest.name,
    });

    if (manifest.mode === "production") {
      const packagePath = await packageManager.createProductionPackage({
        pluginPath,
        outputPath: outputDir,
        mode: "production",
      });
      console.log(
        `[PluginLoader] Exported ${pluginName} as production package: ${packagePath}`,
      );
      emitPluginProgress({
        op: "export",
        phase: "done",
        message: `Production export: ${path.basename(packagePath)}`,
        pluginName: manifest.name,
      });
      return packagePath;
    }

    if (manifest.mode === "development") {
      const devRoot = workspacePath ?? pluginPath;
      const staging = fs.mkdtempSync(path.join(os.tmpdir(), "nodex-prod-"));
      try {
        const distStaging = path.join(staging, "dist");
        const result = await pluginBundler.bundle(devRoot, {
          distDir: distStaging,
          minify: true,
          sourcemap: true,
          onProgress: (m) => {
            console.log(`[PluginLoader] Bundle: ${m}`);
            emitPluginProgress({
              op: "export",
              phase: "progress",
              message: m,
              pluginName: manifest.name,
            });
          },
        });

        if (!result.success) {
          const errText = result.errors.join("\n");
          emitPluginProgress({
            op: "export",
            phase: "error",
            message: errText,
            pluginName: manifest.name,
          });
          throw new Error(errText);
        }

        const prodManifest: PluginManifest = {
          ...manifest,
          mode: "production",
          main: result.mainBundle!,
        };
        if (result.uiBundle) {
          prodManifest.ui = result.uiBundle;
        } else {
          delete prodManifest.ui;
        }
        delete prodManifest.dependencies;
        delete prodManifest.devDependencies;

        fs.writeFileSync(
          path.join(staging, "manifest.json"),
          JSON.stringify(prodManifest, null, 2),
        );

        this.copyPluginProductionAssets(devRoot, staging, manifest);

        const packagePath = await packageManager.createProductionPackage({
          pluginPath: staging,
          outputPath: outputDir,
          mode: "production",
        });

        console.log(
          `[PluginLoader] Bundled and exported ${pluginName}: ${packagePath}`,
        );
        emitPluginProgress({
          op: "export",
          phase: "done",
          message: `Production export: ${path.basename(packagePath)}`,
          pluginName: manifest.name,
        });
        return packagePath;
      } finally {
        fs.rmSync(staging, { recursive: true, force: true });
      }
    }

    emitPluginProgress({
      op: "export",
      phase: "error",
      message: `Unsupported manifest mode: ${manifest.mode}`,
      pluginName: manifest.name,
    });
    throw new Error(`Unsupported manifest mode: ${manifest.mode}`);
  }

  async bundlePluginToLocalDist(pluginName: string): Promise<{
    success: boolean;
    error?: string;
    warnings?: string[];
  }> {
    if (!isSafePluginName(pluginName)) {
      return { success: false, error: "Invalid plugin name" };
    }

    const sourcePath = this.tryResolvePluginWorkspacePath(pluginName);
    if (!sourcePath) {
      return {
        success: false,
        error: `Plugin sources not found for ${pluginName} (expected sources/${pluginName} or legacy folder).`,
      };
    }

    const man = JSON.parse(
      fs.readFileSync(path.join(sourcePath, "manifest.json"), "utf8"),
    ) as PluginManifest;

    const binOut = path.join(this.userBinRoot(), pluginName);
    fs.mkdirSync(this.userBinRoot(), { recursive: true });
    fs.mkdirSync(binOut, { recursive: true });

    emitPluginProgress({
      op: "bundle",
      phase: "start",
      message: `Bundle to bin/${pluginName}: ${man.name}`,
      pluginName: man.name,
    });

    const result = await pluginBundler.bundle(sourcePath, {
      distDir: binOut,
      minify: false,
      sourcemap: true,
      onProgress: (m) => {
        console.log(`[PluginLoader] Bundle: ${m}`);
        emitPluginProgress({
          op: "bundle",
          phase: "progress",
          message: m,
          pluginName: man.name,
        });
      },
    });

    if (!result.success) {
      emitPluginProgress({
        op: "bundle",
        phase: "error",
        message: result.errors.join("\n"),
        pluginName: man.name,
      });
      return {
        success: false,
        error: result.errors.join("\n"),
        warnings: result.warnings,
      };
    }

    const prodManifest: PluginManifest = {
      ...man,
      mode: "production",
      main: result.mainBundle!,
    };
    if (result.uiBundle) {
      prodManifest.ui = result.uiBundle;
    } else {
      delete prodManifest.ui;
    }
    delete prodManifest.dependencies;
    delete prodManifest.devDependencies;

    fs.writeFileSync(
      path.join(binOut, "manifest.json"),
      JSON.stringify(prodManifest, null, 2),
      "utf8",
    );

    this.copyPluginProductionAssets(sourcePath, binOut, man);

    for (const key of [...this.devUiBundleCache.keys()]) {
      if (key.startsWith(`${sourcePath}:`)) {
        this.devUiBundleCache.delete(key);
      }
    }

    emitPluginProgress({
      op: "bundle",
      phase: "done",
      message: `Bundled ${man.name} → bin/${pluginName}`,
      pluginName: man.name,
    });

    return { success: true, warnings: result.warnings };
  }

  /** Epic 3.1 / 3.2 — install npm deps into ~/.nodex/plugin-cache/<manifest.name>/ */
  async installPluginDependencies(pluginName: string): Promise<{
    success: boolean;
    error?: string;
    log?: string;
  }> {
    if (!isSafePluginName(pluginName)) {
      return { success: false, error: "Invalid plugin name" };
    }

    const pluginPath = this.tryResolvePluginWorkspacePath(pluginName);
    if (!pluginPath) {
      return { success: false, error: `Plugin ${pluginName} not found` };
    }

    const manifest: PluginManifest = JSON.parse(
      fs.readFileSync(path.join(pluginPath, "manifest.json"), "utf8"),
    );

    if (!isSafePluginName(manifest.name)) {
      return { success: false, error: "Invalid manifest name" };
    }

    pluginCacheManager.ensureRoot();
    const lines: string[] = [];

    emitPluginProgress({
      op: "npm",
      phase: "start",
      message: `npm install (${manifest.name})`,
      pluginName: manifest.name,
    });

    try {
      pluginCacheManager.syncPackageJsonToCache(pluginPath, {
        name: manifest.name,
        version: manifest.version,
        dependencies: manifest.dependencies,
      });
    } catch (e) {
      emitPluginProgress({
        op: "npm",
        phase: "error",
        message: e instanceof Error ? e.message : String(e),
        pluginName: manifest.name,
      });
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    const result = await pluginCacheManager.runNpmInstall(
      manifest.name,
      (line) => {
        lines.push(line);
        emitPluginProgress({
          op: "npm",
          phase: "log",
          message: line,
          pluginName: manifest.name,
        });
      },
    );

    if (result.ok) {
      for (const key of [...this.devUiBundleCache.keys()]) {
        if (key.startsWith(`${pluginPath}:`)) {
          this.devUiBundleCache.delete(key);
        }
      }
      this.writeDepsSnapshot(pluginPath, manifest);
      emitPluginProgress({
        op: "npm",
        phase: "done",
        message: `npm install finished (${manifest.name})`,
        pluginName: manifest.name,
      });
    } else {
      emitPluginProgress({
        op: "npm",
        phase: "error",
        message: result.error ?? "npm install failed",
        pluginName: manifest.name,
      });
    }

    return {
      success: result.ok,
      error: result.error,
      log: lines.join("\n"),
    };
  }

  private getDepsSnapshotPath(pluginPath: string): string {
    return path.join(pluginPath, ".nodex-deps-snapshot.json");
  }

  private computeDepsIntentHash(
    pluginPath: string,
    manifest: PluginManifest,
  ): string {
    const pj = path.join(pluginPath, "package.json");
    const pkg = fs.existsSync(pj) ? fs.readFileSync(pj, "utf8") : "";
    return crypto
      .createHash("sha256")
      .update(pkg)
      .update("|")
      .update(JSON.stringify(manifest.dependencies ?? {}))
      .digest("hex");
  }

  private readDepsSnapshotHash(pluginPath: string): string | null {
    const p = this.getDepsSnapshotPath(pluginPath);
    if (!fs.existsSync(p)) {
      return null;
    }
    try {
      const j = JSON.parse(fs.readFileSync(p, "utf8")) as { hash?: string };
      return j.hash ?? null;
    } catch {
      return null;
    }
  }

  private writeDepsSnapshot(
    pluginPath: string,
    manifest: PluginManifest,
  ): void {
    const hash = this.computeDepsIntentHash(pluginPath, manifest);
    fs.writeFileSync(
      this.getDepsSnapshotPath(pluginPath),
      JSON.stringify({ hash, updated: Date.now() }, null, 2),
      "utf8",
    );
  }

  async getPluginInstallPlan(installedFolderName: string): Promise<{
    manifestName: string;
    cacheDir: string;
    dependencies: Record<string, string>;
    dependencyCount: number;
    warnManyDeps: boolean;
    warnLargePackageJson: boolean;
    depsChangedSinceLastInstall: boolean;
    hadSnapshot: boolean;
    registryNotes: string[];
  }> {
    if (!isSafePluginName(installedFolderName)) {
      throw new Error("Invalid plugin name");
    }

    const pluginPath = this.tryResolvePluginWorkspacePath(installedFolderName);
    if (!pluginPath) {
      throw new Error("Plugin not found");
    }

    const manifest: PluginManifest = JSON.parse(
      fs.readFileSync(path.join(pluginPath, "manifest.json"), "utf8"),
    );

    if (!isSafePluginName(manifest.name)) {
      throw new Error("Invalid manifest name");
    }

    const pj = path.join(pluginPath, "package.json");
    let dependencies: Record<string, string> = {
      ...(manifest.dependencies ?? {}),
    };

    if (fs.existsSync(pj)) {
      const pkg = JSON.parse(fs.readFileSync(pj, "utf8")) as {
        dependencies?: Record<string, string>;
      };
      dependencies = { ...dependencies, ...(pkg.dependencies ?? {}) };
    }

    const dependencyCount = Object.keys(dependencies).length;
    const pkgLen = fs.existsSync(pj) ? fs.readFileSync(pj, "utf8").length : 0;
    const warnLargePackageJson = pkgLen > 50_000;

    const prev = this.readDepsSnapshotHash(pluginPath);
    const cur = this.computeDepsIntentHash(pluginPath, manifest);
    const hadSnapshot = prev !== null;

    const registryNotes: string[] = [];
    const probe = Object.keys(dependencies).slice(0, 6);
    for (const name of probe) {
      const ok = await npmPackageExistsOnRegistry(name);
      if (!ok) {
        registryNotes.push(
          `${name}: registry HEAD did not return 200 (offline, private scope, or typo)`,
        );
      }
    }

    return {
      manifestName: manifest.name,
      cacheDir: pluginCacheManager.getPluginCacheDir(manifest.name),
      dependencies,
      dependencyCount,
      warnManyDeps: dependencyCount > 25,
      warnLargePackageJson,
      depsChangedSinceLastInstall: hadSnapshot ? prev !== cur : true,
      hadSnapshot,
      registryNotes,
    };
  }

  getPluginResolvedDeps(installedFolderName: string): {
    declared: Record<string, string>;
    resolved: Record<string, string>;
    error?: string;
  } {
    if (!isSafePluginName(installedFolderName)) {
      return { declared: {}, resolved: {}, error: "Invalid plugin name" };
    }

    const pluginPath = this.tryResolvePluginWorkspacePath(installedFolderName);
    if (!pluginPath) {
      return { declared: {}, resolved: {}, error: "Plugin not found" };
    }

    const manifest: PluginManifest = JSON.parse(
      fs.readFileSync(path.join(pluginPath, "manifest.json"), "utf8"),
    );

    const cacheDir = pluginCacheManager.getPluginCacheDir(manifest.name);
    const cachePkg = path.join(cacheDir, "package.json");

    let declared: Record<string, string> = {};
    if (fs.existsSync(cachePkg)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(cachePkg, "utf8")) as {
          dependencies?: Record<string, string>;
        };
        declared = { ...(pkg.dependencies ?? {}) };
      } catch {
        /* ignore */
      }
    }

    const resolved: Record<string, string> = {};
    if (!fs.existsSync(path.join(cacheDir, "node_modules"))) {
      return { declared, resolved };
    }

    try {
      const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
      const out = execFileSync(npmCmd, ["ls", "--json", "--depth=0"], {
        cwd: cacheDir,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      });
      const j = JSON.parse(out) as {
        dependencies?: Record<string, { version?: string }>;
      };
      const depTree = j.dependencies ?? {};
      for (const k of Object.keys(depTree)) {
        const v = depTree[k]?.version;
        if (v) {
          resolved[k] = v;
        }
      }
    } catch (e) {
      return {
        declared,
        resolved,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    return { declared, resolved };
  }

  async runNpmOnPluginCache(
    installedFolderName: string,
    npmArgs: string[],
  ): Promise<{ success: boolean; error?: string; log?: string }> {
    if (!isSafePluginName(installedFolderName)) {
      return { success: false, error: "Invalid plugin name" };
    }

    const pluginPath = this.tryResolvePluginWorkspacePath(installedFolderName);
    if (!pluginPath) {
      return { success: false, error: "Plugin not found" };
    }

    const manifest: PluginManifest = JSON.parse(
      fs.readFileSync(path.join(pluginPath, "manifest.json"), "utf8"),
    );

    pluginCacheManager.ensureRoot();
    try {
      pluginCacheManager.syncPackageJsonToCache(pluginPath, {
        name: manifest.name,
        version: manifest.version,
        dependencies: manifest.dependencies,
      });
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    const cwd = pluginCacheManager.getPluginCacheDir(manifest.name);
    const lines: string[] = [];
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const args = [...npmArgs, "--ignore-scripts", "--no-fund", "--no-audit"];

    return await new Promise((resolve) => {
      const child = spawn(npmCmd, args, {
        cwd,
        env: process.env,
        shell: process.platform === "win32",
      });

      const drain = (chunk: Buffer, isErr: boolean) => {
        const text = chunk.toString();
        for (const line of text.split(/\r?\n/)) {
          if (!line.trim()) {
            continue;
          }
          const msg = isErr ? `[stderr] ${line}` : line;
          lines.push(msg);
          emitPluginProgress({
            op: "npm",
            phase: "log",
            message: msg,
            pluginName: manifest.name,
          });
        }
      };

      child.stdout?.on("data", (c: Buffer) => drain(c, false));
      child.stderr?.on("data", (c: Buffer) => drain(c, true));
      child.on("error", (err: Error) => {
        resolve({ success: false, error: err.message, log: lines.join("\n") });
      });
      child.on("close", (code: number) => {
        if (code === 0) {
          this.writeDepsSnapshot(pluginPath, manifest);
          resolve({ success: true, log: lines.join("\n") });
        } else {
          resolve({
            success: false,
            error: `npm exited with code ${code}`,
            log: lines.join("\n"),
          });
        }
      });
    });
  }

  clearPluginDependencyCache(installedFolderName: string): {
    success: boolean;
    error?: string;
  } {
    if (!isSafePluginName(installedFolderName)) {
      return { success: false, error: "Invalid plugin name" };
    }

    const pluginPath = this.tryResolvePluginWorkspacePath(installedFolderName);
    if (!pluginPath) {
      return { success: false, error: "Plugin not found" };
    }

    try {
      const manifest: PluginManifest = JSON.parse(
        fs.readFileSync(path.join(pluginPath, "manifest.json"), "utf8"),
      );
      if (isSafePluginName(manifest.name)) {
        pluginCacheManager.clearPlugin(manifest.name);
      }
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  getPluginCacheStats(): {
    root: string;
    totalBytes: number;
    plugins: { name: string; bytes: number }[];
  } {
    pluginCacheManager.ensureRoot();
    const root = pluginCacheManager.getRoot();
    const plugins: { name: string; bytes: number }[] = [];

    if (!fs.existsSync(root)) {
      return { root, totalBytes: 0, plugins: [] };
    }

    for (const name of fs.readdirSync(root)) {
      const p = path.join(root, name);
      if (fs.statSync(p).isDirectory()) {
        plugins.push({
          name,
          bytes: pluginCacheManager.getPluginCacheSizeBytes(name),
        });
      }
    }

    const totalBytes = plugins.reduce((acc, x) => acc + x.bytes, 0);
    return { root, totalBytes, plugins };
  }

  clearAllPluginDependencyCaches(): void {
    pluginCacheManager.clearAll();
  }

  /** Plugin IDs that have editable sources (`sources/<id>` or legacy flat). */
  listPluginWorkspaceFolders(): string[] {
    return this.collectUserPluginIds().filter(
      (id) => this.tryResolvePluginWorkspacePath(id) !== null,
    );
  }

  private readonly sourceSkipDirs = new Set([
    "node_modules",
    "dist",
    ".git",
    "bin",
  ]);

  private resolvePluginSourceFile(
    installedFolderName: string,
    relativePath: string,
  ): string {
    if (!isSafePluginName(installedFolderName)) {
      throw new Error("Invalid plugin name");
    }
    if (!isSafeRelativePluginSourcePath(relativePath)) {
      throw new Error("Invalid file path");
    }
    const pluginPath = this.tryResolvePluginWorkspacePath(installedFolderName);
    if (!pluginPath) {
      throw new Error("Plugin not found");
    }
    const abs = path.resolve(pluginPath, relativePath);
    const relToPlugin = path.relative(pluginPath, abs);
    if (relToPlugin.startsWith("..") || path.isAbsolute(relToPlugin)) {
      throw new Error("Path escapes plugin directory");
    }
    return abs;
  }

  /** Epic 4 — list editable source files (excludes node_modules, dist, .git). */
  listPluginSourceFiles(installedFolderName: string): string[] {
    if (!isSafePluginName(installedFolderName)) {
      throw new Error("Invalid plugin name");
    }
    const pluginPath = this.tryResolvePluginWorkspacePath(installedFolderName);
    if (!pluginPath) {
      throw new Error("Plugin not found");
    }
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (this.sourceSkipDirs.has(ent.name)) {
          continue;
        }
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          walk(full);
        } else if (ent.isFile()) {
          const rel = path.relative(pluginPath, full);
          if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
            out.push(rel.split(path.sep).join("/"));
          }
        }
      }
    };
    walk(pluginPath);
    out.sort();
    return out;
  }

  readPluginSourceFile(
    installedFolderName: string,
    relativePath: string,
  ): string {
    const abs = this.resolvePluginSourceFile(installedFolderName, relativePath);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      throw new Error("File not found");
    }
    return fs.readFileSync(abs, "utf8");
  }

  writePluginSourceFile(
    installedFolderName: string,
    relativePath: string,
    content: string,
  ): void {
    if (typeof content !== "string") {
      throw new Error("Invalid content");
    }
    if (content.length > 5_000_000) {
      throw new Error("File too large");
    }
    const abs = this.resolvePluginSourceFile(installedFolderName, relativePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");

    const pluginPath = this.tryResolvePluginWorkspacePath(installedFolderName);
    if (pluginPath) {
      for (const key of [...this.devUiBundleCache.keys()]) {
        if (key.startsWith(`${pluginPath}:`)) {
          this.devUiBundleCache.delete(key);
        }
      }
    }
  }

  mkdirPluginSourceDir(
    installedFolderName: string,
    relativeDir: string,
  ): void {
    if (!isSafeRelativePluginSourcePath(relativeDir)) {
      throw new Error("Invalid directory path");
    }
    const base = this.tryResolvePluginWorkspacePath(installedFolderName);
    if (!base) {
      throw new Error("Plugin not found");
    }
    const abs = path.resolve(base, relativeDir);
    const rel = path.relative(base, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error("Path escapes plugin directory");
    }
    fs.mkdirSync(abs, { recursive: true });
  }

  createPluginSourceFile(
    installedFolderName: string,
    relativePath: string,
    content = "",
  ): void {
    if (!isSafeRelativePluginSourcePath(relativePath)) {
      throw new Error("Invalid file path");
    }
    const abs = this.resolvePluginSourceFile(installedFolderName, relativePath);
    if (fs.existsSync(abs)) {
      throw new Error("File already exists");
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");

    const pluginPath = this.tryResolvePluginWorkspacePath(installedFolderName);
    if (pluginPath) {
      for (const key of [...this.devUiBundleCache.keys()]) {
        if (key.startsWith(`${pluginPath}:`)) {
          this.devUiBundleCache.delete(key);
        }
      }
    }
  }

  deletePluginSourcePath(
    installedFolderName: string,
    relativePath: string,
  ): void {
    if (!isSafeRelativePluginSourcePath(relativePath)) {
      throw new Error("Invalid path");
    }
    const base = this.tryResolvePluginWorkspacePath(installedFolderName);
    if (!base) {
      throw new Error("Plugin not found");
    }
    const abs = path.resolve(base, relativePath);
    const rel = path.relative(base, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") {
      throw new Error("Invalid path");
    }
    if (!fs.existsSync(abs)) {
      throw new Error("Path not found");
    }
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      fs.rmSync(abs, { recursive: true, force: true });
    } else {
      fs.unlinkSync(abs);
    }
    const pluginPath = base;
    for (const key of [...this.devUiBundleCache.keys()]) {
      if (key.startsWith(`${pluginPath}:`)) {
        this.devUiBundleCache.delete(key);
      }
    }
  }

  private invalidateDevUiCacheForWorkspace(workspaceRoot: string): void {
    for (const key of [...this.devUiBundleCache.keys()]) {
      if (key.startsWith(`${workspaceRoot}:`)) {
        this.devUiBundleCache.delete(key);
      }
    }
  }

  /**
   * Copy user-selected files from disk into the plugin workspace (e.g. after a file dialog).
   */
  importExternalFilesIntoWorkspace(
    installedFolderName: string,
    absoluteFilePaths: string[],
    destRelativeBase = "",
  ): { success: boolean; imported?: string[]; error?: string } {
    const base = this.tryResolvePluginWorkspacePath(installedFolderName);
    if (!base) {
      return { success: false, error: "Plugin not found" };
    }
    const normBase = destRelativeBase
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
    if (normBase && !isSafeRelativePluginSourcePath(normBase)) {
      return { success: false, error: "Invalid destination base" };
    }
    const imported: string[] = [];
    for (const fp of absoluteFilePaths) {
      if (typeof fp !== "string" || !path.isAbsolute(fp)) {
        return { success: false, error: "Invalid source path" };
      }
      const resolved = path.resolve(fp);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        return { success: false, error: `Not a file: ${fp}` };
      }
      const bn = path.basename(resolved);
      const rel = normBase ? `${normBase}/${bn}` : bn;
      if (!isSafeRelativePluginSourcePath(rel)) {
        return { success: false, error: `Invalid path: ${rel}` };
      }
      const destAbs = path.join(base, rel);
      const relCheck = path.relative(base, destAbs);
      if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) {
        return { success: false, error: "Path escapes workspace" };
      }
      fs.mkdirSync(path.dirname(destAbs), { recursive: true });
      fs.copyFileSync(resolved, destAbs);
      imported.push(rel.split(path.sep).join("/"));
    }
    this.invalidateDevUiCacheForWorkspace(base);
    return { success: true, imported };
  }

  /**
   * Recursively copy a directory tree into the workspace (skips node_modules, dist, .git, bin).
   */
  importExternalDirectoryIntoWorkspace(
    installedFolderName: string,
    absoluteDir: string,
    destRelativeBase = "",
  ): { success: boolean; imported?: string[]; error?: string } {
    const base = this.tryResolvePluginWorkspacePath(installedFolderName);
    if (!base) {
      return { success: false, error: "Plugin not found" };
    }
    if (typeof absoluteDir !== "string" || !path.isAbsolute(absoluteDir)) {
      return { success: false, error: "Invalid directory path" };
    }
    const rootDir = path.resolve(absoluteDir);
    if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
      return { success: false, error: "Not a directory" };
    }
    const normBase = destRelativeBase
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
    if (normBase && !isSafeRelativePluginSourcePath(normBase)) {
      return { success: false, error: "Invalid destination base" };
    }
    const imported: string[] = [];
    const walk = (dir: string): void => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (this.sourceSkipDirs.has(ent.name)) {
          continue;
        }
        const full = path.join(dir, ent.name);
        const relFromRoot = path.relative(rootDir, full);
        const relDest = normBase
          ? path.join(normBase, relFromRoot)
          : relFromRoot;
        const relPosix = relDest.split(path.sep).join("/");
        if (!isSafeRelativePluginSourcePath(relPosix)) {
          throw new Error(`Invalid path in tree: ${relPosix}`);
        }
        if (ent.isDirectory()) {
          walk(full);
        } else if (ent.isFile()) {
          const destAbs = path.join(base, relPosix);
          const relCheck = path.relative(base, destAbs);
          if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) {
            throw new Error("Path escapes workspace");
          }
          fs.mkdirSync(path.dirname(destAbs), { recursive: true });
          fs.copyFileSync(full, destAbs);
          imported.push(relPosix);
        }
      }
    };
    try {
      walk(rootDir);
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
    this.invalidateDevUiCacheForWorkspace(base);
    return { success: true, imported };
  }

  /**
   * Monaco cannot see ~/.nodex/plugin-cache deps when the workspace has no
   * local node_modules. Register virtual file:// entries under
   * `<workspace>/node_modules/...` backed by cache (or local) package files.
   */
  getIdePluginVirtualTypings(installedFolderName: string): {
    workspaceRootFileUri: string;
    libs: { fileName: string; content: string }[];
  } | null {
    if (!isSafePluginName(installedFolderName)) {
      return null;
    }
    const workspaceRoot = this.tryResolvePluginWorkspacePath(installedFolderName);
    if (!workspaceRoot) {
      return null;
    }

    let manifest: PluginManifest;
    try {
      const raw = fs.readFileSync(
        path.join(workspaceRoot, "manifest.json"),
        "utf8",
      );
      manifest = JSON.parse(raw) as PluginManifest;
    } catch {
      return {
        workspaceRootFileUri: toFileUri(workspaceRoot),
        libs: [],
      };
    }

    const cacheNm = pluginCacheManager.getNodeModulesPath(manifest.name);
    const localNm = path.join(workspaceRoot, "node_modules");

    const seed = new Set<string>();
    try {
      const pkgJsonPath = path.join(workspaceRoot, "package.json");
      if (fs.existsSync(pkgJsonPath)) {
        const pkg = JSON.parse(
          fs.readFileSync(pkgJsonPath, "utf8"),
        ) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        for (const k of Object.keys(pkg.dependencies ?? {})) {
          seed.add(k);
        }
        for (const k of Object.keys(pkg.devDependencies ?? {})) {
          seed.add(k);
        }
      }
    } catch {
      /* optional */
    }
    for (const k of Object.keys(manifest.dependencies ?? {})) {
      seed.add(k);
    }

    const pkgNames = this.collectTransitiveNpmPackageNames(
      seed,
      localNm,
      cacheNm,
      96,
    );
    const libs: { fileName: string; content: string }[] = [];
    const seenUri = new Set<string>();

    for (const name of pkgNames) {
      const physicalRoot = this.resolveNpmPackageRoot(name, localNm, cacheNm);
      if (!physicalRoot) {
        continue;
      }
      const virtualBase = path.join(workspaceRoot, "node_modules", ...name.split("/"));
      const pkgJsonReal = path.join(physicalRoot, "package.json");
      if (fs.existsSync(pkgJsonReal)) {
        const v = path.join(virtualBase, "package.json");
        const u = toFileUri(v);
        if (!seenUri.has(u)) {
          seenUri.add(u);
          libs.push({
            fileName: u,
            content: fs.readFileSync(pkgJsonReal, "utf8"),
          });
        }
      }
      const dtsFiles = new Map<string, string>();
      this.collectDeclarationFilesUnderDir(physicalRoot, dtsFiles, 200);
      for (const [abs, content] of dtsFiles) {
        const rel = path.relative(physicalRoot, abs);
        const virt = path.join(virtualBase, rel);
        const uri = toFileUri(virt);
        if (seenUri.has(uri)) {
          continue;
        }
        seenUri.add(uri);
        libs.push({ fileName: uri, content });
      }
    }

    return {
      workspaceRootFileUri: toFileUri(workspaceRoot),
      libs,
    };
  }

  private resolveNpmPackageRoot(
    name: string,
    localNm: string,
    cacheNm: string,
  ): string | null {
    const parts = name.split("/");
    const tryNm = (nmRoot: string) => {
      const p = path.join(nmRoot, ...parts);
      return fs.existsSync(path.join(p, "package.json")) ? p : null;
    };
    return tryNm(localNm) ?? tryNm(cacheNm);
  }

  private collectTransitiveNpmPackageNames(
    seed: Set<string>,
    localNm: string,
    cacheNm: string,
    maxPackages: number,
  ): string[] {
    const seen = new Set<string>();
    const queue: string[] = [...seed];
    while (queue.length > 0 && seen.size < maxPackages) {
      const name = queue.shift()!;
      if (seen.has(name)) {
        continue;
      }
      const root = this.resolveNpmPackageRoot(name, localNm, cacheNm);
      if (!root) {
        continue;
      }
      seen.add(name);
      try {
        const pkg = JSON.parse(
          fs.readFileSync(path.join(root, "package.json"), "utf8"),
        ) as {
          dependencies?: Record<string, string>;
          peerDependencies?: Record<string, string>;
        };
        const next = {
          ...pkg.dependencies,
          ...pkg.peerDependencies,
        };
        for (const dep of Object.keys(next)) {
          if (!seen.has(dep)) {
            queue.push(dep);
          }
        }
      } catch {
        /* skip */
      }
    }
    return [...seen];
  }

  private collectDeclarationFilesUnderDir(
    dir: string,
    out: Map<string, string>,
    maxFiles: number,
  ): void {
    const walk = (d: string): void => {
      if (out.size >= maxFiles) {
        return;
      }
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        if (out.size >= maxFiles) {
          return;
        }
        if (ent.name === "node_modules") {
          continue;
        }
        const full = path.join(d, ent.name);
        if (ent.isDirectory()) {
          walk(full);
        } else if (/\.d\.(ts|mts|cts)$/.test(ent.name)) {
          try {
            out.set(full, fs.readFileSync(full, "utf8"));
          } catch {
            /* skip */
          }
        }
      }
    };
    walk(dir);
  }

  /** CLI-accurate `tsc`-style check on the plugin workspace (on-disk files). */
  runTypecheckOnPluginWorkspace(installedFolderName: string): {
    success: boolean;
    error?: string;
    diagnostics: TypecheckDiagnostic[];
  } {
    const base = this.tryResolvePluginWorkspacePath(installedFolderName);
    if (!base) {
      return { success: false, error: "Plugin not found", diagnostics: [] };
    }
    let extraTypesRoots: string[] | undefined;
    try {
      const raw = fs.readFileSync(path.join(base, "manifest.json"), "utf8");
      const manifest = JSON.parse(raw) as { name: string };
      const cacheNm = pluginCacheManager.getNodeModulesPath(manifest.name);
      const roots: string[] = [];
      const a = path.join(base, "node_modules", "@types");
      const b = path.join(cacheNm, "@types");
      if (fs.existsSync(a)) {
        roots.push(a);
      }
      if (fs.existsSync(b)) {
        roots.push(b);
      }
      if (roots.length > 0) {
        extraTypesRoots = roots;
      }
    } catch {
      // optional
    }
    return typecheckPluginWorkspace(base, extraTypesRoots);
  }
}
