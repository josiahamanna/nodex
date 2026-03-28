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
  // Return HTML content to render in sandboxed iframe
  render(note: Note): string;

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
