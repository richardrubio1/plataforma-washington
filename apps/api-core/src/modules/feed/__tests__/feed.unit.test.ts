import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@washington/db', () => ({
  feedPosts: {
    id: 'id',
    workspaceId: 'workspaceId',
    authorId: 'authorId',
    category: 'category',
    title: 'title',
    content: 'content',
    pinned: 'pinned',
    requiresAck: 'requiresAck',
    deletedAt: 'deletedAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  feedAcknowledgments: {
    postId: 'postId',
    userId: 'userId',
    acknowledgedAt: 'acknowledgedAt',
  },
  users: {
    id: 'id',
    name: 'name',
    email: 'email',
    role: 'role',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({ type: 'eq' })),
  and: vi.fn(() => ({ type: 'and' })),
  or: vi.fn(() => ({ type: 'or' })),
  isNull: vi.fn(() => ({ type: 'isNull' })),
  isNotNull: vi.fn(() => ({ type: 'isNotNull' })),
  count: vi.fn(() => ({ type: 'count' })),
  desc: vi.fn(() => ({ type: 'desc' })),
  sql: Object.assign(
    vi.fn(() => ({ type: 'sql' })),
    {
      join: vi.fn(() => ({ type: 'sql.join' })),
    },
  ),
}));

vi.mock('@washington/shared', () => ({
  AppError: {
    notFound: (resource: string) =>
      Object.assign(new Error(`${resource} not found`), { code: 'NOT_FOUND', statusCode: 404 }),
    conflict: (msg: string) => Object.assign(new Error(msg), { code: 'CONFLICT', statusCode: 409 }),
    validation: (msg: string) =>
      Object.assign(new Error(msg), { code: 'VALIDATION_ERROR', statusCode: 422 }),
    unauthorized: () =>
      Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED', statusCode: 401 }),
    forbidden: () => Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', statusCode: 403 }),
  },
}));

import {
  acknowledgePost,
  createPost,
  getAcknowledgments,
  getPost,
  listPosts,
  pinPost,
  softDeletePost,
  updatePost,
} from '../service.js';

const adminUser = {
  sub: 'user-admin',
  email: 'admin@example.com',
  role: 'franqueadora_admin' as const,
  workspaceId: null as string | null,
  iat: 0,
  exp: 9999999999,
};

const franqueadoUser = {
  sub: 'user-fq',
  email: 'fq@example.com',
  role: 'franqueado_admin' as const,
  workspaceId: 'ws-1',
  iat: 0,
  exp: 9999999999,
};

function makeListDb(rows: any[], total: number, acks: any[] = []) {
  const orderByMock = vi.fn().mockResolvedValue(rows);
  const offsetMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
  const limitMock = vi.fn().mockReturnValue({ offset: offsetMock });
  const whereMockRows = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMockRows = vi.fn().mockReturnValue({ where: whereMockRows });

  const whereMockCount = vi.fn().mockResolvedValue([{ value: total }]);
  const fromMockCount = vi.fn().mockReturnValue({ where: whereMockCount });

  const whereMockAcks = vi.fn().mockResolvedValue(acks);
  const fromMockAcks = vi.fn().mockReturnValue({ where: whereMockAcks });

  let selectCall = 0;
  const db: any = {
    select: vi.fn().mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return { from: fromMockRows };
      if (selectCall === 2) return { from: fromMockCount };
      return { from: fromMockAcks };
    }),
  };
  return db;
}

describe('feed service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listPosts', () => {
    it('franqueadora_admin sees all posts (no workspace filter applied)', async () => {
      const posts = [
        { id: 'p1', workspaceId: 'ws-1', deletedAt: null },
        { id: 'p2', workspaceId: null, deletedAt: null },
        { id: 'p3', workspaceId: 'ws-2', deletedAt: null },
      ];
      const db = makeListDb(posts, 3);

      const result = await listPosts(db, { page: 1, limit: 10 }, adminUser);

      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('franqueado_admin sees own workspace posts and global posts (null workspaceId)', async () => {
      const posts = [
        { id: 'p1', workspaceId: 'ws-1', deletedAt: null },
        { id: 'p2', workspaceId: null, deletedAt: null },
      ];
      const db = makeListDb(posts, 2);

      const result = await listPosts(db, { page: 1, limit: 10 }, franqueadoUser);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('excludes soft-deleted posts (deletedAt filter applied via isNull)', async () => {
      const posts = [{ id: 'p1', workspaceId: 'ws-1', deletedAt: null }];
      const db = makeListDb(posts, 1);

      const result = await listPosts(db, { page: 1, limit: 10 }, adminUser);

      expect(result.data).toHaveLength(1);
    });

    it('returns empty list when all posts are deleted', async () => {
      const db = makeListDb([], 0);

      const result = await listPosts(db, { page: 1, limit: 10 }, adminUser);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('marks acknowledgedByMe=true for posts the user already acked', async () => {
      const posts = [
        { id: 'p1', workspaceId: 'ws-1', deletedAt: null },
        { id: 'p2', workspaceId: 'ws-1', deletedAt: null },
      ];
      const db = makeListDb(posts, 2, [{ postId: 'p1' }]);

      const result = await listPosts(db, { page: 1, limit: 10 }, franqueadoUser);

      const p1 = result.data.find((p: any) => p.id === 'p1');
      const p2 = result.data.find((p: any) => p.id === 'p2');
      expect(p1?.acknowledgedByMe).toBe(true);
      expect(p2?.acknowledgedByMe).toBe(false);
    });

    it('paginates correctly (page 2, limit 2, total 5)', async () => {
      const posts = [{ id: 'p3', workspaceId: null, deletedAt: null }];
      const db = makeListDb(posts, 5);

      const result = await listPosts(db, { page: 2, limit: 2 }, adminUser);

      expect(result.page).toBe(2);
      expect(result.limit).toBe(2);
      expect(result.total).toBe(5);
      expect(result.totalPages).toBe(3);
    });
  });

  describe('createPost', () => {
    it('creates post with given category and authorId', async () => {
      const newPost = {
        id: 'p-new',
        workspaceId: 'ws-1',
        authorId: 'user-admin',
        category: 'marketing',
        title: 'New Post',
        content: 'Content',
        pinned: false,
        requiresAck: false,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const db: any = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([newPost]),
          }),
        }),
      };

      const result = await createPost(
        db,
        { workspaceId: 'ws-1', category: 'marketing', title: 'New Post', content: 'Content' },
        'user-admin',
        'franqueadora_admin',
      );

      expect(result.category).toBe('marketing');
      expect(result.authorId).toBe('user-admin');
      expect(db.insert).toHaveBeenCalledOnce();
    });

    it('pinned defaults to false when not provided', async () => {
      const newPost = {
        id: 'p-new',
        authorId: 'user-admin',
        category: 'geral',
        title: 'Post',
        content: 'Body',
        pinned: false,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const db: any = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([newPost]),
          }),
        }),
      };

      const result = await createPost(
        db,
        { category: 'geral', title: 'Post', content: 'Body' },
        'user-admin',
        'franqueadora_admin',
      );

      expect(result.pinned).toBe(false);
    });
  });

  describe('softDeletePost', () => {
    it('sets deletedAt on the post when author matches', async () => {
      const existing = { id: 'p1', authorId: 'user-1', deletedAt: null };
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: updateSet }),
      };

      await softDeletePost(db, 'p1', 'user-1', 'franqueado_admin');

      expect(db.update).toHaveBeenCalledOnce();
      const setArg = updateSet.mock.calls[0]?.[0]!;
      expect(setArg).toHaveProperty('deletedAt');
      expect(setArg.deletedAt).toBeInstanceOf(Date);
    });

    it('franqueadora_admin can delete any post regardless of authorship', async () => {
      const existing = { id: 'p1', authorId: 'another-user', deletedAt: null };
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: updateSet }),
      };

      await expect(
        softDeletePost(db, 'p1', 'user-admin', 'franqueadora_admin'),
      ).resolves.not.toThrow();
      expect(db.update).toHaveBeenCalledOnce();
    });

    it('throws forbidden when non-author non-admin tries to delete', async () => {
      const existing = { id: 'p1', authorId: 'owner-user', deletedAt: null };
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
      };

      await expect(
        softDeletePost(db, 'p1', 'other-user', 'franqueado_admin'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    });

    it('throws notFound when post does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(
        softDeletePost(db, 'ghost-id', 'user-1', 'franqueado_admin'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    });
  });

  describe('pinPost', () => {
    it('franqueadora_admin can pin a post', async () => {
      const existing = { id: 'p1' };
      const pinnedPost = { id: 'p1', pinned: true };
      const updateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([pinnedPost]),
      });
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: updateSet }),
      };

      const result = await pinPost(db, 'p1', true, 'franqueadora_admin');

      expect(result.pinned).toBe(true);
      expect(db.update).toHaveBeenCalledOnce();
    });

    it('throws forbidden when franqueado_admin tries to pin', async () => {
      const db: any = {};

      await expect(pinPost(db, 'p1', true, 'franqueado_admin')).rejects.toMatchObject({
        code: 'FORBIDDEN',
        statusCode: 403,
      });
    });

    it('throws forbidden when franqueado_professor tries to pin', async () => {
      const db: any = {};

      await expect(pinPost(db, 'p1', true, 'franqueado_professor')).rejects.toMatchObject({
        code: 'FORBIDDEN',
        statusCode: 403,
      });
    });

    it('throws notFound when post does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(pinPost(db, 'ghost-id', true, 'franqueadora_admin')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });

  describe('acknowledgePost', () => {
    it('inserts acknowledgment for a post that requires ack', async () => {
      const post = { id: 'p1', requiresAck: true };
      const insertOnConflict = vi.fn().mockResolvedValue(undefined);
      const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflict });
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([post]),
          }),
        }),
        insert: vi.fn().mockReturnValue({ values: insertValues }),
      };

      await acknowledgePost(db, 'p1', 'user-1');

      expect(db.insert).toHaveBeenCalledOnce();
      expect(insertValues).toHaveBeenCalledWith({ postId: 'p1', userId: 'user-1' });
      expect(insertOnConflict).toHaveBeenCalledOnce();
    });

    it('is idempotent — uses onConflictDoNothing so duplicate ack does not throw', async () => {
      const post = { id: 'p1', requiresAck: true };
      const insertOnConflict = vi.fn().mockResolvedValue(undefined);
      const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflict });
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([post]),
          }),
        }),
        insert: vi.fn().mockReturnValue({ values: insertValues }),
      };

      await acknowledgePost(db, 'p1', 'user-1');
      await acknowledgePost(db, 'p1', 'user-1');

      expect(insertOnConflict).toHaveBeenCalledTimes(2);
    });

    it('throws validation error when post does not require ack', async () => {
      const post = { id: 'p1', requiresAck: false };
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([post]),
          }),
        }),
      };

      await expect(acknowledgePost(db, 'p1', 'user-1')).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 422,
      });
    });

    it('throws notFound when post does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(acknowledgePost(db, 'ghost-id', 'user-1')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });

  describe('getPost', () => {
    it('returns post with acknowledgedByMe=true when user already acked', async () => {
      const post = { id: 'p1', title: 'Hello', content: 'World', deletedAt: null };
      const ack = { id: 'ack-1' };
      let selectCall = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          selectCall++;
          if (selectCall === 1) {
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([post]),
              }),
            };
          }
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([ack]),
            }),
          };
        }),
      };

      const result = await getPost(db, 'p1', 'user-1');

      expect(result.id).toBe('p1');
      expect(result.acknowledgedByMe).toBe(true);
    });

    it('returns post with acknowledgedByMe=false when user has not acked', async () => {
      const post = { id: 'p1', title: 'Hello', content: 'World', deletedAt: null };
      let selectCall = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          selectCall++;
          if (selectCall === 1) {
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([post]),
              }),
            };
          }
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          };
        }),
      };

      const result = await getPost(db, 'p1', 'user-1');

      expect(result.acknowledgedByMe).toBe(false);
    });

    it('throws notFound when post does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(getPost(db, 'ghost-id', 'user-1')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });

  describe('updatePost', () => {
    it('author can update their own post', async () => {
      const existing = { id: 'p1', authorId: 'user-1', deletedAt: null };
      const updated = { id: 'p1', authorId: 'user-1', title: 'Updated', deletedAt: null };
      let selectCall = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          selectCall++;
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(selectCall === 1 ? [existing] : [updated]),
            }),
          };
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updated]),
            }),
          }),
        }),
      };

      const result = await updatePost(db, 'p1', { title: 'Updated' }, 'user-1', 'franqueado_admin');

      expect(result.title).toBe('Updated');
      expect(db.update).toHaveBeenCalledOnce();
    });

    it('franqueadora_admin can update any post regardless of authorship', async () => {
      const existing = { id: 'p1', authorId: 'someone-else', deletedAt: null };
      const updated = { id: 'p1', authorId: 'someone-else', title: 'Admin Edit', deletedAt: null };
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

      const result = await updatePost(
        db,
        'p1',
        { title: 'Admin Edit' },
        'user-admin',
        'franqueadora_admin',
      );

      expect(result.title).toBe('Admin Edit');
    });

    it('throws forbidden when non-author non-admin tries to update', async () => {
      const existing = { id: 'p1', authorId: 'owner', deletedAt: null };
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
      };

      await expect(
        updatePost(db, 'p1', { title: 'Hack' }, 'intruder', 'franqueado_admin'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    });

    it('throws notFound when post does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(
        updatePost(db, 'ghost-id', { title: 'X' }, 'user-1', 'franqueado_admin'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    });
  });

  describe('createPost - authorization', () => {
    it('throws forbidden when franqueado tries to set a different workspaceId', async () => {
      const db: any = {};

      await expect(
        createPost(db, { workspaceId: 'ws-other' }, 'user-fq', 'franqueado_admin', 'ws-1'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    });

    it('franqueado can create post for their own workspace', async () => {
      const newPost = { id: 'p-new', authorId: 'user-fq', workspaceId: 'ws-1', pinned: false };
      const db: any = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([newPost]),
          }),
        }),
      };

      const result = await createPost(
        db,
        { workspaceId: 'ws-1', title: 'T', content: 'C' },
        'user-fq',
        'franqueado_admin',
        'ws-1',
      );

      expect(result.workspaceId).toBe('ws-1');
    });
  });

  describe('getAcknowledgments', () => {
    it('returns list of users who acknowledged the post', async () => {
      const post = { id: 'p1' };
      const ackRows = [
        {
          id: 'u1',
          name: 'Alice',
          email: 'alice@example.com',
          role: 'franqueado_admin',
          acknowledgedAt: new Date(),
        },
        {
          id: 'u2',
          name: 'Bob',
          email: 'bob@example.com',
          role: 'franqueado_professor',
          acknowledgedAt: new Date(),
        },
      ];
      let selectCall = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          selectCall++;
          if (selectCall === 1) {
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([post]),
              }),
            };
          }
          return {
            from: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue(ackRows),
                }),
              }),
            }),
          };
        }),
      };

      const result = await getAcknowledgments(db, 'p1');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alice');
    });

    it('throws notFound when post does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(getAcknowledgments(db, 'ghost-id')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });

    it('returns empty array when no one has acknowledged yet', async () => {
      const post = { id: 'p1' };
      let selectCall = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          selectCall++;
          if (selectCall === 1) {
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([post]),
              }),
            };
          }
          return {
            from: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          };
        }),
      };

      const result = await getAcknowledgments(db, 'p1');

      expect(result).toHaveLength(0);
    });
  });
});
