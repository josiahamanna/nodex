import React from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { Note } from "../../../preload";

loader.config({ monaco });

interface CodeRendererProps {
  note: Note;
}

const CodeRenderer: React.FC<CodeRendererProps> = ({ note }) => {
  const language = note.metadata?.language || "javascript";

  return (
    <div className="h-full p-4">
      <div className="h-full border border-gray-200 rounded-lg overflow-hidden">
        <Editor
          height="100%"
          language={language}
          value={note.content}
          theme="vs-light"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
};

export default CodeRenderer;
