import React from "react";

export function NotificationMainView(): React.ReactElement {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <div>
        <div className="mb-4 text-6xl">🔔</div>
        <h2 className="mb-2 text-lg font-semibold text-foreground">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          View your notifications in the sidebar panel on the left.
        </p>
      </div>
    </div>
  );
}
