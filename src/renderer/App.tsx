import React from "react";
import { ensureSesLockdown } from "./shell/sandbox/sesLockdown";
import { ChromeOnlyWorkbench } from "./shell/ChromeOnlyWorkbench";
import { NodexCommandPalette } from "./shell/NodexCommandPalette";
import { NodexMiniBar } from "./shell/NodexMiniBar";
import { NodexModeLineHost } from "./shell/NodexModeLineHost";
import { NodexReplOverlay } from "./shell/NodexReplOverlay";
import { useNodexShell } from "./shell/useNodexShell";
import { useShellLayoutState } from "./shell/layout/ShellLayoutContext";
import { useRegisterShellCoreBlocks } from "./shell/first-party/registerShellCoreBlocks";
import { useRegisterShellDefaultKeybindings } from "./shell/first-party/registerShellDefaultKeybindings";
import { useRegisterDocumentationPlugin } from "./shell/first-party/plugins/documentation/useRegisterDocumentationPlugin";
import { useRegisterNotesExplorerPlugin } from "./shell/first-party/plugins/notes-explorer/useRegisterNotesExplorerPlugin";
import { useRegisterObservableNotebookPlugin } from "./shell/first-party/plugins/observable-notebook/useRegisterObservableNotebookPlugin";
import { useRegisterNotesShellPlugin } from "./shell/first-party/useRegisterNotesShellPlugin";

ensureSesLockdown();

const App: React.FC = () => {
  const shellVm = useNodexShell();
  const layout = useShellLayoutState();
  useRegisterShellCoreBlocks();
  useRegisterShellDefaultKeybindings();
  useRegisterObservableNotebookPlugin();
  useRegisterDocumentationPlugin();
  useRegisterNotesShellPlugin();
  useRegisterNotesExplorerPlugin();

  return (
    <div className="flex h-screen min-h-0 flex-col">
      {/* Reserve vertical space for mode line + minibuffer so they do not overlay the workbench. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChromeOnlyWorkbench />
      </div>
      {/* Emacs order: mode line above minibuffer; minibuffer sits on the bottom edge. */}
      {layout.visible.modeLine ? <NodexModeLineHost /> : null}
      <NodexCommandPalette vm={shellVm} />
      {layout.visible.miniBar ? <NodexMiniBar vm={shellVm} /> : null}
      <NodexReplOverlay />
    </div>
  );
};

export default App;
