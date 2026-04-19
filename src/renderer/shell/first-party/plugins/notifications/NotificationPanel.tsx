import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../../../../store";
import {
  loadNotificationsThunk,
  loadUnreadCountThunk,
  setFilter,
  type NotificationFilter,
} from "../../../../store/notificationSlice";
import { NotificationFilters } from "./NotificationFilters";
import { NotificationItem } from "./NotificationItem";
import { NotificationActions } from "./NotificationActions";

export function NotificationPanel(): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const { notifications, status, filter, total } = useSelector(
    (s: RootState) => s.notifications,
  );

  useEffect(() => {
    void dispatch(loadNotificationsThunk());
    void dispatch(loadUnreadCountThunk());
  }, [dispatch]);

  useEffect(() => {
    void dispatch(loadNotificationsThunk({ filter }));
  }, [dispatch, filter]);

  const handleFilterChange = (newFilter: NotificationFilter): void => {
    dispatch(setFilter(newFilter));
  };

  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
        Loading notifications...
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-red-600 dark:text-red-400">
        Failed to load notifications
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-muted/10 px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
        <p className="text-xs text-muted-foreground">
          {total} {total === 1 ? "notification" : "notifications"}
        </p>
      </div>

      <NotificationFilters currentFilter={filter} onFilterChange={handleFilterChange} />

      {notifications.length > 0 && <NotificationActions />}

      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="mb-2 text-4xl">🔔</div>
            <p className="text-sm font-medium text-foreground">
              {filter === "unread"
                ? "No unread notifications"
                : filter === "all"
                  ? "You're all caught up!"
                  : `No ${filter.replace("_", " ")} notifications`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {filter === "all"
                ? "Notifications will appear here"
                : "Try changing the filter"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map((notification) => (
              <NotificationItem key={notification.id} notification={notification} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
