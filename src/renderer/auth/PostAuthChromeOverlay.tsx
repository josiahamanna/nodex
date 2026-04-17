import React from "react";
import { useSelector } from "react-redux";
import { AdminConsoleModal } from "../admin/AdminConsoleModal";
import { OrgSwitcher } from "./OrgSwitcher";
import { SpaceSwitcher } from "../spaces/SpaceSwitcher";
import type { RootState } from "../store";

const btn =
  "rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/30 hover:text-foreground";

/**
 * Signed-in chrome: Org/Space switchers and Admin entry. Rendered inline in the
 * workbench top-bar right cluster so it flex-layouts alongside the toggle buttons
 * instead of floating over them. Hidden pre-auth.
 */
export function PostAuthChromeOverlay(): React.ReactElement | null {
  const cloudAuth = useSelector((s: RootState) => s.cloudAuth);
  const [adminOpen, setAdminOpen] = React.useState(false);

  if (cloudAuth.status !== "signedIn") {
    return null;
  }

  return (
    <>
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
    </>
  );
}
