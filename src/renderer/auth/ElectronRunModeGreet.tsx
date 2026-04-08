import React from "react";
import { NodexLogo } from "../components/NodexLogo";
import type { ElectronRunModeChoice } from "./electron-run-mode";

export function ElectronRunModeGreet({
  onChoose,
}: {
  onChoose: (mode: ElectronRunModeChoice) => void;
}): React.ReactElement {
  const card =
    "flex flex-col rounded-xl border border-border bg-background/80 p-5 shadow-sm backdrop-blur transition-colors hover:border-primary/30";

  return (
    <div className="relative flex h-screen min-h-0 w-full flex-col items-center justify-center overflow-y-auto bg-background px-4 py-8 text-foreground">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-48 -right-40 h-[34rem] w-[34rem] rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted/10 text-primary">
            <NodexLogo className="h-7 w-7" title="Nodex" />
          </div>
          <h1 className="mt-4 text-balance text-[22px] font-semibold tracking-tight">
            How do you want to use Nodex?
          </h1>
          <p className="mt-2 max-w-md text-pretty text-[12px] leading-5 text-muted-foreground">
            Choose <span className="font-medium text-foreground">Local</span> for offline work with no
            account, or <span className="font-medium text-foreground">Cloud</span> to sign in and sync
            with the hosted API.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button type="button" className={card} onClick={() => onChoose("local")}>
            <span className="text-[13px] font-semibold">Local</span>
            <span className="mt-2 text-left text-[12px] leading-5 text-muted-foreground">
              Pick a folder on disk when you create a workspace, or start a scratch session (temp — save when
              ready). No account.
            </span>
          </button>
          <button type="button" className={card} onClick={() => onChoose("cloud")}>
            <span className="text-[13px] font-semibold">Cloud</span>
            <span className="mt-2 text-left text-[12px] leading-5 text-muted-foreground">
              Sign in or create an account to use the cloud sync API (same as the web app).
            </span>
          </button>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Your choice is saved on this device. To switch later, clear app data / local storage for
          Nodex (key <span className="font-mono">nodex.electron.runMode</span>).
        </p>
      </div>
    </div>
  );
}
