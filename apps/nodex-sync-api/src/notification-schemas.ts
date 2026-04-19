import type { ObjectId } from "mongodb";
import { z } from "zod";

export type NotificationType =
  | "org_invite"
  | "org_invite_accepted"
  | "mention"
  | "system";

export type NotificationDoc = {
  _id: ObjectId;
  userId: string;
  orgId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  read: boolean;
  createdAt: Date;
  readAt?: Date | null;
  actionUrl?: string | null;
};

export const notificationTypeSchema = z.enum([
  "org_invite",
  "org_invite_accepted",
  "mention",
  "system",
]);

export const listNotificationsQuery = z.object({
  type: notificationTypeSchema.optional(),
  read: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(Number.parseInt(v, 10), 100) : 20)),
  offset: z
    .string()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : 0)),
});

export const markAsReadBody = z.object({
  read: z.boolean(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuery>;
export type MarkAsReadInput = z.infer<typeof markAsReadBody>;
