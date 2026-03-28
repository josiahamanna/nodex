import React, { useCallback, useEffect, useRef, useState } from "react";
import { Note } from "../../../preload";
import { MessageType, PluginMessage } from "../../../shared/plugin-api";
import { attachReactToPluginWindow } from "../../../shared/react-bridge";
import { useTheme } from "../../theme/ThemeContext";
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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const noteRef = useRef(note);
  noteRef.current = note;
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { resolvedDark } = useTheme();
  const inheritThemeRef = useRef(true);

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

      const message: PluginMessage = event.data;

      switch (message.type) {
        case MessageType.READY:
          setIsReady(true);
          sendMessageToPlugin({
            type: MessageType.RENDER,
            payload: noteRef.current,
          });
          break;

        case MessageType.ACTION:
          console.log("[Plugin Action]", message.payload);
          break;

        default:
          break;
      }
    },
    [],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  useEffect(() => {
    if (isReady && iframeRef.current) {
      sendMessageToPlugin({ type: MessageType.UPDATE, payload: note });
    }
  }, [isReady, note]);

  const sendMessageToPlugin = (message: PluginMessage) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(message, "*");
    }
  };

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

      const themeCss = buildIframeThemeCss(inherit);
      const sandboxedHTML = createSandboxedHTML(htmlContent, {
        themeCss,
        dark: resolvedDark,
        inheritTheme: inherit,
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
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts allow-same-origin"
      className="h-full w-full border-0"
      title={`Plugin renderer for ${note.type}`}
    />
  );
};

function createSandboxedHTML(
  pluginHTML: string,
  opts: {
    themeCss: string;
    dark: boolean;
    inheritTheme: boolean;
  },
): string {
  const { themeCss, dark, inheritTheme } = opts;
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
