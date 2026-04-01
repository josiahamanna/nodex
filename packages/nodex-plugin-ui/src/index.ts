import type { ComponentType } from "react";
import { useEffect, useMemo } from "react";
import type { NodexRendererApi } from "../../../src/shared/nodex-renderer-api";
import type { PluginHostCapabilities, MediatedFetch } from "../../../src/shared/plugin-host-capabilities";
import type { PluginBundleManifestEntry, PluginBundleIndex } from "../../../src/shared/plugin-bundle-manifest";

export type { PluginHostCapabilities, MediatedFetch };
export type { PluginBundleManifestEntry, PluginBundleIndex };

/** Host shell widget slot ids (see `ShellWidgetSlotRegistry` in the app). */
export type ShellSlotId =
  | "rail"
  | "primarySidebarChrome"
  | "mainAreaChrome"
  | "secondaryAreaChrome"
  | "bottomAreaChrome"
  | "noteEditorChrome";

/** Declarative command metadata (host registers into NodexContributionRegistry). */
export type PluginCommandContribution = {
  id: string;
  title: string;
  category?: string;
  doc?: string | null;
  sourcePluginId?: string | null;
};

/**
 * Declarative plugin module (trusted bundle or SES-evaluated CJS).
 * UI slots map to shell regions / note surface; non-UI fields describe commands and note types.
 */
export type PluginModuleDefinition = {
  id: string;
  version?: string;
  slots?: Partial<Record<ShellSlotId, ComponentType<Record<string, unknown>>>>;
  commands?: PluginCommandContribution[];
  /** Note type strings this plugin contributes (registry integration is host-specific). */
  noteTypes?: string[];
};

export function definePlugin(def: PluginModuleDefinition): PluginModuleDefinition {
  return def;
}

/** Full `window.Nodex` for first-party React plugins (no iframe sandbox). */
export function useHostNodex(): NodexRendererApi {
  return useMemo(() => {
    if (typeof window === "undefined") {
      throw new Error("useHostNodex requires a browser environment");
    }
    return window.Nodex;
  }, []);
}

/** Note payload sent with host `render` / `update` messages (legacy iframe protocol). */
export interface NotePayload {
  id: string;
  type: string;
  title: string;
  content: string;
  metadata?: unknown;
}

export type HostToPluginMessage =
  | { type: "render" | "update"; payload?: NotePayload }
  | { type: "hydrate_plugin_ui"; payload?: { v: number; state: unknown } };

/**
 * @deprecated Legacy iframe bridge — use {@link useHostNodex} and React hosts.
 */
export interface NodexIframeApi {
  postMessage: (data: unknown) => void;
  postPluginUiState?: (state: unknown) => void;
  notifyDisplayReady?: () => void;
  saveNoteContent?: (content: string) => void;
  onMessage: ((msg: HostToPluginMessage) => void) | null;
}

declare global {
  interface Window {
    /** Full API; iframe bridge historically used a narrower shape. */
    Nodex: NodexRendererApi;
  }
}

/**
 * @deprecated Legacy iframe helper.
 */
export function getNodexIframeApi(): NodexIframeApi | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.Nodex as unknown as NodexIframeApi;
}

/**
 * @deprecated Legacy iframe bridge.
 */
export function useNodexIframeApi(): {
  postMessage: (data: unknown) => void;
  postPluginUiState: (state: unknown) => void;
  notifyDisplayReady: () => void;
  saveNoteContent: (content: string) => void;
} {
  return useMemo(
    () => ({
      postMessage: (data: unknown) => {
        window.Nodex?.postMessage?.(data);
      },
      postPluginUiState: (state: unknown) => {
        window.Nodex?.postPluginUiState?.(state);
      },
      notifyDisplayReady: () => {
        window.Nodex?.notifyDisplayReady?.();
      },
      saveNoteContent: (content: string) => {
        window.Nodex?.saveNoteContent?.(content);
      },
    }),
    [],
  );
}

export interface UseNodexHostMessagesOptions {
  onHydratePluginUi?: (state: unknown) => void;
  onNotePayload?: (payload: NotePayload) => void;
}

/**
 * @deprecated Legacy iframe protocol — prefer direct React props / hooks.
 */
export function useNodexHostMessages(options: UseNodexHostMessagesOptions): void {
  const { onHydratePluginUi, onNotePayload } = options;

  useEffect(() => {
    const iframeApi = window.Nodex as unknown as NodexIframeApi;
    iframeApi.onMessage = (message: HostToPluginMessage) => {
      if (message.type === "hydrate_plugin_ui") {
        const p = message.payload;
        if (p && typeof p === "object" && "state" in p) {
          onHydratePluginUi?.(p.state);
        }
        return;
      }
      if (message.type === "update" || message.type === "render") {
        const payload = message.payload;
        if (payload) {
          onNotePayload?.(payload);
        }
      }
    };
    return () => {
      iframeApi.onMessage = null;
    };
  }, [onHydratePluginUi, onNotePayload]);
}

export interface UseNotifyDisplayReadyOptions {
  enabled?: boolean;
}

/**
 * @deprecated Legacy iframe display gate.
 */
export function useNotifyDisplayReady(options?: UseNotifyDisplayReadyOptions): void {
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        (window.Nodex as unknown as NodexIframeApi)?.notifyDisplayReady?.();
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [enabled]);
}
