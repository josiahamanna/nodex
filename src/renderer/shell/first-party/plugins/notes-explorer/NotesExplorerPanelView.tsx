import React from "react";
import type { ShellViewComponentProps } from "../../../views/ShellViewRegistry";
import { WpnExplorerPanelView } from "./WpnExplorerPanelView";

/** Workspace → project → notes (v2) explorer backed by `window.Nodex.wpn*` / `/api/v1/wpn`. */
export function NotesExplorerPanelView(props: ShellViewComponentProps): React.ReactElement {
  return <WpnExplorerPanelView {...props} />;
}
