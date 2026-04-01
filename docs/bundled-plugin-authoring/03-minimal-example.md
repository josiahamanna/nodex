# Minimal plugin skeleton (illustrative)

The following is **not** a complete ZIP plugin; it shows the **React hook** shape used under `first-party/plugins/`.

```tsx
// useRegisterExamplePlugin.ts
import { useEffect } from "react";
import { useNodexContributionRegistry } from "../../../NodexContributionContext";
import { useShellRegistries } from "../../../registries/ShellRegistriesContext";
import { useShellViewRegistry } from "../../../views/ShellViewContext";

const PLUGIN_ID = "plugin.example";
const VIEW_MAIN = "plugin.example.main";
const TAB = "plugin.example.tab";

export function useRegisterExamplePlugin(): void {
  const regs = useShellRegistries();
  const views = useShellViewRegistry();
  const contrib = useNodexContributionRegistry();

  useEffect(() => {
    const disposers: Array<() => void> = [];

    disposers.push(
      views.registerView({
        id: VIEW_MAIN,
        title: "Example",
        defaultRegion: "mainArea",
        component: ExampleMainView,
        capabilities: { allowedCommands: "allShellCommands", readContext: true },
      }),
    );

    disposers.push(
      regs.tabs.registerTabType({
        id: TAB,
        title: "Example",
        order: 50,
        viewId: VIEW_MAIN,
      }),
    );

    disposers.push(
      contrib.registerCommand({
        id: "nodex.example.open",
        title: "Example: Open",
        category: "Example",
        sourcePluginId: PLUGIN_ID,
        handler: () => {
          regs.tabs.openOrReuseTab(TAB, { title: "Example", reuseKey: "plugin.example" });
          views.openView(VIEW_MAIN, "mainArea");
        },
      }),
    );

    return () => {
      for (const d of disposers) d();
    };
  }, [contrib, regs, views]);
}

function ExampleMainView(): React.ReactElement {
  return <div className="p-4 text-[13px]">Example shell view</div>;
}
```

Register the hook next to other plugins in `App.tsx`. Add a rail item only if you need a visible shortcut.
