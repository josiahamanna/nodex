import React, { useEffect, useState } from "react";

export interface PluginsSidebarListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const PluginsSidebarList: React.FC<PluginsSidebarListProps> = ({
  selectedId,
  onSelect,
}) => {
  const [rows, setRows] = useState<
    Awaited<ReturnType<typeof window.Nodex.getPluginInventory>>
  >([]);

  const refresh = () => {
    void window.Nodex.getPluginInventory().then(setRows);
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    return window.Nodex.onPluginsChanged(refresh);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {rows.map((r) => {
        const active = selectedId === r.id;
        return (
          <button
            key={r.id}
            type="button"
            title={r.id}
            onClick={() => onSelect(r.id)}
            className={`border-sidebar-border border-b px-3 py-2 text-left text-[12px] transition-colors ${
              active
                ? "bg-sidebar-accent font-medium text-foreground"
                : "text-sidebar-foreground/90 hover:bg-sidebar-accent/40"
            }`}
          >
            <span className="block truncate font-mono">{r.id}</span>
            <span className="mt-0.5 block text-[10px] text-sidebar-foreground/55">
              {r.isBundled
                ? "Core"
                : r.enabled
                  ? r.loaded
                    ? "User · loaded"
                    : "User · not loaded"
                  : "User · disabled"}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default PluginsSidebarList;
