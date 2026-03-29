export type PluginThemeMode = "inherit" | "isolated";

export interface PluginRenderer {
  pluginName: string;
  render: (note: any) => string | Promise<string>;
  onMessage?: (message: any) => void;
  /** Iframe UI: inherit host CSS variables vs isolated styling */
  theme?: PluginThemeMode;
  designSystemVersion?: string;
  /** When true, host overlay until iframe posts `content_ready`. */
  deferDisplayUntilContentReady?: boolean;
}

export class Registry {
  private components: Map<string, string> = new Map();
  private renderers: Map<string, PluginRenderer> = new Map();

  // Legacy method for old plugin system
  register(type: string, componentCode: string): void {
    this.components.set(type, componentCode);
    console.log(`[Registry] Registered component: ${type}`);
  }

  // New method for secure plugin system
  registerRenderer(
    pluginName: string,
    type: string,
    renderer: any,
    uiMeta?: {
      theme?: PluginThemeMode;
      designSystemVersion?: string;
      deferDisplayUntilContentReady?: boolean;
    },
  ): void {
    this.renderers.set(type, {
      pluginName,
      render: renderer.render,
      onMessage: renderer.onMessage,
      theme: uiMeta?.theme ?? "inherit",
      designSystemVersion: uiMeta?.designSystemVersion,
      deferDisplayUntilContentReady: uiMeta?.deferDisplayUntilContentReady,
    });
    console.log(
      `[Registry] Registered renderer: ${type} (plugin: ${pluginName})`,
    );
  }

  unregisterRenderer(pluginName: string, type: string): void {
    const renderer = this.renderers.get(type);
    if (renderer && renderer.pluginName === pluginName) {
      this.renderers.delete(type);
      console.log(`[Registry] Unregistered renderer: ${type}`);
    }
  }

  getRenderer(type: string): PluginRenderer | null {
    return this.renderers.get(type) || null;
  }

  getComponent(type: string): string | null {
    return this.components.get(type) || null;
  }

  getRegisteredTypes(): string[] {
    // Combine both old and new systems
    const types = new Set([
      ...this.components.keys(),
      ...this.renderers.keys(),
    ]);
    return Array.from(types);
  }

  clear(): void {
    this.components.clear();
    this.renderers.clear();
  }
}

export const registry = new Registry();
