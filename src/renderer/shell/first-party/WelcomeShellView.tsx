import React, { useCallback } from "react";
import { useShellNavigation } from "../useShellNavigation";
import type { ShellViewComponentProps } from "../views/ShellViewRegistry";

export function WelcomeShellView(_props: ShellViewComponentProps): React.ReactElement {
  const { invokeCommand } = useShellNavigation();

  const openDocs = useCallback(() => {
    void invokeCommand("nodex.docs.open");
  }, [invokeCommand]);

  const openObservable = useCallback(() => {
    void invokeCommand("nodex.observableNotebook.open");
  }, [invokeCommand]);

  const openNotesExplorer = useCallback(() => {
    void invokeCommand("nodex.notesExplorer.open");
  }, [invokeCommand]);

  return (
    <div className="p-4 font-sans text-[13px]">
      <h2 className="mb-2 text-lg font-semibold">Welcome</h2>
      <p className="text-muted-foreground">
        Shell views are React components. Use DevTools:{" "}
        <code className="rounded bg-muted px-1 font-mono text-xs">window.nodex.shell</code>
      </p>
      <p className="mt-2 text-muted-foreground">Register menu items and tabs from the command registry or DevTools.</p>

      <nav className="mt-6 border-t border-border pt-4" aria-label="Featured areas">
        <h3 className="mb-2 text-[12px] font-semibold text-foreground">Go to</h3>
        <ul className="flex flex-col gap-2 text-[13px]">
          <li>
            <a
              href="#documentation"
              className="text-primary underline underline-offset-2 hover:opacity-90"
              onClick={(e) => {
                e.preventDefault();
                openDocs();
              }}
            >
              Documentation
            </a>
            <span className="ml-2 text-[11px] text-muted-foreground">
              — command search, keyboard reference, API shape, and plugin authoring guide
            </span>
          </li>
          <li>
            <a
              href="#observable-notebook"
              className="text-primary underline underline-offset-2 hover:opacity-90"
              onClick={(e) => {
                e.preventDefault();
                openObservable();
              }}
            >
              Observable notebook
            </a>
            <span className="ml-2 text-[11px] text-muted-foreground">— interactive notebook in the primary area</span>
          </li>
          <li>
            <a
              href="#notes"
              className="text-primary underline underline-offset-2 hover:opacity-90"
              onClick={(e) => {
                e.preventDefault();
                openNotesExplorer();
              }}
            >
              Notes explorer
            </a>
            <span className="ml-2 text-[11px] text-muted-foreground">
              — project notes tree in the sidebar; open a note to edit in the main area
            </span>
          </li>
          <li className="text-[11px] text-muted-foreground">
            Tip: append{" "}
            <code className="rounded bg-muted px-1 font-mono text-[10px]">#note/&lt;noteId&gt;</code> to the URL to
            open or focus that note (synced with the tab strip).
          </li>
        </ul>
      </nav>
    </div>
  );
}
