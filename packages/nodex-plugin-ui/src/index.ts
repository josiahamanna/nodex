import { useEffect, useMemo } from "react";

/** Note payload sent with host `render` / `update` messages. */
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

/** Subset of `window.Nodex` exposed to UI bundles (host injects the rest). */
export interface NodexIframeApi {
  postMessage: (data: unknown) => void;
  postPluginUiState?: (state: unknown) => void;
  notifyDisplayReady?: () => void;
  /** Persist note `content` for the open note (host debounces IPC). */
  saveNoteContent?: (content: string) => void;
  onMessage: ((msg: HostToPluginMessage) => void) | null;
}

declare global {
  interface Window {
    Nodex: NodexIframeApi;
  }
}

export function getNodexIframeApi(): NodexIframeApi | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.Nodex;
}

/**
 * Stable handles for host bridge calls (postMessage, persisted UI state, display-ready).
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
 * Registers `window.Nodex.onMessage` for host → iframe protocol.
 */
export function useNodexHostMessages(options: UseNodexHostMessagesOptions): void {
  const { onHydratePluginUi, onNotePayload } = options;

  useEffect(() => {
    window.Nodex.onMessage = (message: HostToPluginMessage) => {
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
      window.Nodex.onMessage = null;
    };
  }, [onHydratePluginUi, onNotePayload]);
}

export interface UseNotifyDisplayReadyOptions {
  /** When false, does not post (e.g. wait until TipTap `editor` exists). Default true. */
  enabled?: boolean;
}

/**
 * After two animation frames, tells the host to hide the loading overlay when
 * `deferDisplayUntilContentReady` is set in the plugin manifest.
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
        window.Nodex?.notifyDisplayReady?.();
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [enabled]);
}
