import React, { useCallback } from "react";
import type { ShellViewComponentProps } from "../views/ShellViewRegistry";

function invokeShellCommand(commandId: string): void {
  const shell = (window as unknown as { nodex?: { shell?: { commands?: { invoke?: (id: string) => unknown } } } })
    .nodex?.shell;
  void Promise.resolve(shell?.commands?.invoke?.(commandId));
}

export function WelcomeShellView(_props: ShellViewComponentProps): React.ReactElement {
  const openDocs = useCallback(() => {
    invokeShellCommand("nodex.docs.open");
  }, []);
  const openObservable = useCallback(() => {
    invokeShellCommand("nodex.observableNotebook.open");
  }, []);

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
        </ul>
      </nav>
    </div>
  );
}
