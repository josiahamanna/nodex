import { execFileSync, spawn } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Registry } from "./registry";
import { isSafePluginName } from "../shared/validators";
import { manifestValidator } from "./manifest-validator";
import { packageManager } from "./package-manager";
import { pluginCacheManager } from "./plugin-cache-manager";
import { npmPackageExistsOnRegistry } from "./npm-registry-stub";
import { emitPluginProgress } from "./plugin-progress";
import { pluginBundler } from "./plugin-bundler";

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
  private pluginsDir: string;
  private loadedPlugins: Set<string> = new Set();
  private devUiBundleCache: Map<string, { mtime: number; code: string }> =
    new Map();
  private loadIssues: { folder: string; error: string }[] = [];

  constructor(pluginsDir: string) {
    this.pluginsDir = pluginsDir;
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

    if (!fs.existsSync(this.pluginsDir)) {
      console.log(
        `[PluginLoader] Plugins directory not found: ${this.pluginsDir}`,
      );
      fs.mkdirSync(this.pluginsDir, { recursive: true });
      return;
    }

    const pluginFolders = fs.readdirSync(this.pluginsDir);

    for (const folder of pluginFolders) {
      try {
        this.loadPlugin(folder, registry);
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        console.error(`[PluginLoader] Failed to load plugin ${folder}:`, error);
        this.loadIssues.push({ folder, error: msg });
      }
    }
  }

  getPluginLoadIssues(): { folder: string; error: string }[] {
    return [...this.loadIssues];
  }

  private loadPlugin(folder: string, registry: Registry): void {
    const pluginPath = path.join(this.pluginsDir, folder);
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

    const mainFile = path.join(pluginPath, manifest.main);

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
        getUiBootstrap?: () => string;
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
        api.getUiBootstrap = () => {
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
              code = pluginBundler.bundleUiForDevIframe(
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

      const pluginDir = path.join(this.pluginsDir, packageInfo.name);

      if (fs.existsSync(pluginDir)) {
        throw new Error(
          `Plugin ${packageInfo.name} already exists. Please remove it first.`,
        );
      }

      fs.mkdirSync(pluginDir, { recursive: true });

      // Extract package
      await packageManager.extractPackage(zipPath, pluginDir);

      // Load plugin
      this.loadPlugin(packageInfo.name, registry);

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

    const pluginPath = path.join(this.pluginsDir, pluginName);

    if (!fs.existsSync(pluginPath)) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    fs.rmSync(pluginPath, { recursive: true, force: true });
    this.loadedPlugins.delete(pluginName);

    this.reload(registry);

    console.log(`[PluginLoader] Uninstalled plugin: ${pluginName}`);
  }

  async exportPluginAsDev(
    pluginName: string,
    outputDir: string,
  ): Promise<string> {
    if (!isSafePluginName(pluginName)) {
      throw new Error("Invalid plugin name");
    }

    const pluginPath = path.join(this.pluginsDir, pluginName);

    if (!fs.existsSync(pluginPath)) {
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

    const pluginPath = path.join(this.pluginsDir, pluginName);

    if (!fs.existsSync(pluginPath)) {
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

    const pluginPath = path.join(this.pluginsDir, pluginName);

    if (!fs.existsSync(pluginPath)) {
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
      const staging = fs.mkdtempSync(path.join(os.tmpdir(), "nodex-prod-"));
      try {
        const distStaging = path.join(staging, "dist");
        const result = await pluginBundler.bundle(pluginPath, {
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

        this.copyPluginProductionAssets(pluginPath, staging, manifest);

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

    const pluginPath = path.join(this.pluginsDir, pluginName);
    if (!fs.existsSync(pluginPath)) {
      return { success: false, error: `Plugin ${pluginName} not found` };
    }

    const man = JSON.parse(
      fs.readFileSync(path.join(pluginPath, "manifest.json"), "utf8"),
    ) as PluginManifest;

    emitPluginProgress({
      op: "bundle",
      phase: "start",
      message: `Bundle to dist/: ${man.name}`,
      pluginName: man.name,
    });

    const result = await pluginBundler.bundle(pluginPath, {
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

    emitPluginProgress({
      op: "bundle",
      phase: "done",
      message: `Bundled ${man.name}`,
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

    const pluginPath = path.join(this.pluginsDir, pluginName);
    if (!fs.existsSync(pluginPath)) {
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

    const pluginPath = path.join(this.pluginsDir, installedFolderName);
    if (!fs.existsSync(pluginPath)) {
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

    const pluginPath = path.join(this.pluginsDir, installedFolderName);
    if (!fs.existsSync(pluginPath)) {
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

    const pluginPath = path.join(this.pluginsDir, installedFolderName);
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

    const pluginPath = path.join(this.pluginsDir, installedFolderName);
    if (!fs.existsSync(pluginPath)) {
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
}
