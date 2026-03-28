import React from "react";
import { createRoot } from "react-dom/client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

function MenuBar({ editor }) {
  if (!editor) {
    return null;
  }

  return React.createElement(
    "div",
    {
      className: "nodex-tiptap-toolbar",
      style: {
        borderBottom: "1px solid #e5e7eb",
        padding: "0.5rem",
        display: "flex",
        flexWrap: "wrap",
        gap: "0.25rem",
        background: "#f9fafb",
      },
    },
    [
      ["Bold", () => editor.chain().focus().toggleBold().run(), () =>
        editor.isActive("bold"),
      ],
      ["Italic", () => editor.chain().focus().toggleItalic().run(), () =>
        editor.isActive("italic"),
      ],
      ["Strike", () => editor.chain().focus().toggleStrike().run(), () =>
        editor.isActive("strike"),
      ],
      ["Code", () => editor.chain().focus().toggleCode().run(), () =>
        editor.isActive("code"),
      ],
    ].map(([label, onClick, isActive]) =>
      React.createElement(
        "button",
        {
          key: label,
          type: "button",
          onClick,
          style: {
            padding: "0.375rem 0.75rem",
            borderRadius: "0.25rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            border: "1px solid #d1d5db",
            cursor: "pointer",
            background: isActive() ? "#1f2937" : "#fff",
            color: isActive() ? "#fff" : "#374151",
          },
        },
        label,
      ),
    ),
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

  React.useEffect(() => {
    Nodex.onMessage = (message) => {
      if (message.type === "update" || message.type === "render") {
        window.__NODEX_NOTE__ = message.payload;
        const next = message.payload.content;
        if (editor && !editor.isDestroyed) {
          editor.commands.setContent(next, false);
        }
      }
    };
  }, [editor]);

  return React.createElement(
    "div",
    { style: { display: "flex", flexDirection: "column", height: "100%" } },
    React.createElement(MenuBar, { editor }),
    React.createElement(
      "div",
      {
        style: {
          flex: 1,
          overflow: "auto",
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: "0.5rem",
        },
      },
      React.createElement(EditorContent, { editor }),
    ),
  );
}

const mountEl = document.getElementById("plugin-root");
if (mountEl) {
  const root = createRoot(mountEl);
  root.render(React.createElement(EditorApp));
}
