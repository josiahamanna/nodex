import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { Note } from "../../../preload";
import { MessageType, PluginMessage } from "../../../shared/plugin-api";
import {
  isPluginUiSnapshotMessage,
  PLUGIN_UI_METADATA_KEY,
  PLUGIN_UI_PROTOCOL_VERSION,
} from "../../../shared/plugin-state-protocol";
import { attachReactToPluginWindow } from "../../../shared/react-bridge";
import { useTheme } from "../../theme/ThemeContext";
import type { AppDispatch } from "../../store";
import {
  saveNoteContent,
  saveNotePluginUiState,
} from "../../store/notesSlice";
import { receiveSnapshot } from "../../store/pluginUiSlice";
import {
  buildIframeThemeCss,
  NODEX_IFRAME_THEME_MESSAGE,
} from "../../theme/iframe-theme";

interface SecurePluginRendererProps {
  note: Note;
}

const BRIDGE_REQUEST = "nodex-request-bridge";
const BRIDGE_READY = "nodex-bridge-ready";

/** DevTools + webpack dev server fetch source maps over http/ws; without connect-src, default-src 'none' blocks them. */
const PLUGIN_IFRAME_CSP_CONNECT_DEV =
  process.env.NODE_ENV === "development"
    ? " connect-src http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* wss://localhost:* wss://127.0.0.1:*"
    : "";

const SecurePluginRenderer: React.FC<SecurePluginRendererProps> = ({
  note,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const noteRef = useRef(note);
  noteRef.current = note;
  const [isReady, setIsReady] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  const [deferDisplay, setDeferDisplay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { resolvedDark } = useTheme();
  const inheritThemeRef = useRef(true);
  const deferDisplayRef = useRef(false);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteContentPersistTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const sendMessageToPlugin = useCallback((message: PluginMessage) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(message, "*");
    }
  }, []);

  const schedulePluginUiPersist = useCallback(
    (noteId: string, state: unknown) => {
      dispatch(receiveSnapshot({ noteId, state }));
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null;
        void dispatch(saveNotePluginUiState({ noteId, state }));
      }, 400);
    },
    [dispatch],
  );

  const scheduleNoteContentPersist = useCallback(
    (noteId: string, content: string) => {
      if (noteContentPersistTimerRef.current) {
        clearTimeout(noteContentPersistTimerRef.current);
      }
      noteContentPersistTimerRef.current = setTimeout(() => {
        noteContentPersistTimerRef.current = null;
        void dispatch(saveNoteContent({ noteId, content }));
      }, 400);
    },
    [dispatch],
  );

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      if (noteContentPersistTimerRef.current) {
        clearTimeout(noteContentPersistTimerRef.current);
        noteContentPersistTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (noteContentPersistTimerRef.current) {
      clearTimeout(noteContentPersistTimerRef.current);
      noteContentPersistTimerRef.current = null;
    }
  }, [note.id]);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const iframeWin = iframeRef.current?.contentWindow;
      if (!iframeWin || event.source !== iframeWin) {
        return;
      }

      if (event.data?.type === BRIDGE_REQUEST) {
        attachReactToPluginWindow(iframeWin);
        iframeWin.postMessage({ type: BRIDGE_READY }, "*");
        return;
      }

      if (isPluginUiSnapshotMessage(event.data)) {
        schedulePluginUiPersist(noteRef.current.id, event.data.state);
        return;
      }

      if (event.data?.type === MessageType.CONTENT_READY) {
        setContentReady(true);
        return;
      }

      if (event.data?.type === MessageType.SAVE_NOTE_CONTENT) {
        const raw = event.data as { content?: unknown };
        if (typeof raw.content === "string") {
          scheduleNoteContentPersist(noteRef.current.id, raw.content);
        }
        return;
      }

      const message: PluginMessage = event.data;

      switch (message.type) {
        case MessageType.READY: {
          setIsReady(true);
          if (!deferDisplayRef.current) {
            setContentReady(true);
          }
          const n = noteRef.current;
          sendMessageToPlugin({
            type: MessageType.RENDER,
            payload: n,
          });
          const ui = n.metadata?.[PLUGIN_UI_METADATA_KEY];
          if (ui !== undefined) {
            sendMessageToPlugin({
              type: MessageType.HYDRATE_PLUGIN_UI,
              payload: {
                v: PLUGIN_UI_PROTOCOL_VERSION,
                state: ui,
              },
            });
          }
          break;
        }

        case MessageType.ACTION:
          console.log("[Plugin Action]", message.payload);
          break;

        default:
          break;
      }
    },
    [scheduleNoteContentPersist, schedulePluginUiPersist, sendMessageToPlugin],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  useEffect(() => {
    if (isReady && iframeRef.current) {
      sendMessageToPlugin({ type: MessageType.UPDATE, payload: note });
    }
  }, [isReady, note, sendMessageToPlugin]);

  const pushThemeToIframe = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !inheritThemeRef.current) {
      return;
    }
    const css = buildIframeThemeCss(true);
    win.postMessage(
      {
        type: NODEX_IFRAME_THEME_MESSAGE,
        css,
        dark: resolvedDark,
      },
      "*",
    );
  }, [resolvedDark]);

  useEffect(() => {
    const onResolved = () => pushThemeToIframe();
    window.addEventListener("nodex-theme-resolved", onResolved);
    return () => window.removeEventListener("nodex-theme-resolved", onResolved);
  }, [pushThemeToIframe]);

  useEffect(() => {
    if (isReady) {
      pushThemeToIframe();
    }
  }, [isReady, pushThemeToIframe]);

  const loadPluginContent = useCallback(async () => {
    const n = noteRef.current;
    try {
      setError(null);
      const htmlContent = await window.Nodex.getPluginHTML(n.type, n);

      if (!htmlContent) {
        setError(`No plugin renderer found for type: ${n.type}`);
        return;
      }

      const meta = await window.Nodex.getPluginRendererUiMeta(n.type);
      const inherit = (meta?.theme ?? "inherit") !== "isolated";
      inheritThemeRef.current = inherit;

      const defer = meta?.deferDisplayUntilContentReady === true;
      deferDisplayRef.current = defer;
      setDeferDisplay(defer);
      setContentReady(false);

      const themeCss = buildIframeThemeCss(inherit);
      const sandboxedHTML = createSandboxedHTML(htmlContent, {
        themeCss,
        dark: resolvedDark,
        inheritTheme: inherit,
        saveNoteContentType: MessageType.SAVE_NOTE_CONTENT,
        pluginUiSnapshotType: MessageType.PLUGIN_UI_SNAPSHOT,
        pluginUiProtocolVersion: PLUGIN_UI_PROTOCOL_VERSION,
      });

      if (iframeRef.current) {
        iframeRef.current.srcdoc = sandboxedHTML;
        setIsReady(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plugin");
    }
  }, [note.id, note.type, resolvedDark]);

  useEffect(() => {
    void loadPluginContent();
  }, [loadPluginContent]);

  useEffect(() => {
    if (!isReady || !deferDisplay || contentReady) {
      return;
    }
    const t = window.setTimeout(() => {
      setContentReady(true);
    }, 15_000);
    return () => window.clearTimeout(t);
  }, [isReady, deferDisplay, contentReady]);

  const showHostLoader = !isReady || (deferDisplay && !contentReady);

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-sm border border-destructive/30 bg-destructive/10 p-4">
          <p className="font-medium text-destructive">Plugin Error</p>
          <p className="mt-2 text-sm text-destructive/90">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 w-full">
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts allow-same-origin"
        className={`h-full w-full border-0 transition-opacity duration-150 ${
          showHostLoader ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        title={`Plugin renderer for ${note.type}`}
      />
      {showHostLoader ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/85 text-muted-foreground backdrop-blur-[1px]"
          aria-busy="true"
          aria-live="polite"
        >
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-muted-foreground"
            aria-hidden
          />
          <span className="text-[12px] font-medium">Loading note…</span>
        </div>
      ) : null}
    </div>
  );
};

function createSandboxedHTML(
  pluginHTML: string,
  opts: {
    themeCss: string;
    dark: boolean;
    inheritTheme: boolean;
    saveNoteContentType: string;
    pluginUiSnapshotType: string;
    pluginUiProtocolVersion: number;
  },
): string {
  const {
    themeCss,
    dark,
    inheritTheme,
    saveNoteContentType,
    pluginUiSnapshotType,
    pluginUiProtocolVersion,
  } = opts;
  const themeStyle =
    inheritTheme && themeCss.length > 0
      ? `<style id="nodex-theme">${escapeForInlineStyle(themeCss)}</style>`
      : "";
  const themeListener = inheritTheme
    ? `
      window.addEventListener('message', function (e) {
        var d = e.data;
        if (!d || d.type !== '${NODEX_IFRAME_THEME_MESSAGE}') return;
        if (typeof d.css === 'string') {
          var el = document.getElementById('nodex-theme');
          if (el) el.textContent = d.css;
        }
        if (d.dark === true) document.documentElement.classList.add('dark');
        else if (d.dark === false) document.documentElement.classList.remove('dark');
      });
    `
    : "";

  return `
<!DOCTYPE html>
<html class="${dark ? "dark" : ""}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline' blob:; img-src data: blob:; font-src data: blob:;${PLUGIN_IFRAME_CSP_CONNECT_DEV}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${themeStyle}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      padding: 1rem;
      background: hsl(var(--background, 0 0% 100%));
      color: hsl(var(--foreground, 222.2 84% 4.9%));
    }
  </style>
</head>
<body>
  <div id="plugin-root"></div>
  <script>
    (function () {
      ${themeListener}
      window.Nodex = window.Nodex || {};
      window.Nodex.postMessage = function (data) {
        window.parent.postMessage({ type: 'action', payload: data }, '*');
      };
      window.Nodex.postPluginUiState = function (state) {
        window.parent.postMessage({
          type: '${pluginUiSnapshotType}',
          v: ${pluginUiProtocolVersion},
          state: state,
        }, '*');
      };
      window.Nodex.notifyDisplayReady = function () {
        try {
          window.parent.postMessage({ type: '${MessageType.CONTENT_READY}' }, '*');
        } catch (e) {}
      };
      window.Nodex.saveNoteContent = function (content) {
        if (typeof content !== 'string') return;
        window.parent.postMessage({ type: '${saveNoteContentType}', content: content }, '*');
      };
      window.Nodex.onMessage = null;
      window.addEventListener('message', function (event) {
        var d = event.data;
        if (d && d.type === '${BRIDGE_READY}') return;
        if (window.Nodex.onMessage) {
          window.Nodex.onMessage(d);
        }
      });
      window.addEventListener('message', function onBridgeReady(ev) {
        if (ev.data && ev.data.type === '${BRIDGE_READY}') {
          window.removeEventListener('message', onBridgeReady);
          try {
            ${pluginHTML}
          } catch (e) {
            console.error('[Plugin]', e);
          }
          window.parent.postMessage({ type: '${MessageType.READY}' }, '*');
        }
      });
      window.parent.postMessage({ type: '${BRIDGE_REQUEST}' }, '*');
    })();
  </script>
</body>
</html>
  `.trim();
}

/** Avoid breaking out of &lt;style&gt; if token file ever contained &lt;/style&gt; */
function escapeForInlineStyle(css: string): string {
  return css.replace(/<\/style/gi, "<\\/style");
}

export default SecurePluginRenderer;
