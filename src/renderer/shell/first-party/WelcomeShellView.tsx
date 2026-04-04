import React, { useMemo } from "react";
import type { Note } from "@nodex/ui-types";
import MarkdownRenderer from "../../components/renderers/MarkdownRenderer";
import type { ShellViewComponentProps } from "../views/ShellViewRegistry";

const WELCOME_MARKDOWN = `## Welcome

Shell views are React components. Use DevTools: \`window.nodex.shell\`. Register menu items and tabs from the command registry or DevTools.

### Start here

- [New scratch markdown](#/welcome/scratch-markdown) — new root markdown note in a new tab
- [Scratch Observable notebook](#/welcome/observable-notebook) — interactive notebook in the primary area (not saved as a project note)

### Go to

- [Documentation](#/welcome/documentation) — command search, keyboard reference, API shape, and plugin authoring guide
- [Notes explorer](#/welcome/notes-explorer) — project notes tree in the sidebar; open a note to edit in the main area

Tip: append \`#/n/<noteId>\` to the URL to open or focus that note (synced with the tab strip). Welcome shortcuts use \`#/welcome/…\` (shareable; runs the same actions as the links above).
`;

export function WelcomeShellView(_props: ShellViewComponentProps): React.ReactElement {
  const welcomeNote = useMemo<Note>(
    () => ({
      id: "shell.welcome",
      type: "markdown",
      title: "Welcome",
      content: WELCOME_MARKDOWN,
    }),
    [],
  );

  return <MarkdownRenderer note={welcomeNote} />;
}
