import * as fs from "fs";
import * as path from "path";
import { Registry } from "./registry";
import { validatePluginCode } from "../shared/validators";

const zipHandler = require("./zip-handler");

export interface PluginManifest {
  name: string;
  version?: string;
  main: string;
  description?: string;
}

export interface ModuxAPI {
  ui: {
    registerComponent: (type: string, componentCode: string) => void;
  };
}

export interface Plugin {
  activate?: (modux: ModuxAPI) => void;
  deactivate?: () => void;
}

export class PluginLoader {
  private pluginsDir: string;
  private loadedPlugins: Set<string> = new Set();

  constructor(pluginsDir: string) {
    this.pluginsDir = pluginsDir;
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

    if (!manifest.name || !manifest.main) {
      throw new Error("Invalid manifest: missing name or main field");
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

      // Create plugin API
      const api = {
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
        getNote: () => null, // Will be provided by renderer
      };

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
    registry.clear();
    this.loadAll(registry);
  }

  async importFromZip(zipPath: string, registry: Registry): Promise<void> {
    try {
      const manifestContent = await zipHandler.readFileFromZip(
        zipPath,
        "manifest.json",
      );

      if (!manifestContent) {
        throw new Error("No manifest.json found in zip file");
      }

      const manifest: PluginManifest = JSON.parse(manifestContent);

      if (!manifest.name || !manifest.main) {
        throw new Error("Invalid manifest: missing name or main field");
      }

      const pluginDir = path.join(this.pluginsDir, manifest.name);

      if (fs.existsSync(pluginDir)) {
        throw new Error(
          `Plugin ${manifest.name} already exists. Please remove it first.`,
        );
      }

      fs.mkdirSync(pluginDir, { recursive: true });

      await zipHandler.extractZipToDirectory(zipPath, pluginDir);

      this.loadPlugin(manifest.name, registry);

      console.log(
        `[PluginLoader] Successfully imported plugin: ${manifest.name}`,
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
    const pluginPath = path.join(this.pluginsDir, pluginName);

    if (!fs.existsSync(pluginPath)) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    fs.rmSync(pluginPath, { recursive: true, force: true });
    this.loadedPlugins.delete(pluginName);

    this.reload(registry);

    console.log(`[PluginLoader] Uninstalled plugin: ${pluginName}`);
  }
}
