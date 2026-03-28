import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { Editor } from "@tiptap/core";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

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

function MenuBar({ editor }: { editor: Editor | null }) {
  if (!editor) {
    return null;
  }

  const items: [string, () => void, () => boolean][] = [
    [
      "Bold",
      () => editor.chain().focus().toggleBold().run(),
      () => editor.isActive("bold"),
    ],
    [
      "Italic",
      () => editor.chain().focus().toggleItalic().run(),
      () => editor.isActive("italic"),
    ],
    [
      "Strike",
      () => editor.chain().focus().toggleStrike().run(),
      () => editor.isActive("strike"),
    ],
    [
      "Code",
      () => editor.chain().focus().toggleCode().run(),
      () => editor.isActive("code"),
    ],
  ];

  return (
    <div
      className="nodex-tiptap-toolbar"
      style={{
        borderBottom: "1px solid #e5e7eb",
        padding: "0.5rem",
        display: "flex",
        flexWrap: "wrap",
        gap: "0.25rem",
        background: "#f9fafb",
      }}
    >
      {items.map(([label, onClick, isActive]) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          style={{
            padding: "0.375rem 0.75rem",
            borderRadius: "0.25rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            border: "1px solid #d1d5db",
            cursor: "pointer",
            background: isActive() ? "#1f2937" : "#fff",
            color: isActive() ? "#fff" : "#374151",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function EditorApp() {
  const initial =
    typeof window !== "undefined" && window.__NODEX_NOTE__
      ? window.__NODEX_NOTE__.content
      : "";

  const editor = useEditor({
    extensions: [StarterKit],
    content: initial,
    editable: true,
    editorProps: {
      attributes: {
        style:
          "outline: none; min-height: 360px; padding: 1rem; line-height: 1.75; font-family: system-ui, sans-serif;",
      },
    },
  });

  useEffect(() => {
    window.Nodex.onMessage = (message) => {
      if (message.type === "update" || message.type === "render") {
        const payload = message.payload;
        if (payload) {
          window.__NODEX_NOTE__ = payload;
          const next = payload.content;
          if (editor && !editor.isDestroyed) {
            editor.commands.setContent(next, false);
          }
        }
      }
    };
  }, [editor]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <MenuBar editor={editor} />
      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: "0.5rem",
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

const mountEl = document.getElementById("plugin-root");
if (mountEl) {
  const root = createRoot(mountEl);
  root.render(<EditorApp />);
}
