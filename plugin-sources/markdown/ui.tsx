import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import DOMPurify from "dompurify";
import { marked } from "marked";

type ViewMode = "edit" | "preview" | "split";

interface NotePayload {
  id: string;
  type: string;
  title: string;
  content: string;
  metadata?: unknown;
}

declare global {
  interface Window {
    __NODEX_NOTE__?: NotePayload;
    Nodex: {
      postMessage: (data: unknown) => void;
      onMessage:
        | ((msg: { type: string; payload?: NotePayload }) => void)
        | null;
    };
  }
}

function sanitizeMarkdownHtml(markdown: string): string {
  const raw = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}

const previewStyles = `
  .nodex-md-preview { color: #374151; line-height: 1.75; }
  .nodex-md-preview h1 { font-size: 2rem; font-weight: 700; margin: 1.25rem 0 0.75rem; color: #111827; }
  .nodex-md-preview h2 { font-size: 1.5rem; font-weight: 700; margin: 1.5rem 0 0.75rem; color: #1f2937; }
  .nodex-md-preview h3 { font-size: 1.25rem; font-weight: 600; margin: 1.25rem 0 0.5rem; color: #1f2937; }
  .nodex-md-preview p { margin: 0 0 1rem; }
  .nodex-md-preview ul, .nodex-md-preview ol { margin: 0 0 1rem 1.5rem; }
  .nodex-md-preview li { margin-bottom: 0.35rem; }
  .nodex-md-preview code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.875em; background: #f3f4f6; padding: 0.15em 0.35em; border-radius: 4px; }
  .nodex-md-preview pre { background: #1f2937; color: #f9fafb; padding: 1rem; border-radius: 8px; overflow: auto; margin: 0 0 1rem; }
  .nodex-md-preview pre code { background: transparent; padding: 0; color: inherit; }
  .nodex-md-preview blockquote { border-left: 4px solid #d1d5db; margin: 0 0 1rem; padding-left: 1rem; color: #6b7280; }
  .nodex-md-preview a { color: #2563eb; }
  .nodex-md-preview hr { border: 0; border-top: 1px solid #e5e7eb; margin: 1.5rem 0; }
  .nodex-md-preview table { border-collapse: collapse; width: 100%; margin: 0 0 1rem; font-size: 0.9375rem; }
  .nodex-md-preview th, .nodex-md-preview td { border: 1px solid #e5e7eb; padding: 0.5rem 0.75rem; text-align: left; }
  .nodex-md-preview th { background: #f9fafb; font-weight: 600; }
`;

function App() {
  const initial =
    typeof window !== "undefined" && window.__NODEX_NOTE__
      ? window.__NODEX_NOTE__.content
      : "";
  const initial__ = "#Jehu"
  const [content, setContent] = useState(initial__);
  const [mode, setMode] = useState<ViewMode>("split");

  useEffect(() => {
    window.Nodex.onMessage = (message) => {
      if (message.type === "update" || message.type === "render") {
        const payload = message.payload;
        if (payload) {
          window.__NODEX_NOTE__ = payload;
          setContent(payload.content ?? "");
        }
      }
    };
  }, []);

  const previewHtml = useMemo(() => sanitizeMarkdownHtml(content), [content]);

  const textareaBase = {
    width: "100%" as const,
    minHeight: "12rem" as const,
    padding: "0.75rem",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "0.875rem",
    lineHeight: 1.5,
    border: "1px solid #e5e7eb",
    borderRadius: "6px",
    resize: "none" as const,
    boxSizing: "border-box" as const,
  };

  const editPane = (grow: boolean) => (
    <textarea
      value={content}
      onChange={(e) => setContent(e.target.value)}
      spellCheck={false}
      style={{
        ...textareaBase,
        ...(grow
          ? { flex: 1, minHeight: 0, height: "100%" }
          : { minHeight: "calc(100vh - 6rem)" }),
      }}
    />
  );

  const previewPane = (grow: boolean) => (
    <div
      className="nodex-md-preview"
      style={{
        padding: "0.75rem",
        overflow: "auto",
        ...(grow
          ? { flex: 1, minHeight: 0 }
          : { minHeight: "calc(100vh - 6rem)" }),
      }}
      dangerouslySetInnerHTML={{ __html: previewHtml }}
    />
  );

  const toolbar = (
    <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.75rem" }}>
      {(["edit", "preview", "split"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          style={{
            padding: "0.35rem 0.75rem",
            borderRadius: "6px",
            border: "1px solid #d1d5db",
            background: mode === m ? "#111827" : "#fff",
            color: mode === m ? "#fff" : "#374151",
            cursor: "pointer",
            fontSize: "0.8125rem",
            textTransform: "capitalize",
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <style>{previewStyles}</style>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "calc(100vh - 2rem)",
          boxSizing: "border-box",
        }}
      >
        {toolbar}
        {mode === "edit" && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            {editPane(false)}
          </div>
        )}
        {mode === "preview" && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            {previewPane(false)}
          </div>
        )}
        {mode === "split" && (
          <div
            style={{
              display: "flex",
              flex: 1,
              gap: "0.75rem",
              minHeight: 0,
              flexWrap: "wrap",
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                flex: "1 1 280px",
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                minHeight: "min(50vh, 20rem)",
              }}
            >
              {editPane(true)}
            </div>
            <div
              style={{
                flex: "1 1 280px",
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                minHeight: "min(50vh, 20rem)",
              }}
            >
              {previewPane(true)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const mountEl = document.getElementById("plugin-root");
if (mountEl) {
  const root = createRoot(mountEl);
  root.render(<App />);
}
