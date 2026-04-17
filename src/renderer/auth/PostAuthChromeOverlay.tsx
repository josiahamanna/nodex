import React from "react";
import { useSelector } from "react-redux";
import { AdminConsoleModal } from "../admin/AdminConsoleModal";
import { OrgSwitcher } from "./OrgSwitcher";
import { SpaceSwitcher } from "../spaces/SpaceSwitcher";
import type { RootState } from "../store";

const wrap =
  "pointer-events-auto fixed right-3 top-2 z-40 flex flex-wrap items-center gap-1 sm:right-4";
const btn =
  "rounded-md border border-border/60 bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur hover:bg-muted/30 hover:text-foreground";

/**
 * Post-auth chrome overlay shown on every signed-in surface (web + Electron
 * workbench). Hosts the OrgSwitcher / SpaceSwitcher / Admin entry. Hidden
 * pre-auth or when an invite-accept screen is open (App.tsx short-circuits
 * the auth flow before mounting AuthGate's children in that case).
 */
export function PostAuthChromeOverlay(): React.ReactElement | null {
  const cloudAuth = useSelector((s: RootState) => s.cloudAuth);
  const [adminOpen, setAdminOpen] = React.useState(false);

  if (cloudAuth.status !== "signedIn") {
    return null;
  }

  return (
    <div className={wrap}>
      <OrgSwitcher />
      <SpaceSwitcher />
      <button
        type="button"
        className={btn}
        title="Open admin console (People · Teams · Activity)"
        onClick={() => setAdminOpen(true)}
      >
        ⚙ Admin
      </button>
      <AdminConsoleModal open={adminOpen} onClose={() => setAdminOpen(false)} />
    </div>
  );
}
