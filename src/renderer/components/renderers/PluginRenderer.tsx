import React, { useEffect, useState, useRef } from "react";
import DOMPurify from "dompurify";
import { Note } from "../../../preload";

interface PluginRendererProps {
  note: Note;
}

const PluginRenderer: React.FC<PluginRendererProps> = ({ note }) => {
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const renderWithPlugin = async () => {
      try {
        const componentCode = await window.Nodex.getComponent(note.type);

        if (!componentCode) {
          setError(`No plugin found for type: ${note.type}`);
          return;
        }

        const renderFn = new Function("note", componentCode);
        const result = renderFn(note);

        const sanitized = DOMPurify.sanitize(result, {
          ALLOWED_TAGS: [
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "p",
            "br",
            "strong",
            "em",
            "ul",
            "ol",
            "li",
            "code",
            "pre",
            "blockquote",
            "a",
            "div",
            "span",
          ],
          ALLOWED_ATTR: ["class", "style", "href"],
          ALLOW_DATA_ATTR: false,
        });

        setHtml(sanitized);
        setError(null);
      } catch (err) {
        console.error("Plugin rendering error:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    };

    renderWithPlugin();
  }, [note]);

  useEffect(() => {
    if (containerRef.current && html) {
      containerRef.current.innerHTML = html;
    }
  }, [html]);

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-bold mb-2">Plugin Error</h3>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="prose max-w-none">
        <div ref={containerRef} />
      </div>
    </div>
  );
};

export default PluginRenderer;
