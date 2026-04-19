import React from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../../../../store";
import {
  deleteNotificationThunk,
  loadUnreadCountThunk,
  markAsReadThunk,
} from "../../../../store/notificationSlice";
import type { Notification } from "../../../../auth/notification-client";
import { acceptInvite } from "../../../../auth/auth-client";

type Props = {
  notification: Notification;
};

function getNotificationIcon(type: string): string {
  switch (type) {
    case "org_invite":
      return "📧";
    case "org_invite_accepted":
      return "✅";
    case "mention":
      return "@";
    case "system":
      return "🔔";
    default:
      return "📬";
  }
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function NotificationItem({ notification }: Props): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const [accepting, setAccepting] = React.useState(false);

  const handleClick = (): void => {
    if (!notification.read) {
      void dispatch(markAsReadThunk({ id: notification.id, read: true })).then(() => {
        void dispatch(loadUnreadCountThunk());
      });
    }
    if (notification.actionUrl) {
      // Handle both hash navigation and full path URLs
      if (notification.actionUrl.startsWith('/invite/')) {
        // Full page navigation for invite acceptance
        window.location.href = notification.actionUrl;
      } else if (notification.actionUrl.startsWith('#')) {
        // Hash navigation
        window.location.hash = notification.actionUrl;
      } else {
        // Assume hash navigation if no prefix
        window.location.hash = notification.actionUrl;
      }
    }
  };

  const handleAcceptInvite = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    const inviteToken = notification.metadata?.inviteToken as string | undefined;
    if (!inviteToken) {
      return;
    }
    setAccepting(true);
    try {
      await acceptInvite({ token: inviteToken });
      void dispatch(deleteNotificationThunk(notification.id));
      window.location.reload();
    } catch (error) {
      alert(`Failed to accept invite: ${(error as Error).message}`);
      setAccepting(false);
    }
  };

  const handleDelete = (e: React.MouseEvent): void => {
    e.stopPropagation();
    void dispatch(deleteNotificationThunk(notification.id)).then(() => {
      void dispatch(loadUnreadCountThunk());
    });
  };

  return (
    <div
      onClick={handleClick}
      className={`group relative cursor-pointer px-3 py-2.5 transition-colors hover:bg-muted/30 ${
        !notification.read ? "bg-accent/5" : ""
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 text-lg leading-none">
          {getNotificationIcon(notification.type)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3
              className={`text-sm ${notification.read ? "font-normal text-foreground" : "font-semibold text-foreground"}`}
            >
              {notification.title}
            </h3>
            {!notification.read && (
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
            )}
          </div>

          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {notification.message}
          </p>

          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatRelativeTime(notification.createdAt)}</span>
            {notification.read && notification.readAt && (
              <span className="text-muted-foreground/60">• Read</span>
            )}
          </div>

          {notification.type === "org_invite" && notification.metadata && typeof notification.metadata.inviteToken === "string" && (
            <button
              type="button"
              onClick={handleAcceptInvite}
              disabled={accepting}
              className="mt-2 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {accepting ? "Accepting..." : "Accept Invite"}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-opacity"
          title="Delete notification"
          aria-label="Delete notification"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
