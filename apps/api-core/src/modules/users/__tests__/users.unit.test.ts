import { describe, expect, it, vi } from 'vitest';

vi.mock('@washington/db', () => ({
  users: {
    id: 'id',
    email: 'email',
    name: 'name',
    role: 'role',
    workspaceId: 'workspaceId',
    brandId: 'brandId',
    active: 'active',
    avatarUrl: 'avatarUrl',
    wsmartId: 'wsmartId',
    wwwbId: 'wwwbId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    passwordHash: 'passwordHash',
  },
  inviteTokens: {
    id: 'id',
    email: 'email',
    role: 'role',
    workspaceId: 'workspaceId',
    token: 'token',
    invitedBy: 'invitedBy',
    expiresAt: 'expiresAt',
    acceptedAt: 'acceptedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: any, _val: any) => ({ type: 'eq' })),
  and: vi.fn((..._args: any[]) => ({ type: 'and' })),
  or: vi.fn((..._args: any[]) => ({ type: 'or' })),
  ilike: vi.fn((_col: any, _val: any) => ({ type: 'ilike' })),
  count: vi.fn(() => ({ type: 'count' })),
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

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn().mockReturnValue({
      toString: vi.fn().mockReturnValue('fake-token-48-chars-hex'),
    }),
  },
}));

import {
  acceptInvite,
  createUser,
  deactivateUser,
  getUser,
  inviteUser,
  listUsers,
  updateUser,
} from '../service.js';

describe('users service', () => {
  describe('listUsers', () => {
    it('franqueadora_admin sees all users', async () => {
      const allUsers = [
        { id: 'u1', email: 'a@a.com', name: 'Ana', role: 'aluno', workspaceId: 'ws-1' },
        { id: 'u2', email: 'b@b.com', name: 'Bob', role: 'aluno', workspaceId: 'ws-2' },
      ];

      const orderBy = vi.fn().mockResolvedValue(allUsers);
      const offset = vi.fn().mockReturnValue({ orderBy });
      const limit = vi.fn().mockReturnValue({ offset });
      const whereRows = vi.fn().mockReturnValue({ limit });
      const fromRows = vi.fn().mockReturnValue({ where: whereRows });

      const whereCount = vi.fn().mockResolvedValue([{ value: 2 }]);
      const fromCount = vi.fn().mockReturnValue({ where: whereCount });

      let calls = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          calls++;
          return calls % 2 === 1 ? { from: fromRows } : { from: fromCount };
        }),
      };

      const result = await listUsers(db, { page: 1, limit: 10 }, 'franqueadora_admin', null);

      expect(result.data).toEqual(allUsers);
      expect(result.total).toBe(2);
    });

    it('franqueado_admin only sees own workspace users', async () => {
      const ws1Users = [
        { id: 'u1', email: 'a@a.com', name: 'Ana', role: 'aluno', workspaceId: 'ws-1' },
      ];

      const orderBy = vi.fn().mockResolvedValue(ws1Users);
      const offset = vi.fn().mockReturnValue({ orderBy });
      const limit = vi.fn().mockReturnValue({ offset });
      const whereRows = vi.fn().mockReturnValue({ limit });
      const fromRows = vi.fn().mockReturnValue({ where: whereRows });

      const whereCount = vi.fn().mockResolvedValue([{ value: 1 }]);
      const fromCount = vi.fn().mockReturnValue({ where: whereCount });

      let calls = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          calls++;
          return calls % 2 === 1 ? { from: fromRows } : { from: fromCount };
        }),
      };

      const result = await listUsers(db, { page: 1, limit: 10 }, 'franqueado_admin', 'ws-1');

      expect(result.data).toEqual(ws1Users);
      expect(result.total).toBe(1);
    });

    it('franqueado_admin without workspaceId returns empty list immediately', async () => {
      const db: any = { select: vi.fn() };

      const result = await listUsers(db, { page: 1, limit: 10 }, 'franqueado_admin', null);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(db.select).not.toHaveBeenCalled();
    });
  });

  describe('getUser', () => {
    it('returns user without passwordHash', async () => {
      const row = {
        id: 'u1',
        email: 'a@a.com',
        name: 'Ana',
        role: 'aluno',
        workspaceId: 'ws-1',
        brandId: '1',
        active: true,
        avatarUrl: null,
        wsmartId: null,
        wwwbId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([row]),
          }),
        }),
      };

      const result = await getUser(db, 'u1');
      expect(result).toEqual(row);
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('throws notFound for unknown id', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(getUser(db, 'bad-id')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });

  describe('createUser', () => {
    it('hashes password and inserts the user', async () => {
      const inserted = {
        id: 'u-new',
        email: 'new@new.com',
        name: 'New User',
        role: 'aluno',
        workspaceId: 'ws-1',
        brandId: '1',
        active: true,
        avatarUrl: null,
        wsmartId: null,
        wwwbId: null,
        passwordHash: 'hashed-password',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const insertValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([inserted]),
      });

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
        insert: vi.fn().mockReturnValue({ values: insertValues }),
      };

      const result = await createUser(db, {
        email: 'new@new.com',
        name: 'New User',
        role: 'aluno',
        password: 'secret',
      } as any);

      expect(db.insert).toHaveBeenCalled();
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: 'hashed-password' }),
      );
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('throws conflict on duplicate email', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ id: 'existing' }]),
          }),
        }),
      };

      await expect(
        createUser(db, { email: 'dup@dup.com', name: 'Dup', role: 'aluno', password: 'pw' } as any),
      ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
    });
  });

  describe('updateUser', () => {
    it('updates and returns user without passwordHash', async () => {
      const updated = {
        id: 'u1',
        email: 'a@a.com',
        name: 'Updated Name',
        role: 'aluno',
        workspaceId: 'ws-1',
        brandId: '1',
        active: true,
        avatarUrl: null,
        wsmartId: null,
        wwwbId: null,
        passwordHash: 'hashed-password',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const _updateWhere = vi.fn().mockResolvedValue([updated]);
      const updateReturning = vi.fn().mockResolvedValue([updated]);
      const updateSet = vi
        .fn()
        .mockReturnValue({ where: vi.fn().mockReturnValue({ returning: updateReturning }) });

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ id: 'u1' }]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: updateSet }),
      };

      const result = await updateUser(db, 'u1', { name: 'Updated Name' });

      expect(db.update).toHaveBeenCalled();
      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Updated Name', updatedAt: expect.any(Date) }),
      );
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('throws notFound when updating non-existent user', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(updateUser(db, 'ghost-id', { name: 'Ghost' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });

  describe('deactivateUser', () => {
    it('sets active=false for existing user', async () => {
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ id: 'u1' }]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: updateSet }),
      };

      await deactivateUser(db, 'u1');

      expect(db.update).toHaveBeenCalled();
      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({ active: false, updatedAt: expect.any(Date) }),
      );
    });

    it('throws notFound when deactivating non-existent user', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(deactivateUser(db, 'ghost-id')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });

  describe('inviteUser', () => {
    it('generates token and inserts invite with 48h expiry', async () => {
      const insertValues = vi.fn().mockResolvedValue(undefined);
      const db: any = {
        insert: vi.fn().mockReturnValue({ values: insertValues }),
      };

      const before = Date.now();
      const result = await inviteUser(db, {
        email: 'invite@test.com',
        role: 'franqueado_professor',
        workspaceId: 'ws-1',
        invitedBy: 'admin-id',
      });
      const after = Date.now();

      expect(result.token).toBeTruthy();
      expect(typeof result.token).toBe('string');
      expect(db.insert).toHaveBeenCalled();

      const insertedValues = insertValues.mock.calls[0]?.[0]!;
      expect(insertedValues.email).toBe('invite@test.com');
      expect(insertedValues.role).toBe('franqueado_professor');
      expect(insertedValues.workspaceId).toBe('ws-1');
      expect(insertedValues.invitedBy).toBe('admin-id');

      const expectedMin = new Date(before + 48 * 60 * 60 * 1000 - 100);
      const expectedMax = new Date(after + 48 * 60 * 60 * 1000 + 100);
      expect(insertedValues.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime());
      expect(insertedValues.expiresAt.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
    });
  });

  describe('acceptInvite', () => {
    it('creates user and marks invite as accepted', async () => {
      const invite = {
        id: 'inv-1',
        email: 'invite@test.com',
        role: 'aluno',
        workspaceId: 'ws-1',
        token: 'valid-token',
        acceptedAt: null,
        expiresAt: new Date(Date.now() + 10_000),
      };

      const createdUser = {
        id: 'u-new',
        email: 'invite@test.com',
        name: 'New User',
        role: 'aluno',
        workspaceId: 'ws-1',
        brandId: '1',
        active: true,
        avatarUrl: null,
        wsmartId: null,
        wwwbId: null,
        passwordHash: 'hashed-password',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([invite]),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([createdUser]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: updateSet }),
      };

      const result = await acceptInvite(db, 'valid-token', 'New User', 'secret');

      expect(db.insert).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();

      const setArg = updateSet.mock.calls[0]?.[0]!;
      expect(setArg.acceptedAt).toBeInstanceOf(Date);

      expect((result as any).passwordHash).toBeUndefined();
      expect(result.email).toBe('invite@test.com');
    });

    it('throws validation error on expired or invalid token', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(acceptInvite(db, 'expired-token', 'User', 'pw')).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 422,
      });
    });
  });
});
