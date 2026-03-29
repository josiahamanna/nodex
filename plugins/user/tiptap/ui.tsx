import React, { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Editor } from "@tiptap/core";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { NotePayload } from "@nodex/plugin-ui";
import {
  useNodexHostMessages,
  useNodexIframeApi,
  useNotifyDisplayReady,
} from "@nodex/plugin-ui";

type TiptapPluginUiState = {
  showToolbar?: boolean;
};

function toolbarFromPluginState(raw: unknown): boolean | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const s = raw as TiptapPluginUiState;
  if (typeof s.showToolbar === "boolean") {
    return s.showToolbar;
  }
  return null;
}

function toolbarFromNoteMetadata(metadata: unknown): boolean | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const m = metadata as Record<string, unknown>;
  return toolbarFromPluginState(m.pluginUiState);
}

declare global {
  interface Window {
    __NODEX_NOTE__?: NotePayload;
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

  const initialToolbar =
    (typeof window !== "undefined" &&
      window.__NODEX_NOTE__ &&
      toolbarFromNoteMetadata(window.__NODEX_NOTE__.metadata)) ?? true;

  const [showToolbar, setShowToolbar] = useState(initialToolbar);

  const { postPluginUiState, saveNoteContent } = useNodexIframeApi();

  const persistToolbar = useCallback(
    (show: boolean) => {
      postPluginUiState({ showToolbar: show });
    },
    [postPluginUiState],
  );

  const applyHydratedState = useCallback((state: unknown) => {
    const t = toolbarFromPluginState(state);
    if (t !== null) {
      setShowToolbar(t);
    }
  }, []);

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
    onUpdate: ({ editor: ed }) => {
      saveNoteContent(ed.getHTML());
    },
  });

  const onNotePayload = useCallback(
    (payload: NotePayload) => {
      window.__NODEX_NOTE__ = payload;
      const next = payload.content;
      if (editor && !editor.isDestroyed && editor.getHTML() !== next) {
        editor.commands.setContent(next, false);
      }
      const t = toolbarFromNoteMetadata(payload.metadata);
      if (t !== null) {
        setShowToolbar(t);
      }
    },
    [editor],
  );

  useNodexHostMessages({
    onHydratePluginUi: applyHydratedState,
    onNotePayload,
  });

  useNotifyDisplayReady({ enabled: !!editor });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          marginBottom: "0.35rem",
        }}
      >
        <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
          Rich text
        </span>
        <button
          type="button"
          onClick={() => {
            const next = !showToolbar;
            setShowToolbar(next);
            persistToolbar(next);
          }}
          style={{
            padding: "0.25rem 0.5rem",
            fontSize: "0.75rem",
            borderRadius: "0.25rem",
            border: "1px solid #d1d5db",
            background: "#fff",
            cursor: "pointer",
            color: "#374151",
          }}
        >
          {showToolbar ? "Hide toolbar" : "Show toolbar"}
        </button>
      </div>
      {showToolbar ? <MenuBar editor={editor} /> : null}
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
