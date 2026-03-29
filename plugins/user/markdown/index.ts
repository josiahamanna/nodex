/** Hybrid plugin: Node main + ui.tsx bundled for the sandboxed iframe. */

interface PluginContext {
  subscriptions: { dispose?: () => void }[];
}

interface Note {
  id: string;
  type: string;
  title: string;
  content: string;
  metadata?: unknown;
}

interface PluginApi {
  getUiBootstrap?: () => Promise<string>;
  registerNoteRenderer: (
    type: string,
    renderer: {
      render: (note: Note) => string | Promise<string>;
    },
  ) => { dispose: () => void };
}

export function activate(context: PluginContext, api: PluginApi): void {
  if (typeof api.getUiBootstrap !== "function") {
    throw new Error(
      "[markdown] Manifest must declare ui (hybrid plugin) for this loader.",
    );
  }

  const register = (type: string) =>
    api.registerNoteRenderer(type, {
      render: async (note: Note) => {
        const ui = await api.getUiBootstrap!();
        return `
        window.__NODEX_NOTE__ = ${JSON.stringify(note)};
        ${ui}
      `;
      },
    });

  context.subscriptions.push(register("markdown"));
  context.subscriptions.push(register("root"));
  console.log("[Plugin: markdown] Activated (markdown + root)");
}

export function deactivate(): void {
  console.log("[Plugin: markdown] Deactivated");
}
