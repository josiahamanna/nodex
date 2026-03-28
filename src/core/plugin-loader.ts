import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Registry } from "./registry";
import { isSafePluginName } from "../shared/validators";
import { manifestValidator } from "./manifest-validator";
import { packageManager } from "./package-manager";
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

  constructor(pluginsDir: string) {
    this.pluginsDir = pluginsDir;
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
        console.error(`[PluginLoader] Failed to load plugin ${folder}:`, error);
      }
    }
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

    // Validate manifest
    const validationResult = manifestValidator.validate(manifest);
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

    const mainFile = path.join(pluginPath, manifest.main);

    if (!fs.existsSync(mainFile)) {
      console.error(`[PluginLoader] Main file not found: ${mainFile}`);
      return;
    }

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
            const code = pluginBundler.bundleUiForDevIframe(
              pluginPath,
              manifest.ui!,
              false,
            );
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
      console.error(
        `[PluginLoader] Failed to load plugin ${manifest.name}:`,
        error,
      );
    }
  }

  reload(registry: Registry): void {
    this.loadedPlugins.clear();
    this.devUiBundleCache.clear();
    registry.clear();
    this.loadAll(registry);
  }

  async importFromZip(zipPath: string, registry: Registry): Promise<void> {
    try {
      // Validate package first
      const validation = await packageManager.validatePackage(zipPath);
      if (!validation.valid) {
        throw new Error(`Invalid package: ${validation.errors.join(", ")}`);
      }

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
    } catch (error) {
      console.error("[PluginLoader] Failed to import plugin from zip:", error);
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

    const packagePath = await packageManager.createDevPackage({
      pluginPath,
      outputPath: outputDir,
      mode: "development",
    });

    console.log(
      `[PluginLoader] Exported ${pluginName} as dev package: ${packagePath}`,
    );

    return packagePath;
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

    if (manifest.mode === "production") {
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

    if (manifest.mode === "development") {
      const staging = fs.mkdtempSync(path.join(os.tmpdir(), "nodex-prod-"));
      try {
        const distStaging = path.join(staging, "dist");
        const result = await pluginBundler.bundle(pluginPath, {
          distDir: distStaging,
          minify: true,
          sourcemap: true,
          onProgress: (m) =>
            console.log(`[PluginLoader] Bundle: ${m}`),
        });

        if (!result.success) {
          throw new Error(result.errors.join("\n"));
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
        return packagePath;
      } finally {
        fs.rmSync(staging, { recursive: true, force: true });
      }
    }

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

    const result = await pluginBundler.bundle(pluginPath, {
      minify: false,
      sourcemap: true,
      onProgress: (m) => console.log(`[PluginLoader] Bundle: ${m}`),
    });

    if (!result.success) {
      return {
        success: false,
        error: result.errors.join("\n"),
        warnings: result.warnings,
      };
    }

    return { success: true, warnings: result.warnings };
  }
}
