import { describe, expect, it, vi } from 'vitest';

vi.mock('@washington/db', () => ({
  trainingModules: {
    id: 'id',
    workspaceId: 'workspaceId',
    authorId: 'authorId',
    active: 'active',
    requiredRole: 'requiredRole',
    requiredPermission: 'requiredPermission',
    order: 'order',
    createdAt: 'createdAt',
  },
  trainingLessons: {
    id: 'id',
    moduleId: 'moduleId',
    order: 'order',
    createdAt: 'createdAt',
  },
  trainingProgress: {
    id: 'id',
    userId: 'userId',
    lessonId: 'lessonId',
  },
  userPermissions: {
    userId: 'userId',
    permission: 'permission',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: any, _val: any) => ({ type: 'eq' })),
  and: vi.fn((..._args: any[]) => ({ type: 'and' })),
  or: vi.fn((..._args: any[]) => ({ type: 'or' })),
  isNull: vi.fn((_col: any) => ({ type: 'isNull' })),
  isNotNull: vi.fn((_col: any) => ({ type: 'isNotNull' })),
  count: vi.fn(() => ({ type: 'count' })),
  sql: Object.assign(
    vi.fn((_strings: TemplateStringsArray, ..._values: any[]) => ({ type: 'sql' })),
    {
      join: vi.fn(() => ({ type: 'sql-join' })),
    },
  ),
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
  addLesson,
  completeLesson,
  createModule,
  deactivateModule,
  deleteLesson,
  getModule,
  listModules,
  updateLesson,
  updateModule,
} from '../service.js';

const franqueadoraAdmin = {
  sub: 'admin-id',
  email: 'admin@test.com',
  role: 'franqueadora_admin' as const,
  workspaceId: null as any,
  iat: 0,
  exp: 9999999999,
};

const franqueadoAdmin = {
  sub: 'franqueado-id',
  email: 'franqueado@test.com',
  role: 'franqueado_admin' as const,
  workspaceId: 'ws-1',
  iat: 0,
  exp: 9999999999,
};

function makeDbForListModules(
  modules: any[],
  total: number,
  lessonCounts: any[] = [],
  progressCounts: any[] = [],
  userPerms: any[] = [],
) {
  const orderByMock = vi.fn().mockResolvedValue(modules);
  const offsetMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
  const limitMock = vi.fn().mockReturnValue({ offset: offsetMock });
  const whereMockRows = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMockRows = vi.fn().mockReturnValue({ where: whereMockRows });

  const whereMockCount = vi.fn().mockResolvedValue([{ value: total }]);
  const fromMockCount = vi.fn().mockReturnValue({ where: whereMockCount });

  let selectCall = 0;

  const innerJoinMock = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      groupBy: vi.fn().mockResolvedValue(progressCounts),
    }),
  });

  const groupByAfterLessonWhere = vi.fn().mockResolvedValue(lessonCounts);
  const whereMockLessons = vi.fn().mockReturnValue({ groupBy: groupByAfterLessonWhere });
  const fromMockLessons = vi.fn().mockReturnValue({ where: whereMockLessons });

  const whereMockPerms = vi.fn().mockResolvedValue(userPerms);
  const fromMockPerms = vi.fn().mockReturnValue({ where: whereMockPerms });

  const db: any = {
    select: vi.fn().mockImplementation((fields?: any) => {
      selectCall++;
      if (selectCall === 1) return { from: fromMockRows };
      if (selectCall === 2) return { from: fromMockCount };
      if (fields && fields.moduleId !== undefined && fields.lessonCount !== undefined) {
        return { from: fromMockLessons };
      }
      if (fields && fields.moduleId !== undefined && fields.completedCount !== undefined) {
        return { from: vi.fn().mockReturnValue({ innerJoin: innerJoinMock }) };
      }
      return { from: fromMockPerms };
    }),
  };

  return db;
}

describe('training service', () => {
  describe('listModules', () => {
    it('requiredRole filter is respected for non-admin users', async () => {
      const modules = [
        { id: 'mod-1', requiredRole: 'franqueado_admin', requiredPermission: null, active: true },
        { id: 'mod-2', requiredRole: 'aluno', requiredPermission: null, active: true },
        { id: 'mod-3', requiredRole: null, requiredPermission: null, active: true },
      ];

      const db = makeDbForListModules(modules, 3);

      const result = await listModules(db, { page: 1, limit: 10 }, franqueadoAdmin);

      const ids = result.data.map((m: any) => m.id);
      expect(ids).toContain('mod-1');
      expect(ids).toContain('mod-3');
      expect(ids).not.toContain('mod-2');
    });

    it('franqueadora_admin sees all roles without filter', async () => {
      const modules = [
        { id: 'mod-1', requiredRole: 'aluno', requiredPermission: null, active: false },
        {
          id: 'mod-2',
          requiredRole: 'franqueado_professor',
          requiredPermission: null,
          active: true,
        },
      ];

      const db = makeDbForListModules(modules, 2);

      const result = await listModules(db, { page: 1, limit: 10 }, franqueadoraAdmin);

      expect(result.data.map((m: any) => m.id)).toEqual(['mod-1', 'mod-2']);
    });

    it('requiredPermission filter excludes module when user lacks permission', async () => {
      const modules = [
        { id: 'mod-perm', requiredRole: null, requiredPermission: 'special_access', active: true },
        { id: 'mod-free', requiredRole: null, requiredPermission: null, active: true },
      ];

      const db = makeDbForListModules(modules, 2, [], [], []);

      const result = await listModules(db, { page: 1, limit: 10 }, franqueadoAdmin);

      const ids = result.data.map((m: any) => m.id);
      expect(ids).not.toContain('mod-perm');
      expect(ids).toContain('mod-free');
    });

    it('requiredPermission filter includes module when user has permission', async () => {
      const modules = [
        { id: 'mod-perm', requiredRole: null, requiredPermission: 'special_access', active: true },
        { id: 'mod-free', requiredRole: null, requiredPermission: null, active: true },
      ];

      const db = makeDbForListModules(modules, 2, [], [], [{ permission: 'special_access' }]);

      const result = await listModules(db, { page: 1, limit: 10 }, franqueadoAdmin);

      const ids = result.data.map((m: any) => m.id);
      expect(ids).toContain('mod-perm');
      expect(ids).toContain('mod-free');
    });

    it('includes progressPercent in each module', async () => {
      const modules = [{ id: 'mod-1', requiredRole: null, requiredPermission: null, active: true }];

      const lessonCounts = [{ moduleId: 'mod-1', lessonCount: 4 }];
      const progressCounts = [{ moduleId: 'mod-1', completedCount: 2 }];

      const db = makeDbForListModules(modules, 1, lessonCounts, progressCounts);

      const result = await listModules(
        db,
        { page: 1, limit: 10 },
        {
          ...franqueadoAdmin,
          sub: 'user-1',
        },
      );

      const mod = result.data[0];
      expect(mod).toHaveProperty('progressPercent');
      expect(mod).toHaveProperty('lessonCount');
    });

    it('progressPercent is 0 when module has no lessons', async () => {
      const modules = [
        { id: 'mod-empty', requiredRole: null, requiredPermission: null, active: true },
      ];

      const db = makeDbForListModules(modules, 1, [], []);

      const result = await listModules(db, { page: 1, limit: 10 }, franqueadoAdmin);

      expect(result.data[0].progressPercent).toBe(0);
    });
  });

  describe('getModule', () => {
    it('returns module with lessons array and isCompleted per lesson', async () => {
      const module = { id: 'mod-1', title: 'Intro', authorId: 'author-1' };
      const lessons = [
        { id: 'lesson-1', moduleId: 'mod-1', order: 1 },
        { id: 'lesson-2', moduleId: 'mod-1', order: 2 },
      ];

      const orderByMockLessons = vi.fn().mockResolvedValue(lessons);
      const whereMockLessons = vi.fn().mockReturnValue({ orderBy: orderByMockLessons });
      const fromMockLessons = vi.fn().mockReturnValue({ where: whereMockLessons });

      const whereMockProgress = vi.fn().mockResolvedValue([{ lessonId: 'lesson-1' }]);
      const fromMockProgress = vi.fn().mockReturnValue({ where: whereMockProgress });

      let selectCall = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          selectCall++;
          if (selectCall === 1) {
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([module]),
              }),
            };
          }
          if (selectCall === 2) return { from: fromMockLessons };
          return { from: fromMockProgress };
        }),
      };

      const result = await getModule(db, 'mod-1', 'user-1');

      expect(result.id).toBe('mod-1');
      expect(result.lessons).toHaveLength(2);
      const l1 = result.lessons.find((l: any) => l.id === 'lesson-1');
      const l2 = result.lessons.find((l: any) => l.id === 'lesson-2');
      expect(l1.isCompleted).toBe(true);
      expect(l2.isCompleted).toBe(false);
    });

    it('throws notFound when module does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(getModule(db, 'ghost-id', 'user-1')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });

    it('returns lessons with isCompleted=false when module has no lessons', async () => {
      const module = { id: 'mod-1', title: 'Empty', authorId: 'author-1' };

      let selectCall = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          selectCall++;
          if (selectCall === 1) {
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([module]),
              }),
            };
          }
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue([]),
              }),
            }),
          };
        }),
      };

      const result = await getModule(db, 'mod-1', 'user-1');
      expect(result.lessons).toEqual([]);
    });
  });

  describe('addLesson', () => {
    it('allows module author to add a lesson', async () => {
      const module = { id: 'mod-1', authorId: 'author-1' };
      const newLesson = { id: 'lesson-new', moduleId: 'mod-1', title: 'Lesson A' };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([module]),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([newLesson]),
          }),
        }),
      };

      const result = await addLesson(
        db,
        'mod-1',
        { title: 'Lesson A' },
        'author-1',
        'franqueado_admin',
      );

      expect(result).toEqual(newLesson);
      expect(db.insert).toHaveBeenCalled();
    });

    it('allows franqueadora_admin to add a lesson regardless of authorship', async () => {
      const module = { id: 'mod-1', authorId: 'some-other-author' };
      const newLesson = { id: 'lesson-admin', moduleId: 'mod-1', title: 'Admin Lesson' };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([module]),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([newLesson]),
          }),
        }),
      };

      const result = await addLesson(
        db,
        'mod-1',
        { title: 'Admin Lesson' },
        'admin-id',
        'franqueadora_admin',
      );

      expect(result).toEqual(newLesson);
    });

    it('throws forbidden when non-author tries to add a lesson', async () => {
      const module = { id: 'mod-1', authorId: 'real-author' };

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([module]),
          }),
        }),
      };

      await expect(
        addLesson(db, 'mod-1', { title: 'Sneaky Lesson' }, 'other-user', 'franqueado_admin'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    });

    it('throws notFound when module does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(
        addLesson(db, 'ghost-mod', { title: 'X' }, 'user-1', 'franqueado_admin'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    });
  });

  describe('createModule', () => {
    it('inserts and returns the new module', async () => {
      const created = { id: 'mod-new', title: 'New Module', authorId: 'author-1' };

      const db: any = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([created]),
          }),
        }),
      };

      const result = await createModule(db, { title: 'New Module' }, 'author-1');

      expect(result).toEqual(created);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('updateModule', () => {
    function makeDbForUpdate(existingModule: any | null, updatedModule?: any) {
      let selectCall = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          selectCall++;
          if (selectCall === 1) {
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(existingModule ? [existingModule] : []),
              }),
            };
          }
          return { from: vi.fn() };
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi
                .fn()
                .mockResolvedValue([updatedModule ?? { ...existingModule, title: 'Updated' }]),
            }),
          }),
        }),
      };
      return db;
    }

    it('allows the author to update their own module', async () => {
      const existing = { id: 'mod-1', authorId: 'author-1', title: 'Old' };
      const db = makeDbForUpdate(existing);

      const result = await updateModule(
        db,
        'mod-1',
        { title: 'Updated' },
        'author-1',
        'franqueado_admin',
      );

      expect(db.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('allows franqueadora_admin to update any module', async () => {
      const existing = { id: 'mod-1', authorId: 'someone-else', title: 'Old' };
      const db = makeDbForUpdate(existing);

      const result = await updateModule(
        db,
        'mod-1',
        { title: 'Admin Updated' },
        'admin-id',
        'franqueadora_admin',
      );

      expect(db.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('throws notFound when module does not exist', async () => {
      const db = makeDbForUpdate(null);

      await expect(
        updateModule(db, 'ghost-id', { title: 'X' }, 'user-1', 'franqueado_admin'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    });

    it('throws forbidden when non-author tries to update', async () => {
      const existing = { id: 'mod-1', authorId: 'real-author', title: 'Old' };
      const db = makeDbForUpdate(existing);

      await expect(
        updateModule(db, 'mod-1', { title: 'Hijacked' }, 'other-user', 'franqueado_admin'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    });
  });

  describe('deactivateModule', () => {
    function makeDbForDeactivate(existingModule: any | null) {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(existingModule ? [existingModule] : []),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };
      return db;
    }

    it('deactivates module when called by its author', async () => {
      const existing = { id: 'mod-1', authorId: 'author-1' };
      const db = makeDbForDeactivate(existing);

      await expect(
        deactivateModule(db, 'mod-1', 'author-1', 'franqueado_admin'),
      ).resolves.not.toThrow();

      expect(db.update).toHaveBeenCalled();
    });

    it('allows franqueadora_admin to deactivate any module', async () => {
      const existing = { id: 'mod-1', authorId: 'someone-else' };
      const db = makeDbForDeactivate(existing);

      await expect(
        deactivateModule(db, 'mod-1', 'admin-id', 'franqueadora_admin'),
      ).resolves.not.toThrow();

      expect(db.update).toHaveBeenCalled();
    });

    it('throws notFound when module does not exist', async () => {
      const db = makeDbForDeactivate(null);

      await expect(
        deactivateModule(db, 'ghost-id', 'user-1', 'franqueado_admin'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    });

    it('throws forbidden when non-author tries to deactivate', async () => {
      const existing = { id: 'mod-1', authorId: 'real-author' };
      const db = makeDbForDeactivate(existing);

      await expect(
        deactivateModule(db, 'mod-1', 'other-user', 'franqueado_admin'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    });
  });

  describe('updateLesson', () => {
    function makeDbForUpdateLesson(lesson: any | null, module: any | null, updated?: any) {
      let selectCall = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          selectCall++;
          if (selectCall === 1) {
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(lesson ? [lesson] : []),
              }),
            };
          }
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(module ? [module] : []),
            }),
          };
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updated ?? { ...lesson, title: 'Updated' }]),
            }),
          }),
        }),
      };
      return db;
    }

    it('allows module author to update a lesson', async () => {
      const lesson = { id: 'lesson-1', moduleId: 'mod-1' };
      const module = { authorId: 'author-1' };
      const db = makeDbForUpdateLesson(lesson, module);

      const result = await updateLesson(
        db,
        'lesson-1',
        { title: 'Updated' },
        'author-1',
        'franqueado_admin',
      );

      expect(db.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('allows franqueadora_admin to update any lesson', async () => {
      const lesson = { id: 'lesson-1', moduleId: 'mod-1' };
      const module = { authorId: 'someone-else' };
      const db = makeDbForUpdateLesson(lesson, module);

      const result = await updateLesson(
        db,
        'lesson-1',
        { title: 'Admin Updated' },
        'admin-id',
        'franqueadora_admin',
      );

      expect(result).toBeDefined();
    });

    it('throws notFound when lesson does not exist', async () => {
      const db = makeDbForUpdateLesson(null, null);

      await expect(
        updateLesson(db, 'ghost-lesson', { title: 'X' }, 'user-1', 'franqueado_admin'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    });

    it('throws notFound when parent module does not exist', async () => {
      const lesson = { id: 'lesson-1', moduleId: 'orphan-mod' };
      const db = makeDbForUpdateLesson(lesson, null);

      await expect(
        updateLesson(db, 'lesson-1', { title: 'X' }, 'user-1', 'franqueado_admin'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    });

    it('throws forbidden when non-author tries to update lesson', async () => {
      const lesson = { id: 'lesson-1', moduleId: 'mod-1' };
      const module = { authorId: 'real-author' };
      const db = makeDbForUpdateLesson(lesson, module);

      await expect(
        updateLesson(db, 'lesson-1', { title: 'Hijacked' }, 'other-user', 'franqueado_admin'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    });
  });

  describe('deleteLesson', () => {
    function makeDbForDeleteLesson(lesson: any | null, module: any | null) {
      let selectCall = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          selectCall++;
          if (selectCall === 1) {
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(lesson ? [lesson] : []),
              }),
            };
          }
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(module ? [module] : []),
            }),
          };
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };
      return db;
    }

    it('allows module author to delete a lesson', async () => {
      const lesson = { id: 'lesson-1', moduleId: 'mod-1' };
      const module = { authorId: 'author-1' };
      const db = makeDbForDeleteLesson(lesson, module);

      await expect(
        deleteLesson(db, 'lesson-1', 'author-1', 'franqueado_admin'),
      ).resolves.not.toThrow();

      expect(db.delete).toHaveBeenCalled();
    });

    it('allows franqueadora_admin to delete any lesson', async () => {
      const lesson = { id: 'lesson-1', moduleId: 'mod-1' };
      const module = { authorId: 'someone-else' };
      const db = makeDbForDeleteLesson(lesson, module);

      await expect(
        deleteLesson(db, 'lesson-1', 'admin-id', 'franqueadora_admin'),
      ).resolves.not.toThrow();
    });

    it('throws notFound when lesson does not exist', async () => {
      const db = makeDbForDeleteLesson(null, null);

      await expect(
        deleteLesson(db, 'ghost-lesson', 'user-1', 'franqueado_admin'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    });

    it('throws notFound when parent module does not exist', async () => {
      const lesson = { id: 'lesson-1', moduleId: 'orphan-mod' };
      const db = makeDbForDeleteLesson(lesson, null);

      await expect(
        deleteLesson(db, 'lesson-1', 'user-1', 'franqueado_admin'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    });

    it('throws forbidden when non-author tries to delete lesson', async () => {
      const lesson = { id: 'lesson-1', moduleId: 'mod-1' };
      const module = { authorId: 'real-author' };
      const db = makeDbForDeleteLesson(lesson, module);

      await expect(
        deleteLesson(db, 'lesson-1', 'other-user', 'franqueado_admin'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    });
  });

  describe('completeLesson', () => {
    function makeDbForComplete(lessonExists: boolean) {
      const onConflictDoNothingMock = vi.fn().mockResolvedValue(undefined);
      const valuesMock = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictDoNothingMock });

      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(lessonExists ? [{ id: 'lesson-1' }] : []),
          }),
        }),
        insert: vi.fn().mockReturnValue({ values: valuesMock }),
      };

      return { db, onConflictDoNothingMock };
    }

    it('upserts progress with onConflictDoNothing', async () => {
      const { db, onConflictDoNothingMock } = makeDbForComplete(true);

      await completeLesson(db, 'lesson-1', 'user-1');

      expect(db.insert).toHaveBeenCalled();
      expect(onConflictDoNothingMock).toHaveBeenCalled();
    });

    it('is idempotent — second call does not throw', async () => {
      const { db } = makeDbForComplete(true);

      await completeLesson(db, 'lesson-1', 'user-1');
      await expect(completeLesson(db, 'lesson-1', 'user-1')).resolves.not.toThrow();
    });

    it('throws notFound when lesson does not exist', async () => {
      const { db } = makeDbForComplete(false);

      await expect(completeLesson(db, 'ghost-lesson', 'user-1')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });
});
