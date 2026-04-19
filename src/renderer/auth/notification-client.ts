import { requestJson } from "./auth-client";
import { getAccessToken } from "./auth-session";

export type NotificationType =
  | "org_invite"
  | "org_invite_accepted"
  | "mention"
  | "system";

export type Notification = {
  id: string;
  userId: string;
  orgId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
  readAt: string | null;
  actionUrl: string | null;
};

export type ListNotificationsResponse = {
  notifications: Notification[];
  total: number;
  limit: number;
  offset: number;
};

export type UnreadCountResponse = {
  count: number;
};

export async function listNotifications(params?: {
  type?: NotificationType;
  read?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ListNotificationsResponse> {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Unauthorized");
  }
  const query = new URLSearchParams();
  if (params?.type) query.set("type", params.type);
  if (params?.read !== undefined) query.set("read", String(params.read));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));

  const url = `/notifications${query.toString() ? `?${query.toString()}` : ""}`;
  return requestJson<ListNotificationsResponse>(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getUnreadCount(): Promise<number> {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Unauthorized");
  }
  const response = await requestJson<UnreadCountResponse>(
    "/notifications/unread-count",
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return response.count;
}

export async function markNotificationAsRead(
  id: string,
  read: boolean,
): Promise<void> {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Unauthorized");
  }
  await requestJson(`/notifications/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ read }),
  });
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Unauthorized");
  }
  await requestJson("/notifications/mark-all-read", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function deleteNotification(id: string): Promise<void> {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Unauthorized");
  }
  await requestJson(`/notifications/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}
