import React from "react";
import type { ShellViewComponentProps } from "../views/ShellViewRegistry";

export function WelcomeShellView(_props: ShellViewComponentProps): React.ReactElement {
  return (
    <div className="p-4 font-sans text-[13px]">
      <h2 className="mb-2 text-lg font-semibold">Welcome</h2>
      <p className="text-muted-foreground">
        Shell views are React components. Use DevTools: <code className="rounded bg-muted px-1 font-mono text-xs">window.nodex.shell</code>
      </p>
      <p className="mt-2 text-muted-foreground">Register menu items and tabs from the command registry or DevTools.</p>
    </div>
  );
}
