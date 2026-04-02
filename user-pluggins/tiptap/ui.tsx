import React, { useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Editor } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Typography from "@tiptap/extension-typography";
import Youtube from "@tiptap/extension-youtube";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import type { NotePayload } from "@nodex/plugin-ui";
import {
  useNodexHostMessages,
  useNodexIframeApi,
  useNotifyDisplayReady,
} from "@nodex/plugin-ui";

const EDITOR_STYLES = `
.nodex-rich-root .ProseMirror {
  outline: none;
  min-height: 360px;
  padding: 1rem;
  line-height: 1.75;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 15px;
}
.nodex-rich-root .ProseMirror p.is-editor-empty:first-child::before {
  color: #9ca3af;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}
.nodex-rich-root .ProseMirror table {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
  margin: 0.75rem 0;
  overflow: hidden;
}
.nodex-rich-root .ProseMirror td,
.nodex-rich-root .ProseMirror th {
  min-width: 2.5em;
  border: 1px solid #d1d5db;
  padding: 6px 8px;
  vertical-align: top;
  box-sizing: border-box;
  position: relative;
}
.nodex-rich-root .ProseMirror th {
  font-weight: 600;
  background: #f3f4f6;
}
.nodex-rich-root .ProseMirror ul[data-type="taskList"] {
  list-style: none;
  padding-left: 0;
  margin: 0.5rem 0;
}
.nodex-rich-root .ProseMirror ul[data-type="taskList"] li {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
}
.nodex-rich-root .ProseMirror ul[data-type="taskList"] li > label {
  flex: 0 0 auto;
  margin-top: 0.2rem;
  user-select: none;
}
.nodex-rich-root .ProseMirror ul[data-type="taskList"] li > div {
  flex: 1 1 auto;
}
.nodex-rich-root .ProseMirror img {
  max-width: 100%;
  height: auto;
  border-radius: 0.375rem;
}
.nodex-rich-root .ProseMirror .youtube-wrapper {
  margin: 0.75rem 0;
}
.nodex-rich-root .ProseMirror .youtube-wrapper iframe {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: none;
  border-radius: 0.375rem;
}
`;

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

const HIGHLIGHT_SWATCHES = [
  { label: "Y", color: "#fef08a" },
  { label: "G", color: "#bbf7d0" },
  { label: "B", color: "#bfdbfe" },
  { label: "P", color: "#fbcfe8" },
];

function TbBtn({
  label,
  title,
  onClick,
  active,
  disabled,
}: {
  label: string;
  title?: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title ?? label}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "0.3rem 0.55rem",
        borderRadius: "0.25rem",
        fontSize: "0.75rem",
        fontWeight: 600,
        border: "1px solid #d1d5db",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        background: active ? "#1f2937" : "#fff",
        color: active ? "#fff" : "#374151",
      }}
    >
      {label}
    </button>
  );
}

function TbSep(): React.ReactElement {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        height: 22,
        background: "#e5e7eb",
        margin: "0 0.2rem",
        flexShrink: 0,
      }}
    />
  );
}

function useRichTextExtensions() {
  return useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: {
            class: "nodex-link",
            rel: "noopener noreferrer",
          },
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({
        table: { resizable: true },
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: { class: "nodex-editor-image" },
      }),
      Youtube.configure({
        controls: true,
        nocookie: true,
        width: 640,
        height: 360,
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({
        types: ["heading", "paragraph", "blockquote"],
      }),
      Subscript,
      Superscript,
      Typography,
      Placeholder.configure({
        placeholder: "Write something, or type Markdown-style shortcuts…",
      }),
      CharacterCount,
    ],
    [],
  );
}

function setLinkInteractive(editor: Editor): void {
  const prev = (editor.getAttributes("link").href as string) || "";
  const href = window.prompt("Link URL (leave empty to remove)", prev);
  if (href === null) {
    return;
  }
  if (href.trim() === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
}

function insertImagePrompt(editor: Editor): void {
  const src = window.prompt("Image URL");
  if (!src?.trim()) {
    return;
  }
  editor.chain().focus().setImage({ src: src.trim() }).run();
}

function insertYoutubePrompt(editor: Editor): void {
  const src = window.prompt("YouTube video URL");
  if (!src?.trim()) {
    return;
  }
  editor.commands.setYoutubeVideo({ src: src.trim() });
}

function MenuBar({ editor }: { editor: Editor | null }): React.ReactElement | null {
  if (!editor) {
    return null;
  }

  const ch = editor.storage.characterCount;

  return (
    <div
      role="toolbar"
      aria-label="Rich text formatting"
      className="nodex-tiptap-toolbar"
      style={{
        borderBottom: "1px solid #e5e7eb",
        padding: "0.45rem",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "0.2rem",
        background: "#f9fafb",
        maxHeight: "42vh",
        overflowY: "auto",
      }}
    >
      <TbBtn
        label="↶"
        title="Undo"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      />
      <TbBtn
        label="↷"
        title="Redo"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      />
      <TbSep />
      <TbBtn
        label="P"
        title="Paragraph"
        onClick={() => editor.chain().focus().setParagraph().run()}
        active={editor.isActive("paragraph")}
      />
      <TbBtn
        label="H1"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
      />
      <TbBtn
        label="H2"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
      />
      <TbBtn
        label="H3"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
      />
      <TbSep />
      <TbBtn
        label="B"
        title="Bold"
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
      />
      <TbBtn
        label="I"
        title="Italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
      />
      <TbBtn
        label="U"
        title="Underline"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
      />
      <TbBtn
        label="S"
        title="Strikethrough"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
      />
      <TbBtn
        label="code"
        title="Inline code"
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive("code")}
      />
      <TbBtn
        label="{}"
        title="Code block"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
      />
      <TbBtn
        label="Sub"
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        active={editor.isActive("subscript")}
      />
      <TbBtn
        label="Sup"
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        active={editor.isActive("superscript")}
      />
      <TbBtn
        label="✕fmt"
        title="Clear marks"
        onClick={() => editor.chain().focus().unsetAllMarks().run()}
      />
      <TbSep />
      <TbBtn
        label="•"
        title="Bullet list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
      />
      <TbBtn
        label="1."
        title="Ordered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
      />
      <TbBtn
        label="☑"
        title="Task list"
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive("taskList")}
      />
      <TbBtn
        label="❝"
        title="Blockquote"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
      />
      <TbBtn
        label="—"
        title="Horizontal rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      />
      <TbSep />
      <TbBtn
        label="◧"
        title="Align left"
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        active={editor.isActive({ textAlign: "left" })}
      />
      <TbBtn
        label="◫"
        title="Align center"
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        active={editor.isActive({ textAlign: "center" })}
      />
      <TbBtn
        label="◧▢"
        title="Align right"
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        active={editor.isActive({ textAlign: "right" })}
      />
      <TbBtn
        label="≋"
        title="Justify"
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        active={editor.isActive({ textAlign: "justify" })}
      />
      <TbSep />
      <TbBtn
        label="🔗"
        title="Link"
        onClick={() => setLinkInteractive(editor)}
        active={editor.isActive("link")}
      />
      <TbBtn label="🖼" title="Image from URL" onClick={() => insertImagePrompt(editor)} />
      <TbBtn label="▶" title="YouTube embed" onClick={() => insertYoutubePrompt(editor)} />
      <TbSep />
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: "0.7rem",
          color: "#4b5563",
        }}
      >
        <span>A</span>
        <input
          type="color"
          value={(editor.getAttributes("textStyle").color as string) || "#111827"}
          onChange={(e) => {
            editor.chain().focus().setColor(e.target.value).run();
          }}
          title="Text color"
          style={{ width: 26, height: 22, padding: 0, border: "1px solid #d1d5db" }}
        />
      </label>
      <TbBtn
        label="A̶"
        title="Clear text color"
        onClick={() => editor.chain().focus().unsetColor().run()}
      />
      {HIGHLIGHT_SWATCHES.map(({ label, color }) => (
        <TbBtn
          key={color}
          label={label}
          title={`Highlight ${color}`}
          onClick={() => editor.chain().focus().toggleHighlight({ color }).run()}
          active={editor.isActive("highlight", { color })}
        />
      ))}
      <TbBtn
        label="HL✕"
        title="Remove highlight"
        onClick={() => editor.chain().focus().unsetHighlight().run()}
      />
      <TbSep />
      <TbBtn
        label="+Tbl"
        title="Insert 3×3 table"
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      />
      <TbBtn
        label="+Row"
        title="Add row below"
        onClick={() => editor.chain().focus().addRowAfter().run()}
        disabled={!editor.can().addRowAfter()}
      />
      <TbBtn
        label="+Col"
        title="Add column after"
        onClick={() => editor.chain().focus().addColumnAfter().run()}
        disabled={!editor.can().addColumnAfter()}
      />
      <TbBtn
        label="⌘"
        title="Merge cells"
        onClick={() => editor.chain().focus().mergeCells().run()}
        disabled={!editor.can().mergeCells()}
      />
      <TbBtn
        label="╎"
        title="Split cell"
        onClick={() => editor.chain().focus().splitCell().run()}
        disabled={!editor.can().splitCell()}
      />
      <TbBtn
        label="Hrow"
        title="Toggle header row"
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
        disabled={!editor.can().toggleHeaderRow()}
      />
      <TbBtn
        label="Del⌫"
        title="Delete table"
        onClick={() => editor.chain().focus().deleteTable().run()}
        disabled={!editor.can().deleteTable()}
      />
      {ch ? (
        <>
          <TbSep />
          <span style={{ fontSize: "0.68rem", color: "#6b7280", marginLeft: 4 }}>
            {ch.characters()} chars · {ch.words()} words
          </span>
        </>
      ) : null}
    </div>
  );
}

function SelectionBubbleMenu({ editor }: { editor: Editor | null }): React.ReactElement | null {
  if (!editor) {
    return null;
  }
  return (
    <BubbleMenu
      editor={editor}
      options={{
        placement: "top",
      }}
      style={{
        display: "flex",
        gap: 4,
        padding: 6,
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
      }}
    >
      <TbBtn
        label="B"
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
      />
      <TbBtn
        label="I"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
      />
      <TbBtn
        label="🔗"
        onClick={() => setLinkInteractive(editor)}
        active={editor.isActive("link")}
      />
      <TbBtn label="✕lnk" title="Remove link" onClick={() => editor.chain().focus().unsetLink().run()} />
    </BubbleMenu>
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
  const [, setStatsTick] = useState(0);

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

  const extensions = useRichTextExtensions();

  const editor = useEditor({
    extensions,
    content: initial,
    editable: true,
    editorProps: {
      attributes: {
        class: "nodex-pm-root",
      },
    },
    onUpdate: ({ editor: ed }) => {
      saveNoteContent(ed.getHTML());
      setStatsTick((n) => n + 1);
    },
  });

  const onNotePayload = useCallback(
    (payload: NotePayload) => {
      window.__NODEX_NOTE__ = payload;
      const next = payload.content;
      if (editor && !editor.isDestroyed && editor.getHTML() !== next) {
        editor.commands.setContent(next, { emitUpdate: false });
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
      <style>{EDITOR_STYLES}</style>
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
          Rich text (TipTap — tables, media, tasks, typography)
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
        className="nodex-rich-root"
        style={{
          flex: 1,
          overflow: "auto",
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: "0.5rem",
          position: "relative",
        }}
      >
        <SelectionBubbleMenu editor={editor} />
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
