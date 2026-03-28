// Plugin API - similar to VS Code's extension API
// This defines what plugins can do

export interface PluginContext {
  subscriptions: Disposable[];
}

export interface Disposable {
  dispose(): void;
}

export interface Note {
  id: string;
  type: string;
  title: string;
  content: string;
  metadata?: any;
}

// Message types for iframe communication
export enum MessageType {
  RENDER = "render",
  READY = "ready",
  UPDATE = "update",
  ACTION = "action",
  /** Iframe → host: versioned JSON snapshot for persistence (see plugin-state-protocol.ts). */
  PLUGIN_UI_SNAPSHOT = "plugin_ui_snapshot",
  /** Host → iframe: hydrate from note.metadata.pluginUiState. */
  HYDRATE_PLUGIN_UI = "hydrate_plugin_ui",
}

export interface PluginMessage {
  type: MessageType;
  payload?: any;
}

// Plugin API that will be available to plugins
export interface NodexPluginAPI {
  // Register a renderer for a note type
  registerNoteRenderer(type: string, renderer: NoteRenderer): Disposable;

  // Get current note being rendered
  getNote(): Note | null;
}

export interface NoteRenderer {
  /** HTML (or script body) injected into the sandboxed iframe. May be async when using `getUiBootstrap`. */
  render(note: Note): string | Promise<string>;

  // Optional: Handle messages from the iframe
  onMessage?(message: any): void;
}

// Plugin activation function signature
export type ActivateFunction = (
  context: PluginContext,
  api: NodexPluginAPI,
) => void | Promise<void>;

export interface Plugin {
  activate: ActivateFunction;
  deactivate?: () => void | Promise<void>;
}
