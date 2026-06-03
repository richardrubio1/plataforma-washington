import { describe, expect, it, vi } from 'vitest';

vi.mock('@washington/db', () => ({
  notifications: {
    id: 'id',
    userId: 'userId',
    title: 'title',
    body: 'body',
    type: 'type',
    readAt: 'readAt',
    createdAt: 'createdAt',
    referenceType: 'referenceType',
    referenceId: 'referenceId',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: any, _val: any) => ({ type: 'eq' })),
  and: vi.fn((..._args: any[]) => ({ type: 'and' })),
  or: vi.fn((..._args: any[]) => ({ type: 'or' })),
  isNull: vi.fn((_col: any) => ({ type: 'isNull' })),
  isNotNull: vi.fn((_col: any) => ({ type: 'isNotNull' })),
  count: vi.fn(() => ({ type: 'count' })),
  desc: vi.fn((_col: any) => ({ type: 'desc' })),
}));

vi.mock('@washington/shared', () => ({
  AppError: {
    notFound: (resource: string) =>
      Object.assign(new Error(`${resource} not found`), { code: 'NOT_FOUND', statusCode: 404 }),
    forbidden: () => Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', statusCode: 403 }),
    conflict: (msg: string) => Object.assign(new Error(msg), { code: 'CONFLICT', statusCode: 409 }),
    unauthorized: () =>
      Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED', statusCode: 401 }),
    validation: (msg: string) =>
      Object.assign(new Error(msg), { code: 'VALIDATION_ERROR', statusCode: 422 }),
  },
}));

import {
  createNotification,
  getUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
} from '../service.js';

function makeListDb(rows: any[], total: number) {
  const orderByMock = vi.fn().mockResolvedValue(rows);
  const offsetMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
  const limitMock = vi.fn().mockReturnValue({ offset: offsetMock });
  const whereMockRows = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMockRows = vi.fn().mockReturnValue({ where: whereMockRows });

  const whereMockCount = vi.fn().mockResolvedValue([{ value: total }]);
  const fromMockCount = vi.fn().mockReturnValue({ where: whereMockCount });

  let selectCall = 0;
  const db: any = {
    select: vi.fn().mockImplementation(() => {
      selectCall++;
      return selectCall % 2 === 1 ? { from: fromMockRows } : { from: fromMockCount };
    }),
  };

  return { db, whereMockRows };
}

describe('notifications service', () => {
  describe('listNotifications', () => {
    it('returns paginated list of notifications', async () => {
      const rows = [
        { id: 'n-1', userId: 'user-1', title: 'Hello', readAt: null },
        { id: 'n-2', userId: 'user-1', title: 'World', readAt: new Date() },
      ];
      const { db } = makeListDb(rows, 2);

      const result = await listNotifications(db, 'user-1', { page: 1, limit: 10 });

      expect(result.data).toEqual(rows);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('calculates totalPages correctly for multiple pages', async () => {
      const rows = Array.from({ length: 5 }, (_, i) => ({ id: `n-${i}`, userId: 'user-1' }));
      const { db } = makeListDb(rows, 25);

      const result = await listNotifications(db, 'user-1', { page: 1, limit: 5 });

      expect(result.totalPages).toBe(5);
    });

    it('unreadOnly filter passes isNull condition when true', async () => {
      const unreadRows = [{ id: 'n-1', userId: 'user-1', readAt: null }];
      const { db, whereMockRows } = makeListDb(unreadRows, 1);

      const result = await listNotifications(db, 'user-1', {
        page: 1,
        limit: 10,
        unreadOnly: true,
      });

      expect(whereMockRows).toHaveBeenCalled();
      expect(result.data).toEqual(unreadRows);
      expect(result.total).toBe(1);
    });

    it('unreadOnly=false returns all notifications without isNull condition', async () => {
      const allRows = [
        { id: 'n-1', userId: 'user-1', readAt: null },
        { id: 'n-2', userId: 'user-1', readAt: new Date() },
      ];
      const { db } = makeListDb(allRows, 2);

      const result = await listNotifications(db, 'user-1', {
        page: 1,
        limit: 10,
        unreadOnly: false,
      });

      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
    });

    it('returns empty data when user has no notifications', async () => {
      const { db } = makeListDb([], 0);

      const result = await listNotifications(db, 'user-no-notifs', { page: 1, limit: 10 });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  describe('getUnreadCount', () => {
    it('returns integer count of unread notifications', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ value: 7 }]),
          }),
        }),
      };

      const result = await getUnreadCount(db, 'user-1');

      expect(result).toBe(7);
      expect(typeof result).toBe('number');
    });

    it('returns 0 when no unread notifications exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ value: 0 }]),
          }),
        }),
      };

      const result = await getUnreadCount(db, 'user-1');

      expect(result).toBe(0);
    });
  });

  describe('markRead', () => {
    it('sets readAt on the notification', async () => {
      const notification = { id: 'n-1', userId: 'user-1', readAt: null };
      const whereMockUpdate = vi.fn().mockResolvedValue(undefined);
      const setMock = vi.fn().mockReturnValue({ where: whereMockUpdate });

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([notification]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: setMock }),
      };

      await markRead(db, 'n-1', 'user-1');

      expect(db.update).toHaveBeenCalled();
      const setArg = setMock.mock.calls[0]?.[0]!;
      expect(setArg).toHaveProperty('readAt');
      expect(setArg.readAt).toBeInstanceOf(Date);
    });

    it('throws notFound when notification does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(markRead(db, 'ghost-id', 'user-1')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });

    it('throws forbidden when notification belongs to a different user', async () => {
      const notification = { id: 'n-1', userId: 'other-user', readAt: null };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([notification]),
          }),
        }),
      };

      await expect(markRead(db, 'n-1', 'requesting-user')).rejects.toMatchObject({
        code: 'FORBIDDEN',
        statusCode: 403,
      });
    });
  });

  describe('markAllRead', () => {
    it('updates all unread notifications for user', async () => {
      const whereMock = vi.fn().mockResolvedValue(undefined);
      const setMock = vi.fn().mockReturnValue({ where: whereMock });

      const db: any = {
        update: vi.fn().mockReturnValue({ set: setMock }),
      };

      await markAllRead(db, 'user-1');

      expect(db.update).toHaveBeenCalled();
      const setArg = setMock.mock.calls[0]?.[0]!;
      expect(setArg).toHaveProperty('readAt');
      expect(setArg.readAt).toBeInstanceOf(Date);
    });

    it('resolves without error when there are no unread notifications', async () => {
      const db: any = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };

      await expect(markAllRead(db, 'user-no-unreads')).resolves.not.toThrow();
    });
  });

  describe('createNotification', () => {
    it('inserts and returns the created notification row', async () => {
      const inserted = {
        id: 'n-new',
        userId: 'user-1',
        title: 'Welcome',
        body: 'Hello there',
        type: 'info' as const,
        readAt: null,
        createdAt: new Date(),
        referenceType: null,
        referenceId: null,
      };
      const returningMock = vi.fn().mockResolvedValue([inserted]);
      const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });

      const db: any = {
        insert: vi.fn().mockReturnValue({ values: valuesMock }),
      };

      const data = {
        userId: 'user-1',
        title: 'Welcome',
        body: 'Hello there',
        type: 'info' as const,
      };

      const result = await createNotification(db, data);

      expect(db.insert).toHaveBeenCalled();
      expect(valuesMock).toHaveBeenCalledWith(data);
      expect(result).toEqual(inserted);
    });

    it('passes referenceType and referenceId when provided', async () => {
      const inserted = {
        id: 'n-ref',
        userId: 'user-2',
        title: 'New assignment',
        body: 'You have a new task',
        type: 'success' as const,
        readAt: null,
        createdAt: new Date(),
        referenceType: 'task',
        referenceId: 'task-42',
      };
      const returningMock = vi.fn().mockResolvedValue([inserted]);
      const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });

      const db: any = {
        insert: vi.fn().mockReturnValue({ values: valuesMock }),
      };

      const data = {
        userId: 'user-2',
        title: 'New assignment',
        body: 'You have a new task',
        type: 'success' as const,
        referenceType: 'task',
        referenceId: 'task-42',
      };

      const result = await createNotification(db, data);

      expect(valuesMock).toHaveBeenCalledWith(data);
      expect(result.referenceType).toBe('task');
      expect(result.referenceId).toBe('task-42');
    });

    it('coerces string count to number in getUnreadCount', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ value: '3' }]),
          }),
        }),
      };

      const result = await getUnreadCount(db, 'user-1');

      expect(result).toBe(3);
      expect(typeof result).toBe('number');
    });

    it('offset is calculated correctly for page > 1', async () => {
      const rows = [{ id: 'n-11', userId: 'user-1' }];
      const offsetMock = vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(rows),
      });
      const limitMock = vi.fn().mockReturnValue({ offset: offsetMock });
      const whereMockRows = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMockRows = vi.fn().mockReturnValue({ where: whereMockRows });

      const whereMockCount = vi.fn().mockResolvedValue([{ value: 15 }]);
      const fromMockCount = vi.fn().mockReturnValue({ where: whereMockCount });

      let selectCall = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          selectCall++;
          return selectCall % 2 === 1 ? { from: fromMockRows } : { from: fromMockCount };
        }),
      };

      await listNotifications(db, 'user-1', { page: 3, limit: 5 });

      // page=3, limit=5 → offset should be (3-1)*5 = 10
      expect(offsetMock).toHaveBeenCalledWith(10);
    });
  });
});
