import CodeMirror from "@uiw/react-codemirror";
import React, { useMemo } from "react";
import { notebookEditorExtensions } from "./observable-notebook-codemirror";

export type NotebookCellEditorProps = {
  value: string;
  onChange: (next: string) => void;
  /** Names of other cells (and inputs) to suggest; exclude current cell name if desired. */
  completionCellNames: string[];
  dark: boolean;
  onModEnter?: () => void;
};

export function NotebookCellEditor(props: NotebookCellEditorProps): React.ReactElement {
  const { value, onChange, completionCellNames, dark, onModEnter } = props;

  const namesKey = [...completionCellNames].sort().join("\0");
  const extensions = useMemo(
    () =>
      notebookEditorExtensions({
        cellNames: [...completionCellNames].sort(),
        dark,
        onModEnter,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- namesKey captures completion set
    [namesKey, dark, onModEnter],
  );

  return (
    <CodeMirror
      value={value}
      height="120px"
      theme="none"
      basicSetup={false}
      extensions={extensions}
      className="overflow-hidden rounded-md border border-border text-[11px]"
      onChange={(v) => onChange(v)}
    />
  );
}
