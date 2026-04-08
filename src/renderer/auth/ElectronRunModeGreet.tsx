import React from "react";
import { NodexLogo } from "../components/NodexLogo";
import type { ElectronRunModeChoice } from "./electron-run-mode";
import { ElectronHomeChromeBar } from "./ElectronHomeChromeBar";

export function ElectronRunModeGreet({
  onChoose,
}: {
  onChoose: (mode: ElectronRunModeChoice) => void;
}): React.ReactElement {
  const card =
    "flex flex-col rounded-xl border border-border bg-background/80 p-5 shadow-sm backdrop-blur transition-colors hover:border-primary/30";

  return (
    <div className="relative flex h-screen min-h-0 w-full flex-col items-center justify-center overflow-y-auto bg-background px-4 py-8 text-foreground">
      <ElectronHomeChromeBar />
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
            <span className="font-medium text-foreground">Scratch</span> is a temporary session in this app (local
            storage + IndexedDB, no disk workspace). <span className="font-medium text-foreground">Notes</span> uses your on-disk
            workspace; you can turn on cloud sync anytime from the app.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button type="button" className={card} onClick={() => onChoose("scratch")}>
            <span className="text-[13px] font-semibold">Scratch</span>
            <span className="mt-2 text-left text-[12px] leading-5 text-muted-foreground">
              Try ideas in a throwaway session. Data stays in this app’s local storage and IndexedDB until you start
              a new scratch session or clear it.
            </span>
          </button>
          <button type="button" className={card} onClick={() => onChoose("notes")}>
            <span className="text-[13px] font-semibold">Notes</span>
            <span className="mt-2 text-left text-[12px] leading-5 text-muted-foreground">
              Open your normal workspace on disk. Optional: sign in from <span className="font-medium text-foreground">Sync</span>{" "}
              in the top bar to sync notes with your server when configured.
            </span>
          </button>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Your choice is saved on this device (key{" "}
          <span className="font-mono">nodex.electron.runMode</span>). Use Close from Notes or Exit session from
          Scratch to return here.
        </p>
      </div>
    </div>
  );
}
