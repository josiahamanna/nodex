import React, { useEffect } from "react";
import type { NoteTypeReactEditorProps } from "../../../nodex-contribution-registry";
import { useNodexContributionRegistry } from "../../../NodexContributionContext";
import { MarkdownNoteEditor } from "./MarkdownNoteEditor";

/**
 * System note plugin: registers the in-app editor for `markdown`, `mdx`, and `root` note types.
 * No shell rail, tabs, or companion regions.
 */
export function useRegisterMarkdownNotePlugin(): void {
  const contrib = useNodexContributionRegistry();

  useEffect(() => {
    function MarkdownNoteEditorHost(props: NoteTypeReactEditorProps) {
      return (
        <MarkdownNoteEditor
          note={props.note}
          persist={props.persistToNotesStore !== false}
        />
      );
    }
    const disposers = [
      contrib.registerNoteTypeReactEditor("markdown", MarkdownNoteEditorHost),
      contrib.registerNoteTypeReactEditor("mdx", MarkdownNoteEditorHost),
      contrib.registerNoteTypeReactEditor("root", MarkdownNoteEditorHost),
    ];
    return () => {
      for (const d of disposers) d();
    };
  }, [contrib]);
}
