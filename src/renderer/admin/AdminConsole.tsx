import React from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../store";
import { AuditLogPanel } from "./AuditLogPanel";
import { PeoplePanel } from "./PeoplePanel";
import { TeamsPanel } from "./TeamsPanel";

type Tab = "people" | "teams" | "activity";

const wrap = "flex h-full flex-col gap-4 p-4";
const tabBar = "flex border-b border-border";
const tabBtn = (active: boolean): string =>
  `border-b-2 px-3 py-1.5 text-[12px] font-medium transition-colors ${
    active
      ? "border-foreground text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground"
  }`;

/**
 * Phase 7 — admin shell with three tabs (People / Teams / Activity).
 * Each tab is a self-contained, admin-gated panel built in earlier phases.
 */
export function AdminConsole(): React.ReactElement {
  const orgState = useSelector((s: RootState) => s.orgMembership);
  const activeOrg = orgState.orgs.find((o) => o.orgId === orgState.activeOrgId);
  const [tab, setTab] = React.useState<Tab>("people");

  if (!activeOrg) {
    return (
      <div className={wrap}>
        <p className="text-sm text-muted-foreground">
          Select an organization to manage.
        </p>
      </div>
    );
  }

  return (
    <div className={wrap}>
      <header>
        <h1 className="text-base font-semibold">{activeOrg.name}</h1>
        <p className="text-xs text-muted-foreground">
          {activeOrg.role === "admin"
            ? "Admin · People & Permissions"
            : `${activeOrg.role} — admin role required for these screens`}
        </p>
      </header>
      <nav className={tabBar} role="tablist">
        <button
          type="button"
          className={tabBtn(tab === "people")}
          onClick={() => setTab("people")}
          role="tab"
          aria-selected={tab === "people"}
        >
          People
        </button>
        <button
          type="button"
          className={tabBtn(tab === "teams")}
          onClick={() => setTab("teams")}
          role="tab"
          aria-selected={tab === "teams"}
        >
          Teams
        </button>
        <button
          type="button"
          className={tabBtn(tab === "activity")}
          onClick={() => setTab("activity")}
          role="tab"
          aria-selected={tab === "activity"}
        >
          Activity
        </button>
      </nav>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "people" ? <PeoplePanel /> : null}
        {tab === "teams" ? <TeamsPanel /> : null}
        {tab === "activity" ? <AuditLogPanel /> : null}
      </div>
    </div>
  );
}
