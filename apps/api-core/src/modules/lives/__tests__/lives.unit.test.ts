import { describe, expect, it, vi } from 'vitest';

vi.mock('@washington/db', () => ({
  lives: {
    id: 'id',
    workspaceId: 'workspaceId',
    hostId: 'hostId',
    title: 'title',
    status: 'status',
    scheduledAt: 'scheduledAt',
    startedAt: 'startedAt',
    endedAt: 'endedAt',
    recordingUrl: 'recordingUrl',
    createdAt: 'createdAt',
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
  createLive,
  deleteLive,
  endLive,
  getLive,
  listLives,
  startLive,
  updateLive,
} from '../service.js';

const franqueadoraAdmin = {
  sub: 'admin-id',
  email: 'admin@test.com',
  role: 'franqueadora_admin' as const,
  workspaceId: null as any,
  iat: 0,
  exp: 9999999999,
};

const franqueadoUser = {
  sub: 'franqueado-id',
  email: 'franqueado@test.com',
  role: 'franqueado_admin' as const,
  workspaceId: 'ws-1',
  iat: 0,
  exp: 9999999999,
};

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

describe('lives service', () => {
  describe('listLives', () => {
    it('franqueadora_admin sees all lives without workspace restriction', async () => {
      const rows = [
        { id: 'live-1', workspaceId: 'ws-1', status: 'scheduled' },
        { id: 'live-2', workspaceId: 'ws-2', status: 'live' },
        { id: 'live-3', workspaceId: null, status: 'ended' },
      ];
      const { db } = makeListDb(rows, 3);

      const result = await listLives(db, { page: 1, limit: 10 }, franqueadoraAdmin);

      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('franqueado user sees own workspace and global (null) lives', async () => {
      const rows = [
        { id: 'live-1', workspaceId: 'ws-1', status: 'scheduled' },
        { id: 'live-global', workspaceId: null, status: 'live' },
      ];
      const { db, whereMockRows } = makeListDb(rows, 2);

      const result = await listLives(db, { page: 1, limit: 10 }, franqueadoUser);

      expect(whereMockRows).toHaveBeenCalled();
      expect(result.data).toHaveLength(2);
    });

    it('franqueado user without workspaceId only sees global lives', async () => {
      const rows = [{ id: 'live-global', workspaceId: null, status: 'scheduled' }];
      const { db, whereMockRows } = makeListDb(rows, 1);

      const userWithoutWorkspace = { ...franqueadoUser, workspaceId: null as any };

      const result = await listLives(db, { page: 1, limit: 10 }, userWithoutWorkspace);

      expect(whereMockRows).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
    });

    it('status filter is applied when provided', async () => {
      const rows = [{ id: 'live-1', workspaceId: 'ws-1', status: 'live' }];
      const { db, whereMockRows } = makeListDb(rows, 1);

      const result = await listLives(db, { page: 1, limit: 10, status: 'live' }, franqueadoUser);

      expect(whereMockRows).toHaveBeenCalled();
      expect(result.data[0].status).toBe('live');
    });

    it('returns paginated response shape', async () => {
      const rows = Array.from({ length: 3 }, (_, i) => ({ id: `live-${i}`, workspaceId: null }));
      const { db } = makeListDb(rows, 30);

      const result = await listLives(db, { page: 2, limit: 3 }, franqueadoraAdmin);

      expect(result.page).toBe(2);
      expect(result.limit).toBe(3);
      expect(result.totalPages).toBe(10);
    });
  });

  describe('getLive', () => {
    it('returns the live row for franqueadora_admin regardless of workspace', async () => {
      const existing = {
        id: 'live-1',
        workspaceId: 'ws-other',
        hostId: 'host-1',
        status: 'scheduled',
      };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
      };

      const result = await getLive(db, 'live-1', franqueadoraAdmin);

      expect(result).toEqual(existing);
    });

    it('returns the live row for franqueado when workspaceId matches', async () => {
      const existing = { id: 'live-1', workspaceId: 'ws-1', hostId: 'host-1', status: 'scheduled' };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
      };

      const result = await getLive(db, 'live-1', franqueadoUser);

      expect(result).toEqual(existing);
    });

    it('returns a global live (null workspaceId) to any user', async () => {
      const existing = { id: 'live-global', workspaceId: null, hostId: 'host-1', status: 'live' };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
      };

      const result = await getLive(db, 'live-global', franqueadoUser);

      expect(result).toEqual(existing);
    });

    it('throws notFound when live does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(getLive(db, 'ghost-id', franqueadoUser)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });

    it('throws forbidden when franqueado accesses a different workspace live', async () => {
      const existing = {
        id: 'live-1',
        workspaceId: 'ws-other',
        hostId: 'host-1',
        status: 'scheduled',
      };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
      };

      await expect(getLive(db, 'live-1', franqueadoUser)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        statusCode: 403,
      });
    });
  });

  describe('createLive', () => {
    it('status defaults to scheduled on creation', async () => {
      const createdLive = {
        id: 'live-new',
        hostId: 'host-1',
        title: 'New Live',
        status: 'scheduled',
        workspaceId: null,
      };

      const db: any = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([createdLive]),
          }),
        }),
      };

      const result = await createLive(db, { title: 'New Live' }, 'host-1');

      expect(result.status).toBe('scheduled');
      const valuesArg = db.insert().values.mock.calls[0]?.[0]!;
      expect(valuesArg.status).toBe('scheduled');
    });

    it('sets hostId from the caller argument', async () => {
      const createdLive = { id: 'live-new', hostId: 'host-42', status: 'scheduled' };

      const db: any = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([createdLive]),
          }),
        }),
      };

      const result = await createLive(db, { title: 'Test' }, 'host-42');

      expect(result.hostId).toBe('host-42');
    });

    it('converts scheduledAt string to Date', async () => {
      const isoString = '2026-07-01T10:00:00.000Z';
      const createdLive = { id: 'live-new', status: 'scheduled', scheduledAt: new Date(isoString) };

      const valuesFn = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([createdLive]),
      });

      const db: any = {
        insert: vi.fn().mockReturnValue({ values: valuesFn }),
      };

      await createLive(db, { title: 'Scheduled', scheduledAt: isoString }, 'host-1');

      const valuesArg = valuesFn.mock.calls[0]?.[0]!;
      expect(valuesArg.scheduledAt).toBeInstanceOf(Date);
    });
  });

  describe('updateLive', () => {
    it('updates a live when caller is the host', async () => {
      const existing = { id: 'live-1', hostId: 'host-1', status: 'scheduled', title: 'Old Title' };
      const updated = { ...existing, title: 'New Title' };

      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      });

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: setMock }),
      };

      const result = await updateLive(
        db,
        'live-1',
        { title: 'New Title' },
        'host-1',
        'franqueado_admin',
      );

      expect(result.title).toBe('New Title');
    });

    it('allows franqueadora_admin to update any live', async () => {
      const existing = { id: 'live-1', hostId: 'someone-else', status: 'scheduled', title: 'Old' };
      const updated = { ...existing, title: 'Admin Updated' };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updated]),
            }),
          }),
        }),
      };

      const result = await updateLive(
        db,
        'live-1',
        { title: 'Admin Updated' },
        'admin-id',
        'franqueadora_admin',
      );

      expect(result.title).toBe('Admin Updated');
    });

    it('throws notFound when live does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(
        updateLive(db, 'ghost-id', { title: 'X' }, 'host-1', 'franqueado_admin'),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });

    it('throws forbidden when caller is not host and not franqueadora_admin', async () => {
      const existing = { id: 'live-1', hostId: 'real-host', status: 'scheduled' };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
      };

      await expect(
        updateLive(db, 'live-1', { title: 'Hack' }, 'intruder', 'franqueado_admin'),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        statusCode: 403,
      });
    });

    it('converts scheduledAt string to Date on update', async () => {
      const isoString = '2026-08-15T14:00:00.000Z';
      const existing = { id: 'live-1', hostId: 'host-1', status: 'scheduled' };
      const updated = { ...existing, scheduledAt: new Date(isoString) };

      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      });

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: setMock }),
      };

      await updateLive(db, 'live-1', { scheduledAt: isoString }, 'host-1', 'franqueado_admin');

      const setArg = setMock.mock.calls[0]?.[0]!;
      expect(setArg.scheduledAt).toBeInstanceOf(Date);
    });
  });

  describe('startLive', () => {
    it('sets status=live and startedAt on start', async () => {
      const existing = { id: 'live-1', hostId: 'host-1', status: 'scheduled' };
      const updated = { ...existing, status: 'live', startedAt: new Date() };

      const returningMock = vi.fn().mockResolvedValue([updated]);
      const whereMockUpdate = vi.fn().mockReturnValue({ returning: returningMock });
      const setMock = vi.fn().mockReturnValue({ where: whereMockUpdate });

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: setMock }),
      };

      const result = await startLive(db, 'live-1', 'host-1', 'franqueado_admin');

      expect(result.status).toBe('live');
      const setArg = setMock.mock.calls[0]?.[0]!;
      expect(setArg.status).toBe('live');
      expect(setArg.startedAt).toBeInstanceOf(Date);
    });

    it('throws forbidden when caller is not host and not franqueadora_admin', async () => {
      const existing = { id: 'live-1', hostId: 'real-host', status: 'scheduled' };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
      };

      await expect(startLive(db, 'live-1', 'other-user', 'franqueado_admin')).rejects.toMatchObject(
        {
          code: 'FORBIDDEN',
          statusCode: 403,
        },
      );
    });

    it('allows franqueadora_admin to start any live', async () => {
      const existing = { id: 'live-1', hostId: 'someone-else', status: 'scheduled' };
      const updated = { ...existing, status: 'live', startedAt: new Date() };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updated]),
            }),
          }),
        }),
      };

      const result = await startLive(db, 'live-1', 'admin-id', 'franqueadora_admin');
      expect(result.status).toBe('live');
    });

    it('throws notFound when live does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(startLive(db, 'ghost-id', 'host-1', 'franqueado_admin')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });

  describe('endLive', () => {
    it('sets status=ended and endedAt on end', async () => {
      const existing = { id: 'live-1', hostId: 'host-1', status: 'live' };
      const updated = { ...existing, status: 'ended', endedAt: new Date() };

      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      });

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: setMock }),
      };

      const result = await endLive(db, 'live-1', 'host-1', 'franqueado_admin');

      expect(result.status).toBe('ended');
      const setArg = setMock.mock.calls[0]?.[0]!;
      expect(setArg.status).toBe('ended');
      expect(setArg.endedAt).toBeInstanceOf(Date);
    });

    it('saves recordingUrl when provided', async () => {
      const existing = { id: 'live-1', hostId: 'host-1', status: 'live' };
      const updated = {
        ...existing,
        status: 'ended',
        endedAt: new Date(),
        recordingUrl: 'https://cdn.example.com/rec.mp4',
      };

      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      });

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: setMock }),
      };

      const result = await endLive(
        db,
        'live-1',
        'host-1',
        'franqueado_admin',
        'https://cdn.example.com/rec.mp4',
      );

      expect(result.recordingUrl).toBe('https://cdn.example.com/rec.mp4');
      const setArg = setMock.mock.calls[0]?.[0]!;
      expect(setArg.recordingUrl).toBe('https://cdn.example.com/rec.mp4');
    });

    it('does not include recordingUrl in update when not provided', async () => {
      const existing = { id: 'live-1', hostId: 'host-1', status: 'live' };
      const updated = { ...existing, status: 'ended', endedAt: new Date() };

      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      });

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: setMock }),
      };

      await endLive(db, 'live-1', 'host-1', 'franqueado_admin');

      const setArg = setMock.mock.calls[0]?.[0]!;
      expect(setArg).not.toHaveProperty('recordingUrl');
    });

    it('throws forbidden when caller is not host and not franqueadora_admin', async () => {
      const existing = { id: 'live-1', hostId: 'real-host', status: 'live' };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
      };

      await expect(endLive(db, 'live-1', 'other-user', 'franqueado_admin')).rejects.toMatchObject({
        code: 'FORBIDDEN',
        statusCode: 403,
      });
    });

    it('throws notFound when live does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(endLive(db, 'ghost-id', 'host-1', 'franqueado_admin')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });

    it('allows franqueadora_admin to end any live', async () => {
      const existing = { id: 'live-1', hostId: 'someone-else', status: 'live' };
      const updated = { ...existing, status: 'ended', endedAt: new Date() };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updated]),
            }),
          }),
        }),
      };

      const result = await endLive(db, 'live-1', 'admin-id', 'franqueadora_admin');
      expect(result.status).toBe('ended');
    });
  });

  describe('deleteLive', () => {
    it('deletes a scheduled live successfully', async () => {
      const existing = { id: 'live-1', hostId: 'host-1', status: 'scheduled' };
      const whereMockDelete = vi.fn().mockResolvedValue(undefined);

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        delete: vi.fn().mockReturnValue({ where: whereMockDelete }),
      };

      await deleteLive(db, 'live-1', 'host-1', 'franqueado_admin');

      expect(db.delete).toHaveBeenCalled();
      expect(whereMockDelete).toHaveBeenCalled();
    });

    it('throws conflict when live status is live', async () => {
      const existing = { id: 'live-1', hostId: 'host-1', status: 'live' };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
      };

      await expect(deleteLive(db, 'live-1', 'host-1', 'franqueado_admin')).rejects.toMatchObject({
        code: 'CONFLICT',
        statusCode: 409,
      });
    });

    it('throws conflict when live status is ended', async () => {
      const existing = { id: 'live-1', hostId: 'host-1', status: 'ended' };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
      };

      await expect(deleteLive(db, 'live-1', 'host-1', 'franqueado_admin')).rejects.toMatchObject({
        code: 'CONFLICT',
        statusCode: 409,
      });
    });

    it('throws forbidden when caller is not host and not franqueadora_admin', async () => {
      const existing = { id: 'live-1', hostId: 'real-host', status: 'scheduled' };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
      };

      await expect(deleteLive(db, 'live-1', 'intruder', 'franqueado_admin')).rejects.toMatchObject({
        code: 'FORBIDDEN',
        statusCode: 403,
      });
    });

    it('throws notFound when live does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(deleteLive(db, 'ghost-id', 'host-1', 'franqueado_admin')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });

    it('allows franqueadora_admin to delete any scheduled live', async () => {
      const existing = { id: 'live-1', hostId: 'some-host', status: 'scheduled' };
      const whereMockDelete = vi.fn().mockResolvedValue(undefined);

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        delete: vi.fn().mockReturnValue({ where: whereMockDelete }),
      };

      await expect(
        deleteLive(db, 'live-1', 'admin-id', 'franqueadora_admin'),
      ).resolves.not.toThrow();
      expect(db.delete).toHaveBeenCalled();
    });
  });
});
