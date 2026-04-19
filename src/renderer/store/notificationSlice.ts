import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "./index";
import {
  deleteNotification as deleteNotificationApi,
  getUnreadCount,
  listNotifications,
  markAllNotificationsAsRead as markAllAsReadApi,
  markNotificationAsRead as markAsReadApi,
  type Notification,
  type NotificationType,
} from "../auth/notification-client";

export type NotificationFilter = "all" | "unread" | NotificationType;

export type NotificationState = {
  notifications: Notification[];
  unreadCount: number;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  filter: NotificationFilter;
  total: number;
  offset: number;
  limit: number;
};

const initialState: NotificationState = {
  notifications: [],
  unreadCount: 0,
  status: "idle",
  error: null,
  filter: "all",
  total: 0,
  offset: 0,
  limit: 20,
};

export const loadNotificationsThunk = createAsyncThunk<
  { notifications: Notification[]; total: number },
  { filter?: NotificationFilter; offset?: number } | undefined
>("notifications/load", async (params, { getState }) => {
  const state = (getState() as RootState).notifications;
  const filter = params?.filter ?? state.filter;
  const offset = params?.offset ?? 0;

  const queryParams: {
    type?: NotificationType;
    read?: boolean;
    limit: number;
    offset: number;
  } = {
    limit: state.limit,
    offset,
  };

  if (filter === "unread") {
    queryParams.read = false;
  } else if (
    filter === "org_invite" ||
    filter === "org_invite_accepted" ||
    filter === "mention" ||
    filter === "system"
  ) {
    queryParams.type = filter;
  }

  const response = await listNotifications(queryParams);
  return {
    notifications: response.notifications,
    total: response.total,
  };
});

export const loadUnreadCountThunk = createAsyncThunk<number>(
  "notifications/loadUnreadCount",
  async () => {
    return await getUnreadCount();
  },
);

export const markAsReadThunk = createAsyncThunk<
  { id: string; read: boolean },
  { id: string; read: boolean }
>("notifications/markAsRead", async ({ id, read }) => {
  await markAsReadApi(id, read);
  return { id, read };
});

export const markAllAsReadThunk = createAsyncThunk(
  "notifications/markAllAsRead",
  async () => {
    await markAllAsReadApi();
  },
);

export const deleteNotificationThunk = createAsyncThunk<string, string>(
  "notifications/delete",
  async (id) => {
    await deleteNotificationApi(id);
    return id;
  },
);

const slice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    setFilter(state, action: PayloadAction<NotificationFilter>): void {
      state.filter = action.payload;
      state.offset = 0;
    },
    clearNotifications(): NotificationState {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadNotificationsThunk.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(loadNotificationsThunk.fulfilled, (state, action) => {
        state.status = "ready";
        state.notifications = action.payload.notifications;
        state.total = action.payload.total;
      })
      .addCase(loadNotificationsThunk.rejected, (state, action) => {
        state.status = "error";
        state.error = action.error.message ?? "Failed to load notifications";
      })
      .addCase(loadUnreadCountThunk.fulfilled, (state, action) => {
        state.unreadCount = action.payload;
      })
      .addCase(markAsReadThunk.fulfilled, (state, action) => {
        const notification = state.notifications.find(
          (n) => n.id === action.payload.id,
        );
        if (notification) {
          notification.read = action.payload.read;
          if (action.payload.read) {
            notification.readAt = new Date().toISOString();
            state.unreadCount = Math.max(0, state.unreadCount - 1);
          } else {
            notification.readAt = null;
            state.unreadCount += 1;
          }
        }
      })
      .addCase(markAllAsReadThunk.fulfilled, (state) => {
        state.notifications.forEach((n) => {
          if (!n.read) {
            n.read = true;
            n.readAt = new Date().toISOString();
          }
        });
        state.unreadCount = 0;
      })
      .addCase(deleteNotificationThunk.fulfilled, (state, action) => {
        const index = state.notifications.findIndex((n) => n.id === action.payload);
        if (index !== -1) {
          const wasUnread = !state.notifications[index].read;
          state.notifications.splice(index, 1);
          state.total = Math.max(0, state.total - 1);
          if (wasUnread) {
            state.unreadCount = Math.max(0, state.unreadCount - 1);
          }
        }
      });
  },
});

export const { setFilter, clearNotifications } = slice.actions;

export const selectUnreadCount = (state: RootState): number =>
  state.notifications.unreadCount;

export const selectFilteredNotifications = (state: RootState): Notification[] =>
  state.notifications.notifications;

export default slice.reducer;
