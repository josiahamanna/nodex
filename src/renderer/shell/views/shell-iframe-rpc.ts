export type ShellContext = {
  primary: {
    tabTypeId: string;
    instanceId: string;
    title?: string;
    noteId?: string;
    noteType?: string;
    metadata?: Record<string, unknown>;
  } | null;
};

export type ShellRpcRequest =
  | {
      type: "nodex.shell.rpc";
      id: string;
      method: "commands.invoke" | "context.get";
      params: unknown;
    };

export type ShellRpcResponse = {
  type: "nodex.shell.rpc.result";
  id: string;
  ok: boolean;
  value?: unknown;
  error?: string;
};

export function postContextUpdateToFrames(ctx: ShellContext): void {
  if (typeof document === "undefined") return;
  const frames = document.querySelectorAll("iframe[data-nodex-view-id]");
  for (const f of frames) {
    const win = (f as HTMLIFrameElement).contentWindow;
    if (!win) continue;
    try {
      win.postMessage(
        { type: "nodex.context.update", payload: ctx },
        "*",
      );
    } catch {
      /* ignore */
    }
  }
}

