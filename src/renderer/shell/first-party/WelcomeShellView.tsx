import React, { useCallback, useMemo } from "react";
import type { Note } from "@nodex/ui-types";
import MarkdownRenderer from "../../components/renderers/MarkdownRenderer";
import { useShellNavigation } from "../useShellNavigation";
import type { ShellViewComponentProps } from "../views/ShellViewRegistry";

const WELCOME_MARKDOWN = `## Welcome

Shell views are React components. Use DevTools: \`window.nodex.shell\`. Register menu items and tabs from the command registry or DevTools.

### Start here

- [New scratch markdown](nodex-cmd:nodex.notes.newScratchMarkdown) — new root markdown note in a new tab
- [Scratch Observable notebook](nodex-cmd:nodex.observableNotebook.open) — interactive notebook in the primary area (not saved as a project note)

### Go to

- [Documentation](nodex-cmd:nodex.docs.open) — command search, keyboard reference, API shape, and plugin authoring guide
- [Notes explorer](nodex-cmd:nodex.notesExplorer.open) — project notes tree in the sidebar; open a note to edit in the main area

Tip: append \`#/n/<noteId>\` to the URL to open or focus that note (synced with the tab strip).
`;

export function WelcomeShellView(_props: ShellViewComponentProps): React.ReactElement {
  const { invokeCommand } = useShellNavigation();

  const welcomeNote = useMemo<Note>(
    () => ({
      id: "shell.welcome",
      type: "markdown",
      title: "Welcome",
      content: WELCOME_MARKDOWN,
    }),
    [],
  );

  const onNodexCmdLink = useCallback(
    (commandId: string) => {
      void Promise.resolve(invokeCommand(commandId)).catch(() => {
        /* unknown command or handler error */
      });
    },
    [invokeCommand],
  );

  return <MarkdownRenderer note={welcomeNote} onNodexCmdLink={onNodexCmdLink} />;
}
