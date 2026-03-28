import React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Note } from "../../../preload";

interface TextRendererProps {
  note: Note;
}

const MenuBar = ({ editor }: { editor: any }) => {
  if (!editor) {
    return null;
  }

  return (
    <div className="border-b border-gray-200 p-2 flex flex-wrap gap-1 bg-gray-50">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`px-3 py-1 rounded text-sm font-medium ${
          editor.isActive("bold")
            ? "bg-gray-800 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100"
        } border border-gray-300`}
      >
        Bold
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`px-3 py-1 rounded text-sm font-medium ${
          editor.isActive("italic")
            ? "bg-gray-800 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100"
        } border border-gray-300`}
      >
        Italic
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`px-3 py-1 rounded text-sm font-medium ${
          editor.isActive("strike")
            ? "bg-gray-800 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100"
        } border border-gray-300`}
      >
        Strike
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={`px-3 py-1 rounded text-sm font-medium ${
          editor.isActive("code")
            ? "bg-gray-800 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100"
        } border border-gray-300`}
      >
        Code
      </button>
      <div className="w-px h-6 bg-gray-300 mx-1" />
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={`px-3 py-1 rounded text-sm font-medium ${
          editor.isActive("heading", { level: 1 })
            ? "bg-gray-800 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100"
        } border border-gray-300`}
      >
        H1
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`px-3 py-1 rounded text-sm font-medium ${
          editor.isActive("heading", { level: 2 })
            ? "bg-gray-800 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100"
        } border border-gray-300`}
      >
        H2
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={`px-3 py-1 rounded text-sm font-medium ${
          editor.isActive("heading", { level: 3 })
            ? "bg-gray-800 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100"
        } border border-gray-300`}
      >
        H3
      </button>
      <div className="w-px h-6 bg-gray-300 mx-1" />
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`px-3 py-1 rounded text-sm font-medium ${
          editor.isActive("bulletList")
            ? "bg-gray-800 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100"
        } border border-gray-300`}
      >
        Bullet List
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`px-3 py-1 rounded text-sm font-medium ${
          editor.isActive("orderedList")
            ? "bg-gray-800 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100"
        } border border-gray-300`}
      >
        Ordered List
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={`px-3 py-1 rounded text-sm font-medium ${
          editor.isActive("codeBlock")
            ? "bg-gray-800 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100"
        } border border-gray-300`}
      >
        Code Block
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`px-3 py-1 rounded text-sm font-medium ${
          editor.isActive("blockquote")
            ? "bg-gray-800 text-white"
            : "bg-white text-gray-700 hover:bg-gray-100"
        } border border-gray-300`}
      >
        Quote
      </button>
      <div className="w-px h-6 bg-gray-300 mx-1" />
      <button
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        className="px-3 py-1 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
      >
        Horizontal Rule
      </button>
      <button
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        className="px-3 py-1 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-100 border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Undo
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        className="px-3 py-1 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-100 border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Redo
      </button>
    </div>
  );
};

const TextRenderer: React.FC<TextRendererProps> = ({ note }) => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: note.content,
    editable: true,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose lg:prose-lg max-w-none focus:outline-none p-6 min-h-[400px]",
      },
    },
  });

  return (
    <div className="h-full flex flex-col">
      <MenuBar editor={editor} />
      <div className="flex-1 overflow-auto bg-white">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default TextRenderer;
