import React from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../../../../store";
import {
  loadNotificationsThunk,
  loadUnreadCountThunk,
  markAllAsReadThunk,
} from "../../../../store/notificationSlice";

export function NotificationActions(): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const { notifications } = useSelector((s: RootState) => s.notifications);

  const hasUnread = notifications.some((n) => !n.read);

  const handleMarkAllAsRead = (): void => {
    void dispatch(markAllAsReadThunk()).then(() => {
      void dispatch(loadUnreadCountThunk());
      void dispatch(loadNotificationsThunk());
    });
  };

  if (!hasUnread) {
    return <></>;
  }

  return (
    <div className="border-b border-border bg-muted/5 px-3 py-1.5">
      <button
        type="button"
        onClick={handleMarkAllAsRead}
        className="text-xs text-accent hover:text-accent-foreground hover:underline"
      >
        Mark all as read
      </button>
    </div>
  );
}
