import React from "react";
import { ChromeOnlyWorkbench } from "./shell/ChromeOnlyWorkbench";
import { NodexCommandPalette } from "./shell/NodexCommandPalette";
import { NodexMiniBar } from "./shell/NodexMiniBar";
import { NodexModeLineHost } from "./shell/NodexModeLineHost";
import { NodexReplOverlay } from "./shell/NodexReplOverlay";
import { useNodexShell } from "./shell/useNodexShell";
import { useShellLayoutState } from "./shell/layout/ShellLayoutContext";
import { useRegisterShellCoreBlocks } from "./shell/first-party/registerShellCoreBlocks";
import { useRegisterJsNotebookPlugin } from "./shell/first-party/plugins/js-notebook/useRegisterJsNotebookPlugin";

const App: React.FC = () => {
  const shellVm = useNodexShell();
  const layout = useShellLayoutState();
  useRegisterShellCoreBlocks();
  useRegisterJsNotebookPlugin();

  return (
    <div className="flex h-screen min-h-0 flex-col">
      {/* Reserve vertical space for mode line + minibar so they do not overlay the workbench. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChromeOnlyWorkbench />
      </div>
      {layout.visible.modeLine ? <NodexModeLineHost /> : null}
      <NodexCommandPalette vm={shellVm} />
      {layout.visible.miniBar ? <NodexMiniBar vm={shellVm} /> : null}
      <NodexReplOverlay />
    </div>
  );
};

export default App;
