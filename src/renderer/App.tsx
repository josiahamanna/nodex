import React from "react";
import { ChromeOnlyWorkbench } from "./shell/ChromeOnlyWorkbench";
import { NodexCommandPalette } from "./shell/NodexCommandPalette";
import { NodexMiniBar } from "./shell/NodexMiniBar";
import { NodexModeLineHost } from "./shell/NodexModeLineHost";
import { NodexReplOverlay } from "./shell/NodexReplOverlay";
import { useNodexShell } from "./shell/useNodexShell";
import { useShellLayoutState } from "./shell/layout/ShellLayoutContext";
import { useRegisterShellCoreBlocks } from "./shell/first-party/registerShellCoreBlocks";

const App: React.FC = () => {
  const shellVm = useNodexShell();
  const layout = useShellLayoutState();
  useRegisterShellCoreBlocks();

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <ChromeOnlyWorkbench />
      {layout.visible.modeLine ? <NodexModeLineHost /> : null}
      <NodexCommandPalette vm={shellVm} />
      {layout.visible.miniBar ? <NodexMiniBar vm={shellVm} /> : null}
      <NodexReplOverlay />
    </div>
  );
};

export default App;
