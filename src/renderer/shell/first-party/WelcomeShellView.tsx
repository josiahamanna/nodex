import React, { useCallback, useMemo } from "react";
import type { Note } from "@nodex/ui-types";
import { useAuth } from "../../auth/AuthContext";
import { isWebScratchSession } from "../../auth/web-scratch";
import MarkdownRenderer from "../../components/renderers/MarkdownRenderer";
import { isElectronUserAgent } from "../../nodex-web-shim";
import { applyShellWelcomeHash } from "../shellRailNavigation";
import { replaceWindowHash } from "../shellTabUrlSync";
import { useShellNavigation } from "../useShellNavigation";
import type { ShellViewComponentProps } from "../views/ShellViewRegistry";
import type { WelcomeShellUrlSegment } from "../shellWelcomeUrlRoutes";

function scratchPersistenceParagraph(
  electron: boolean,
  webAuthed: boolean,
  webScratchTryout: boolean,
  authLoading: boolean,
): string {
  if (authLoading) {
    return "**Persistence:** Matches your notes backend once the session has finished loading.";
  }
  if (electron) {
    return "**Persistence:** In the desktop app, Scratch notes are saved like your other project notes—your open notes folder or your signed-in cloud workspace, depending on how you use Nodex.";
  }
  if (webAuthed) {
    return "**Persistence:** While signed in on the web, Scratch notes are stored with your account—the same as the rest of your workspace tree.";
  }
  if (webScratchTryout) {
    return "**Persistence:** In browser try-out mode, Scratch notes stay in this browser (local storage). Signing in or clearing site data may affect them—copy or recreate anything you need to keep elsewhere.";
  }
  return "**Persistence:** Sign in to keep notes on your account. For a quick local try-out, use a scratch session—notes then stay in this browser until you change that.";
}

function buildWelcomeMarkdown(
  electron: boolean,
  webAuthed: boolean,
  webScratchTryout: boolean,
  authLoading: boolean,
): string {
  const persistence = scratchPersistenceParagraph(
    electron,
    webAuthed,
    webScratchTryout,
    authLoading,
  );

  return `## Welcome

Shell views are React components. Use DevTools: \`window.nodex.shell\`. Register menu items and tabs from the command registry or DevTools.

### Start here

- [Scratch markdown](#/welcome/scratch-markdown) — open the **scratch** tab (reusable note; also use the tab strip or activity bar)
- [Scratch JS notebook](#/welcome/js-notebook) — interactive notebook in the primary area (not saved as a project note)

### Scratch notes and the explorer

The **scratch** tab is one reusable markdown note. **New scratch markdown** (command palette) adds more root markdown notes named **scratch**, or **scratch-…-…** (two random nature words) when a same-type sibling already uses **scratch** (case-insensitive).

Those notes appear in the [Notes explorer](#/welcome/notes-explorer) under workspace **Scratch** → project **Scratch**—a **draft bucket** in the same tree as your other notes, not a hidden buffer.

${persistence}

**Workflow:** Capture in scratch; when something is no longer a draft, move or duplicate it into another project in the explorer.

### Go to

- [Documentation](#/welcome/documentation) — command search, keyboard reference, API shape, and plugin authoring guide
- [Notes explorer](#/welcome/notes-explorer) — project notes tree in the sidebar; open a note to edit in the main area

Tip: the address bar prefers \`#/w/Workspace/Project/Title\` once the notes tree has been loaded. Welcome shortcuts use \`#/welcome/…\` (shareable; runs the same actions as the links above).
`;
}

export function WelcomeShellView(_props: ShellViewComponentProps): React.ReactElement {
  const { invokeCommand, deps: shellNavDeps } = useShellNavigation();
  const { state: authState } = useAuth();

  const onWelcomeShellSegmentClick = useCallback(
    (segment: "" | WelcomeShellUrlSegment) => {
      replaceWindowHash(segment ? `#/welcome/${segment}` : "#/welcome");
      applyShellWelcomeHash(segment, shellNavDeps, invokeCommand);
    },
    [invokeCommand, shellNavDeps],
  );

  const welcomeNote = useMemo<Note>(() => {
    const electron = isElectronUserAgent();
    const webAuthed = authState.status === "authed";
    const authLoading = authState.status === "loading";
    const webScratchTryout =
      !electron && isWebScratchSession() && authState.status === "anon";
    return {
      id: "shell.welcome",
      type: "markdown",
      title: "Welcome",
      content: buildWelcomeMarkdown(electron, webAuthed, webScratchTryout, authLoading),
    };
  }, [authState.status]);

  return (
    <MarkdownRenderer note={welcomeNote} onWelcomeShellSegmentClick={onWelcomeShellSegmentClick} />
  );
}
