import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import {
  NodexContributionRegistry,
  type CommandContribution,
  type ModeLineContribution,
  type ModeLineSegmentId,
} from "./nodex-contribution-registry";
import { NodexContributionMenuBridge } from "./NodexContributionMenuBridge";
import { registerNodexCoreContributions } from "./registerNodexCoreContributions";
import { useShellLayoutStore } from "./layout/ShellLayoutContext";
import { exposeDevtoolsShellApi } from "./devtoolsShellExpose";
import { useShellViewRegistry } from "./views/ShellViewContext";
import { ShellViewCommandContributions } from "./views/ShellViewCommandContributions";
import { useShellRegistries } from "./registries/ShellRegistriesContext";
import { postContextUpdateToFrames, type ShellContext, type ShellRpcRequest, type ShellRpcResponse } from "./views/shell-iframe-rpc";

const RegistryContext = createContext<NodexContributionRegistry | null>(null);

export function NodexContributionProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const registry = useMemo(() => new NodexContributionRegistry(), []);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const layoutStore = useShellLayoutStore();
  const viewRegistry = useShellViewRegistry();
  const registries = useShellRegistries();
  const lastCtxRef = React.useRef<ShellContext>({ primary: null });

  // Broadcast a minimal context snapshot to iframes whenever active tab changes.
  useEffect(() => {
    const unsub = registries.tabs.subscribe(() => {
      const a = registries.tabs.getActiveTab();
      const next: ShellContext = {
        primary: a
          ? {
              tabTypeId: a.tabTypeId,
              instanceId: a.instanceId,
              title: a.title,
            }
          : null,
      };
      lastCtxRef.current = next;
      postContextUpdateToFrames(next);
    });
    // Emit once on mount.
    const a = registries.tabs.getActiveTab();
    lastCtxRef.current = {
      primary: a
        ? { tabTypeId: a.tabTypeId, instanceId: a.instanceId, title: a.title }
        : null,
    };
    postContextUpdateToFrames(lastCtxRef.current);
    return unsub;
  }, [registries]);

  useEffect(() => registry.subscribe(() => bump()), [registry]);

  useEffect(() => {
    const disposers = registerNodexCoreContributions(registry, registries);
    return () => {
      for (const d of disposers) {
        d();
      }
    };
  }, [registry]);

  useEffect(() => {
    exposeDevtoolsShellApi({
      registry,
      layout: layoutStore,
      views: viewRegistry,
      registries,
    });
  }, [registry, layoutStore, viewRegistry, registries]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as unknown;
      if (!d || typeof d !== "object") return;
      const req = d as Partial<ShellRpcRequest>;
      if (req.type !== "nodex.shell.rpc" || typeof req.id !== "string" || typeof req.method !== "string") {
        return;
      }
      const reqId = String(req.id);
      const respond = (resp: ShellRpcResponse) => {
        try {
          const src = e.source as unknown as { postMessage?: (m: unknown, targetOrigin: string) => void } | null;
          if (src?.postMessage) {
            src.postMessage(resp, "*");
            return;
          }
          // Fallback: best-effort broadcast (helps when source is null).
          window.postMessage(resp, "*");
        } catch {
          /* ignore */
        }
      };

      if (req.method === "context.get") {
        respond({ type: "nodex.shell.rpc.result", id: reqId, ok: true, value: lastCtxRef.current });
        return;
      }
      if (req.method === "commands.list") {
        respond({ type: "nodex.shell.rpc.result", id: reqId, ok: true, value: registry.listCommands() });
        return;
      }
      if (req.method === "keymap.list") {
        try {
          const shell = (window as unknown as { nodex?: { shell?: unknown } }).nodex?.shell as any;
          const list = shell?.keymap?.list?.();
          respond({ type: "nodex.shell.rpc.result", id: reqId, ok: true, value: Array.isArray(list) ? list : [] });
        } catch {
          respond({ type: "nodex.shell.rpc.result", id: reqId, ok: true, value: [] });
        }
        return;
      }
      if (req.method === "devtools.describe") {
        try {
          const shell = (window as unknown as { nodex?: { shell?: unknown } }).nodex?.shell as any;
          const layout = shell?.layout;
          const commands = shell?.commands;
          const views = shell?.views;
          const appMenu = shell?.appMenu;
          const menuRail = shell?.menuRail;
          const keymap = shell?.keymap;
          const panelMenu = shell?.panelMenu;
          const tabs = shell?.tabs;

          const describeObj = (o: any) =>
            o && typeof o === "object"
              ? Object.keys(o)
                  .sort()
                  .map((k) => ({
                    key: k,
                    type: typeof o[k],
                  }))
              : [];

          respond({
            type: "nodex.shell.rpc.result",
            id: reqId,
            ok: true,
            value: {
              "window.nodex.shell": describeObj(shell),
              "window.nodex.shell.layout": describeObj(layout),
              "window.nodex.shell.commands": describeObj(commands),
              "window.nodex.shell.views": describeObj(views),
              "window.nodex.shell.appMenu": describeObj(appMenu),
              "window.nodex.shell.menuRail": describeObj(menuRail),
              "window.nodex.shell.keymap": describeObj(keymap),
              "window.nodex.shell.panelMenu": describeObj(panelMenu),
              "window.nodex.shell.tabs": describeObj(tabs),
            },
          });
        } catch (err) {
          respond({
            type: "nodex.shell.rpc.result",
            id: reqId,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }
      if (req.method === "commands.invoke") {
        const p = (req as ShellRpcRequest).params as { commandId?: unknown; args?: unknown };
        const commandId = typeof p?.commandId === "string" ? p.commandId : "";
        const args = p?.args && typeof p.args === "object" && !Array.isArray(p.args) ? (p.args as Record<string, unknown>) : undefined;
        if (!commandId) {
          respond({ type: "nodex.shell.rpc.result", id: reqId, ok: false, error: "Missing commandId" });
          return;
        }
        try {
          const out = registry.invokeCommand(commandId, args);
          void Promise.resolve(out)
            .then((v) => respond({ type: "nodex.shell.rpc.result", id: reqId, ok: true, value: v }))
            .catch((err) =>
              respond({
                type: "nodex.shell.rpc.result",
                id: reqId,
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              }),
            );
        } catch (err) {
          respond({
            type: "nodex.shell.rpc.result",
            id: reqId,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [registry]);

  return (
    <RegistryContext.Provider value={registry}>
      {children}
      <ShellViewCommandContributions />
      <NodexContributionMenuBridge />
    </RegistryContext.Provider>
  );
}

export function useNodexContributionRegistry(): NodexContributionRegistry {
  const r = useContext(RegistryContext);
  if (!r) {
    throw new Error("useNodexContributionRegistry requires NodexContributionProvider");
  }
  return r;
}

/** Re-renders when the registry changes. */
export function useNodexCommands(): CommandContribution[] {
  const registry = useNodexContributionRegistry();
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => registry.subscribe(() => tick()), [registry]);
  return registry.listCommands();
}

export function useNodexModeLineSegment(
  segment: ModeLineSegmentId,
): ModeLineContribution[] {
  const registry = useNodexContributionRegistry();
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => registry.subscribe(() => tick()), [registry]);
  return registry.listModeLineForSegment(segment);
}
