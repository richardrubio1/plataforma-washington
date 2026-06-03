import { notifications } from '@washington/db';
import { AppError } from '@washington/shared';
import { and, count, desc, eq, isNull } from 'drizzle-orm';

type ListNotificationsQuery = {
  page: number;
  limit: number;
  unreadOnly?: boolean | undefined;
};

type CreateNotificationData = {
  userId: string;
  title: string;
  body: string;
  type: 'info' | 'warning' | 'success' | 'error';
  referenceType?: string;
  referenceId?: string;
};

export async function listNotifications(db: any, userId: string, query: ListNotificationsQuery) {
  const { page, limit, unreadOnly } = query;
  const offset = (page - 1) * limit;

  const conditions: any[] = [eq(notifications.userId, userId)];

  if (unreadOnly) {
    conditions.push(isNull(notifications.readAt));
  }

  const where = and(...conditions);

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(notifications.createdAt)),
    db.select({ value: count() }).from(notifications).where(where),
  ]);

  return {
    data: rows,
    total: Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
  };
}

export async function getUnreadCount(db: any, userId: string): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

  return Number(value);
}

export async function markRead(db: any, notificationId: string, userId: string): Promise<void> {
  const [existing] = await db
    .select({ id: notifications.id, userId: notifications.userId })
    .from(notifications)
    .where(eq(notifications.id, notificationId));

  if (!existing) throw AppError.notFound('Notification');
  if (existing.userId !== userId) throw AppError.forbidden();

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(eq(notifications.id, notificationId));
}

export async function markAllRead(db: any, userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export async function createNotification(db: any, data: CreateNotificationData) {
  const [row] = await db.insert(notifications).values(data).returning();
  return row;
}
