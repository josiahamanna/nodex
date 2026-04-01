import React from "react";
import type { ShellViewComponentProps } from "../../../views/ShellViewRegistry";

export function DocumentationHubView(_props: ShellViewComponentProps): React.ReactElement {
  return (
    <div className="p-5 text-[13px] text-muted-foreground">
      <p className="text-foreground">
        <strong>Documentation</strong> — search commands in the <strong>left panel</strong>; keyboard shortcuts,
        API shape, and filters in the <strong>secondary column</strong>.
      </p>
    </div>
  );
}
