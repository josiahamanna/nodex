import React from "react";

const btn =
  "rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/30 hover:text-foreground";

/**
 * Welcome screen only: reload the window. Workbench actions (Close, Sync, Exit session) live on the shell top bar.
 */
export function ElectronHomeChromeBar(): React.ReactElement {
  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-30 flex flex-wrap justify-end gap-1 sm:right-4 sm:top-4">
      <button
        type="button"
        className={btn}
        title="Reload this window"
        onClick={() => {
          void window.Nodex.reloadWindow();
        }}
      >
        Reload window
      </button>
    </div>
  );
}
