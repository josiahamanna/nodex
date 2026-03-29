import React from "react";

export type PrimaryTab = "notes" | "editor" | "settings" | "plugins";

const PRIMARY_TAB_KEY = "nodex-primary-tab";

export function readStoredPrimaryTab(): PrimaryTab {
  try {
    const v = localStorage.getItem(PRIMARY_TAB_KEY);
    if (
      v === "notes" ||
      v === "editor" ||
      v === "settings" ||
      v === "plugins"
    ) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return "notes";
}

export function writeStoredPrimaryTab(tab: PrimaryTab): void {
  try {
    localStorage.setItem(PRIMARY_TAB_KEY, tab);
  } catch {
    /* ignore */
  }
}

const TAB_META: {
  id: PrimaryTab;
  label: string;
  Icon: React.FC<{ className?: string }>;
}[] = [
  {
    id: "notes",
    label: "Notes",
    Icon: ({ className }) => (
      <svg
        className={className}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    id: "editor",
    label: "Editor",
    Icon: ({ className }) => (
      <svg
        className={className}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    Icon: ({ className }) => (
      <svg
        className={className}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
  },
  {
    id: "plugins",
    label: "Plugins",
    Icon: ({ className }) => (
      <svg
        className={className}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
];

const tabBtnBase =
  "flex items-center justify-center rounded-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring";
const tabBtnH =
  "min-h-9 min-w-0 flex-1 px-1 text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground";
const tabBtnV =
  "h-10 w-10 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground";
const tabBtnActive = "bg-sidebar-accent text-foreground shadow-sm";

export interface PrimarySidebarShellProps {
  primaryTab: PrimaryTab;
  onPrimaryTabChange: (t: PrimaryTab) => void;
  sidebarCollapsed: boolean;
  onToggleSidebarCollapsed: () => void;
  children: React.ReactNode;
}

const PrimarySidebarShell: React.FC<PrimarySidebarShellProps> = ({
  primaryTab,
  onPrimaryTabChange,
  sidebarCollapsed,
  onToggleSidebarCollapsed,
  children,
}) => {
  const renderTabButton = (collapsed: boolean) =>
    TAB_META.map(({ id, label, Icon }) => {
      const active = primaryTab === id;
      return (
        <button
          key={id}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={active}
          className={`${tabBtnBase} ${collapsed ? tabBtnV : tabBtnH} ${
            active ? tabBtnActive : ""
          }`}
          onClick={() => onPrimaryTabChange(id)}
        >
          <Icon className={active ? "opacity-100" : "opacity-80"} />
        </button>
      );
    });

  if (sidebarCollapsed) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground">
        <div className="flex shrink-0 flex-col items-center border-sidebar-border border-b py-2">
          <span
            className="mb-1 font-semibold text-[11px] text-sidebar-foreground/80"
            title="Nodex"
          >
            N
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto py-2">
          {renderTabButton(true)}
        </div>
        <div className="shrink-0 border-sidebar-border border-t p-1">
          <button
            type="button"
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="flex h-10 w-full items-center justify-center rounded-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            onClick={onToggleSidebarCollapsed}
          >
            <span className="text-sm" aria-hidden>
              »
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground">
      <div className="shrink-0 border-sidebar-border border-b px-3 py-2.5">
        <h1 className="text-[13px] font-semibold leading-tight text-sidebar-foreground">
          Nodex
        </h1>
        <p className="mt-0.5 text-[10px] leading-snug text-sidebar-foreground/50">
          Programmable Knowledge System
        </p>
      </div>
      <div
        className="flex shrink-0 flex-row border-sidebar-border border-b px-1 py-1.5"
        role="tablist"
        aria-label="Primary"
      >
        {renderTabButton(false)}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden flex flex-col">
        {children}
      </div>
      <div className="shrink-0 border-sidebar-border border-t px-1 py-1">
        <button
          type="button"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          className="flex h-8 w-full items-center justify-end gap-1 rounded-sm px-2 text-[11px] text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
          onClick={onToggleSidebarCollapsed}
        >
          <span aria-hidden>«</span>
          <span className="sr-only">Collapse</span>
        </button>
      </div>
    </div>
  );
};

export default PrimarySidebarShell;
