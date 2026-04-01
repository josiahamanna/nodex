import React from "react";
import { ChromeOnlyWorkbench } from "./shell/ChromeOnlyWorkbench";
import { NodexCommandPalette } from "./shell/NodexCommandPalette";
import { NodexMiniBar } from "./shell/NodexMiniBar";
import { NodexModeLineHost } from "./shell/NodexModeLineHost";
import { NodexReplOverlay } from "./shell/NodexReplOverlay";
import { useNodexShell } from "./shell/useNodexShell";
import { useShellLayoutState } from "./shell/layout/ShellLayoutContext";
import { useRegisterShellCoreBlocks } from "./shell/first-party/registerShellCoreBlocks";
import { useRegisterShellDefaultKeybindings } from "./shell/first-party/registerShellDefaultKeybindings";
import { useRegisterJsNotebookPlugin } from "./shell/first-party/plugins/js-notebook/useRegisterJsNotebookPlugin";
import { useRegisterDocumentationPlugin } from "./shell/first-party/plugins/documentation/useRegisterDocumentationPlugin";
import { useRegisterObservableNotebookPlugin } from "./shell/first-party/plugins/observable-notebook/useRegisterObservableNotebookPlugin";

const App: React.FC = () => {
  const shellVm = useNodexShell();
  const layout = useShellLayoutState();
  useRegisterShellCoreBlocks();
  useRegisterShellDefaultKeybindings();
  useRegisterJsNotebookPlugin();
  useRegisterObservableNotebookPlugin();
  useRegisterDocumentationPlugin();

  // Expose system-level libraries for trusted system iframes.
  // (Used by the Observable notebook view when run inside a srcDoc iframe.)
  React.useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Runtime, Inspector } = require("@observablehq/runtime") as any;
    (window as any).nodex = (window as any).nodex || {};
    (window as any).nodex.system = (window as any).nodex.system || {};
    (window as any).nodex.system.observable = { Runtime, Inspector };
  }, []);

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
