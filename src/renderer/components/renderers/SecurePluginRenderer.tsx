import React, { useEffect, useRef, useState } from "react";
import { Note } from "../../../preload";
import { MessageType, PluginMessage } from "../../../shared/plugin-api";
import { attachReactToPluginWindow } from "../../../shared/react-bridge";

interface SecurePluginRendererProps {
  note: Note;
}

const BRIDGE_REQUEST = "nodex-request-bridge";
const BRIDGE_READY = "nodex-bridge-ready";

const SecurePluginRenderer: React.FC<SecurePluginRendererProps> = ({
  note,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
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
          sendMessageToPlugin({ type: MessageType.RENDER, payload: note });
          break;

        case MessageType.ACTION:
          console.log("[Plugin Action]", message.payload);
          break;

        default:
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [note]);

  useEffect(() => {
    if (isReady && iframeRef.current) {
      sendMessageToPlugin({ type: MessageType.UPDATE, payload: note });
    }
  }, [note, isReady]);

  const sendMessageToPlugin = (message: PluginMessage) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(message, "*");
    }
  };

  const loadPluginContent = async () => {
    try {
      const htmlContent = await window.Nodex.getPluginHTML(note.type, note);

      if (!htmlContent) {
        setError(`No plugin renderer found for type: ${note.type}`);
        return;
      }

      const sandboxedHTML = createSandboxedHTML(htmlContent);

      if (iframeRef.current) {
        iframeRef.current.srcdoc = sandboxedHTML;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plugin");
    }
  };

  useEffect(() => {
    loadPluginContent();
  }, [note.type]);

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium">Plugin Error</p>
          <p className="text-sm text-red-600 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts allow-same-origin"
      className="w-full h-full border-0"
      title={`Plugin renderer for ${note.type}`}
    />
  );
};

function createSandboxedHTML(pluginHTML: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline' blob:; img-src data: blob:; font-src data: blob:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      padding: 1rem;
    }
  </style>
</head>
<body>
  <div id="plugin-root"></div>
  <script>
    (function () {
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

export default SecurePluginRenderer;
