import React, { useCallback, useMemo } from "react";
import type { Note } from "@nodex/ui-types";
import MarkdownRenderer from "../../components/renderers/MarkdownRenderer";
import { applyShellWelcomeHash } from "../shellRailNavigation";
import { replaceWindowHash } from "../shellTabUrlSync";
import { useShellNavigation } from "../useShellNavigation";
import type { ShellViewComponentProps } from "../views/ShellViewRegistry";
import type { WelcomeShellUrlSegment } from "../shellWelcomeUrlRoutes";

const WELCOME_MARKDOWN = `## Welcome

Shell views are React components. Use DevTools: \`window.nodex.shell\`. Register menu items and tabs from the command registry or DevTools.

### Start here

- [Scratch markdown](#/welcome/scratch-markdown) — open the **Scratch** tab (reusable note; also use the tab strip or activity bar)
- [Scratch JS notebook](#/welcome/js-notebook) — interactive notebook in the primary area (not saved as a project note)

### Go to

- [Documentation](#/welcome/documentation) — command search, keyboard reference, API shape, and plugin authoring guide
- [Notes explorer](#/welcome/notes-explorer) — project notes tree in the sidebar; open a note to edit in the main area

Tip: use \`#/n/<noteId>\` or a workspace path hash \`#/w/Workspace/Project/Title\` to open or focus a note. Welcome shortcuts use \`#/welcome/…\` (shareable; runs the same actions as the links above).
`;

export function WelcomeShellView(_props: ShellViewComponentProps): React.ReactElement {
  const { invokeCommand, deps: shellNavDeps } = useShellNavigation();

  const onWelcomeShellSegmentClick = useCallback(
    (segment: "" | WelcomeShellUrlSegment) => {
      replaceWindowHash(segment ? `#/welcome/${segment}` : "#/welcome");
      applyShellWelcomeHash(segment, shellNavDeps, invokeCommand);
    },
    [invokeCommand, shellNavDeps],
  );

  const welcomeNote = useMemo<Note>(
    () => ({
      id: "shell.welcome",
      type: "markdown",
      title: "Welcome",
      content: WELCOME_MARKDOWN,
    }),
    [],
  );

  return (
    <MarkdownRenderer note={welcomeNote} onWelcomeShellSegmentClick={onWelcomeShellSegmentClick} />
  );
}
