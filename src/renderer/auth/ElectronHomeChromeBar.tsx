import { getNodex } from "../../shared/nodex-host-access";
import React from "react";
import { isElectronUserAgent } from "../nodex-web-shim";

const btn =
  "rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/30 hover:text-foreground";

/**
 * Welcome screen only: reload the window. Workbench actions (Close, Sync, Exit session) live on the shell top bar.
 */
export function ElectronHomeChromeBar(): React.ReactElement {
  const cloudWpn =
    isElectronUserAgent() &&
    typeof window !== "undefined" &&
    window.__NODEX_ELECTRON_WPN_BACKEND__ === "cloud";
  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-30 flex flex-wrap justify-end gap-1 sm:right-4 sm:top-4">
      {cloudWpn ? (
        <span
          className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-800 dark:text-sky-200"
          title="This window uses cloud WPN (Mongo). Use File → New local window for a folder vault."
        >
          Cloud WPN
        </span>
      ) : null}
      <button
        type="button"
        className={btn}
        title="Reload this window"
        onClick={() => {
          void getNodex().reloadWindow();
        }}
      >
        Reload window
      </button>
    </div>
  );
}
