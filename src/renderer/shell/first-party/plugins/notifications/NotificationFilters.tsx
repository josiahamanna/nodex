import React from "react";
import type { NotificationFilter } from "../../../../store/notificationSlice";

type Props = {
  currentFilter: NotificationFilter;
  onFilterChange: (filter: NotificationFilter) => void;
};

const filters: { value: NotificationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "org_invite", label: "Invites" },
  { value: "system", label: "System" },
];

export function NotificationFilters({
  currentFilter,
  onFilterChange,
}: Props): React.ReactElement {
  return (
    <div className="flex gap-1 border-b border-border bg-background px-2 py-1.5">
      {filters.map((filter) => (
        <button
          key={filter.value}
          type="button"
          onClick={() => onFilterChange(filter.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            currentFilter === filter.value
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
