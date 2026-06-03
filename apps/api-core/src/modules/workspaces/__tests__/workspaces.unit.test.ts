import { describe, expect, it, vi } from 'vitest';

vi.mock('@washington/db', () => ({
  workspaces: {
    id: 'id',
    name: 'name',
    slug: 'slug',
    active: 'active',
    city: 'city',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: any, _val: any) => ({ type: 'eq' })),
  and: vi.fn((..._args: any[]) => ({ type: 'and' })),
  or: vi.fn((..._args: any[]) => ({ type: 'or' })),
  ilike: vi.fn((_col: any, _val: any) => ({ type: 'ilike' })),
  count: vi.fn(() => ({ type: 'count' })),
  ne: vi.fn((_col: any, _val: any) => ({ type: 'ne' })),
  gt: vi.fn((_col: any, _val: any) => ({ type: 'gt' })),
  isNull: vi.fn((_col: any) => ({ type: 'isNull' })),
  isNotNull: vi.fn((_col: any) => ({ type: 'isNotNull' })),
}));

vi.mock('@washington/shared', () => ({
  AppError: {
    notFound: (resource: string) =>
      Object.assign(new Error(`${resource} não encontrado`), {
        code: 'NOT_FOUND',
        statusCode: 404,
      }),
    conflict: (msg: string) => Object.assign(new Error(msg), { code: 'CONFLICT', statusCode: 409 }),
    validation: (msg: string) =>
      Object.assign(new Error(msg), { code: 'VALIDATION_ERROR', statusCode: 422 }),
    unauthorized: () =>
      Object.assign(new Error('Não autorizado'), { code: 'UNAUTHORIZED', statusCode: 401 }),
    forbidden: () =>
      Object.assign(new Error('Acesso negado'), { code: 'FORBIDDEN', statusCode: 403 }),
  },
}));

import {
  createWorkspace,
  deactivateWorkspace,
  getWorkspace,
  listWorkspaces,
  updateWorkspace,
} from '../service.js';

describe('workspaces service', () => {
  describe('listWorkspaces', () => {
    it('returns a paginated list', async () => {
      const fakeWorkspaces = [
        { id: '1', name: 'Alpha', slug: 'alpha', active: true },
        { id: '2', name: 'Beta', slug: 'beta', active: true },
      ];

      const orderByMock = vi.fn().mockResolvedValue(fakeWorkspaces);
      const offsetMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
      const limitMock = vi.fn().mockReturnValue({ offset: offsetMock });
      const whereMockRows = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMockRows = vi.fn().mockReturnValue({ where: whereMockRows });

      const whereMockCount = vi.fn().mockResolvedValue([{ value: 2 }]);
      const fromMockCount = vi.fn().mockReturnValue({ where: whereMockCount });

      let selectCallCount = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          return selectCallCount % 2 === 1 ? { from: fromMockRows } : { from: fromMockCount };
        }),
      };

      const result = await listWorkspaces(db, { page: 1, limit: 10 });

      expect(result.data).toEqual(fakeWorkspaces);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('applies search filter via ilike', async () => {
      const orderByMock = vi.fn().mockResolvedValue([]);
      const offsetMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
      const limitMock = vi.fn().mockReturnValue({ offset: offsetMock });
      const whereMockRows = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMockRows = vi.fn().mockReturnValue({ where: whereMockRows });

      const whereMockCount = vi.fn().mockResolvedValue([{ value: 0 }]);
      const fromMockCount = vi.fn().mockReturnValue({ where: whereMockCount });

      let calls = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          calls++;
          return calls % 2 === 1 ? { from: fromMockRows } : { from: fromMockCount };
        }),
      };

      const result = await listWorkspaces(db, { page: 1, limit: 10, search: 'São Paulo' });

      expect(whereMockRows).toHaveBeenCalled();
      expect(result.total).toBe(0);
    });

    it('applies active filter', async () => {
      const fakeWorkspaces = [{ id: '1', name: 'Alpha', active: true }];

      const orderByMock = vi.fn().mockResolvedValue(fakeWorkspaces);
      const offsetMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
      const limitMock = vi.fn().mockReturnValue({ offset: offsetMock });
      const whereMockRows = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMockRows = vi.fn().mockReturnValue({ where: whereMockRows });

      const whereMockCount = vi.fn().mockResolvedValue([{ value: 1 }]);
      const fromMockCount = vi.fn().mockReturnValue({ where: whereMockCount });

      let calls = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          calls++;
          return calls % 2 === 1 ? { from: fromMockRows } : { from: fromMockCount };
        }),
      };

      const result = await listWorkspaces(db, { page: 1, limit: 10, active: true });

      expect(result.data).toEqual(fakeWorkspaces);
      expect(result.total).toBe(1);
    });
  });

  describe('getWorkspace', () => {
    it('returns the workspace when found', async () => {
      const workspace = { id: 'ws-1', name: 'Alpha', slug: 'alpha' };
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([workspace]),
          }),
        }),
      };

      const result = await getWorkspace(db, 'ws-1');
      expect(result).toEqual(workspace);
    });

    it('throws notFound for unknown id', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(getWorkspace(db, 'bad-id')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });

  describe('createWorkspace', () => {
    it('inserts and returns new workspace', async () => {
      const newWorkspace = { id: 'ws-new', name: 'New', slug: 'new-slug', active: true };
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([newWorkspace]),
          }),
        }),
      };

      const result = await createWorkspace(db, { name: 'New', slug: 'new-slug' } as any);
      expect(result).toEqual(newWorkspace);
      expect(db.insert).toHaveBeenCalled();
    });

    it('throws conflict on duplicate slug', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ id: 'existing' }]),
          }),
        }),
      };

      await expect(
        createWorkspace(db, { name: 'Dup', slug: 'existing-slug' } as any),
      ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
    });
  });

  describe('updateWorkspace', () => {
    it('updates and returns the workspace', async () => {
      const updated = { id: 'ws-1', name: 'Updated', slug: 'updated-slug', active: true };

      const db: any = {
        select: vi
          .fn()
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ id: 'ws-1' }]),
            }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
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

      const result = await updateWorkspace(db, 'ws-1', { name: 'Updated', slug: 'updated-slug' });
      expect(result).toEqual(updated);
      expect(db.update).toHaveBeenCalled();
    });

    it('throws conflict when new slug belongs to another workspace', async () => {
      const db: any = {
        select: vi
          .fn()
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ id: 'ws-1' }]),
            }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ id: 'ws-other' }]),
            }),
          }),
      };

      await expect(updateWorkspace(db, 'ws-1', { slug: 'taken-slug' })).rejects.toMatchObject({
        code: 'CONFLICT',
        statusCode: 409,
      });
    });

    it('throws notFound when workspace does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(
        updateWorkspace(db, 'nonexistent-id', { name: 'Whatever' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    });

    it('updates without touching slug when slug is not provided', async () => {
      const updated = { id: 'ws-1', name: 'Renamed', slug: 'alpha', active: true };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ id: 'ws-1' }]),
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

      const result = await updateWorkspace(db, 'ws-1', { name: 'Renamed' });
      // slug conflict check should NOT run (only one select call)
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(result).toEqual(updated);
    });
  });

  describe('deactivateWorkspace', () => {
    it('sets active=false for the workspace', async () => {
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ id: 'ws-1' }]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: updateSet }),
      };

      await deactivateWorkspace(db, 'ws-1');

      expect(db.update).toHaveBeenCalled();
      const setArg = updateSet.mock.calls[0]?.[0]!;
      expect(setArg).toMatchObject({ active: false });
    });

    it('throws notFound when workspace does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(deactivateWorkspace(db, 'ghost-id')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });
});
