import React, { useEffect, useRef, useState } from 'react';
import { Note } from '../../../preload';
import { MessageType, PluginMessage } from '../../../shared/plugin-api';

interface SecurePluginRendererProps {
  note: Note;
}

const SecurePluginRenderer: React.FC<SecurePluginRendererProps> = ({ note }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Security: Verify origin if needed
      // For now, we trust messages from our own iframes
      
      const message: PluginMessage = event.data;
      
      switch (message.type) {
        case MessageType.READY:
          setIsReady(true);
          // Send initial note data
          sendMessageToPlugin({ type: MessageType.RENDER, payload: note });
          break;
          
        case MessageType.ACTION:
          // Handle actions from plugin (e.g., edit note, navigate, etc.)
          console.log('[Plugin Action]', message.payload);
          break;
          
        default:
          console.warn('[Unknown message type]', message);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [note]);

  useEffect(() => {
    if (isReady && iframeRef.current) {
      sendMessageToPlugin({ type: MessageType.UPDATE, payload: note });
    }
  }, [note, isReady]);

  const sendMessageToPlugin = (message: PluginMessage) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(message, '*');
    }
  };

  const loadPluginContent = async () => {
    try {
      const htmlContent = await window.modux.getPluginHTML(note.type, note);
      
      if (!htmlContent) {
        setError(`No plugin renderer found for type: ${note.type}`);
        return;
      }

      // Create sandboxed HTML document
      const sandboxedHTML = createSandboxedHTML(htmlContent);
      
      if (iframeRef.current) {
        iframeRef.current.srcdoc = sandboxedHTML;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plugin');
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
      sandbox="allow-scripts"
      className="w-full h-full border-0"
      title={`Plugin renderer for ${note.type}`}
    />
  );
};

function createSandboxedHTML(pluginHTML: string): string {
  // Create a secure HTML document with strict CSP
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      padding: 1rem;
    }
  </style>
</head>
<body>
  <div id="plugin-root"></div>
  <script>
    // Plugin communication API
    const modux = {
      postMessage: (data) => {
        window.parent.postMessage({ type: 'action', payload: data }, '*');
      },
      onMessage: null
    };

    // Listen for messages from parent
    window.addEventListener('message', (event) => {
      if (modux.onMessage) {
        modux.onMessage(event.data);
      }
    });

    // Notify parent that iframe is ready
    window.parent.postMessage({ type: 'ready' }, '*');

    // Plugin content will be injected here
    ${pluginHTML}
  </script>
</body>
</html>
  `.trim();
}

export default SecurePluginRenderer;
