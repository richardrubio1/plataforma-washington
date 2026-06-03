import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@washington/db', () => ({
  documents: {
    id: 'id',
    workspaceId: 'workspaceId',
    authorId: 'authorId',
    title: 'title',
    description: 'description',
    fileUrl: 'fileUrl',
    requiresAcceptance: 'requiresAcceptance',
    version: 'version',
    active: 'active',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  documentAcceptances: {
    id: 'id',
    documentId: 'documentId',
    userId: 'userId',
    ipAddress: 'ipAddress',
    acceptedAt: 'acceptedAt',
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
  acceptDocument,
  createDocument,
  deactivateDocument,
  getAcceptances,
  getDocument,
  listDocuments,
  updateDocument,
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

function makeListDb(rows: any[], total: number, acceptances: any[] = []) {
  const orderByMock = vi.fn().mockResolvedValue(rows);
  const offsetMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
  const limitMock = vi.fn().mockReturnValue({ offset: offsetMock });
  const whereMockRows = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMockRows = vi.fn().mockReturnValue({ where: whereMockRows });

  const whereMockCount = vi.fn().mockResolvedValue([{ value: total }]);
  const fromMockCount = vi.fn().mockReturnValue({ where: whereMockCount });

  const whereMockAcceptances = vi.fn().mockResolvedValue(acceptances);
  const fromMockAcceptances = vi.fn().mockReturnValue({ where: whereMockAcceptances });

  let selectCall = 0;
  const db: any = {
    select: vi.fn().mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return { from: fromMockRows };
      if (selectCall === 2) return { from: fromMockCount };
      return { from: fromMockAcceptances };
    }),
  };
  return db;
}

describe('documents service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listDocuments', () => {
    it('franqueadora_admin sees all documents without active filter', async () => {
      const docs = [
        { id: 'd1', workspaceId: 'ws-1', active: true },
        { id: 'd2', workspaceId: null, active: false },
      ];
      const db = makeListDb(docs, 2);

      const result = await listDocuments(db, { page: 1, limit: 10 }, adminUser);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(1);
    });

    it('franqueado_admin sees only active docs scoped to own workspace and global (null workspaceId)', async () => {
      const docs = [
        { id: 'd1', workspaceId: 'ws-1', active: true },
        { id: 'd2', workspaceId: null, active: true },
      ];
      const db = makeListDb(docs, 2);

      const result = await listDocuments(db, { page: 1, limit: 10 }, franqueadoUser);

      expect(result.data).toHaveLength(2);
    });

    it('returns empty list when user has no workspace and no global docs exist', async () => {
      const userWithoutWorkspace = { ...franqueadoUser, workspaceId: null };
      const db = makeListDb([], 0);

      const result = await listDocuments(db, { page: 1, limit: 10 }, userWithoutWorkspace);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('marks hasAccepted=true for documents the user has already accepted', async () => {
      const docs = [
        { id: 'd1', workspaceId: 'ws-1', active: true },
        { id: 'd2', workspaceId: 'ws-1', active: true },
      ];
      const db = makeListDb(docs, 2, [{ documentId: 'd1' }]);

      const result = await listDocuments(db, { page: 1, limit: 10 }, franqueadoUser);

      const d1 = result.data.find((d: any) => d.id === 'd1');
      const d2 = result.data.find((d: any) => d.id === 'd2');
      expect(d1?.hasAccepted).toBe(true);
      expect(d2?.hasAccepted).toBe(false);
    });

    it('marks hasAccepted=false when user has not accepted any document', async () => {
      const docs = [{ id: 'd1', workspaceId: 'ws-1', active: true }];
      const db = makeListDb(docs, 1, []);

      const result = await listDocuments(db, { page: 1, limit: 10 }, franqueadoUser);

      expect(result.data[0].hasAccepted).toBe(false);
    });

    it('paginates correctly', async () => {
      const docs = [{ id: 'd3', workspaceId: null, active: true }];
      const db = makeListDb(docs, 7);

      const result = await listDocuments(db, { page: 2, limit: 3 }, adminUser);

      expect(result.page).toBe(2);
      expect(result.limit).toBe(3);
      expect(result.total).toBe(7);
      expect(result.totalPages).toBe(3);
    });
  });

  describe('getDocument', () => {
    function makeGetDocDb(docRow: any, acceptanceRow?: any) {
      let selectCall = 0;
      return {
        select: vi.fn().mockImplementation(() => {
          selectCall++;
          if (selectCall === 1) {
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(docRow ? [docRow] : []),
              }),
            };
          }
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(acceptanceRow ? [acceptanceRow] : []),
            }),
          };
        }),
      };
    }

    it('returns document with hasAccepted=true for admin when acceptance exists', async () => {
      const doc = { id: 'd1', workspaceId: null, active: true, title: 'Doc' };
      const acceptance = { id: 'acc-1' };
      const db: any = makeGetDocDb(doc, acceptance);

      const result = await getDocument(db, 'd1', adminUser);

      expect(result.id).toBe('d1');
      expect(result.hasAccepted).toBe(true);
    });

    it('returns document with hasAccepted=false when user has not accepted', async () => {
      const doc = { id: 'd1', workspaceId: 'ws-1', active: true, title: 'Doc' };
      const db: any = makeGetDocDb(doc, undefined);

      const result = await getDocument(db, 'd1', franqueadoUser);

      expect(result.hasAccepted).toBe(false);
    });

    it('throws notFound when document does not exist', async () => {
      const db: any = makeGetDocDb(null);

      await expect(getDocument(db, 'ghost-id', adminUser)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });

    it('throws notFound for non-admin when document is inactive', async () => {
      const doc = { id: 'd1', workspaceId: 'ws-1', active: false, title: 'Doc' };
      const db: any = makeGetDocDb(doc);

      await expect(getDocument(db, 'd1', franqueadoUser)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });

    it('throws forbidden for non-admin when document belongs to a different workspace', async () => {
      const doc = { id: 'd1', workspaceId: 'ws-other', active: true, title: 'Doc' };
      const db: any = makeGetDocDb(doc);

      await expect(getDocument(db, 'd1', franqueadoUser)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        statusCode: 403,
      });
    });

    it('admin can access inactive documents from any workspace', async () => {
      const doc = { id: 'd1', workspaceId: 'ws-other', active: false, title: 'Doc' };
      const db: any = makeGetDocDb(doc, undefined);

      const result = await getDocument(db, 'd1', adminUser);

      expect(result.id).toBe('d1');
    });
  });

  describe('createDocument', () => {
    it('creates document and returns it with version defaulting to 1', async () => {
      const newDoc = {
        id: 'd-new',
        workspaceId: 'ws-1',
        authorId: 'user-admin',
        title: 'Policy v1',
        fileUrl: 'https://example.com/file.pdf',
        version: 1,
        active: true,
        requiresAcceptance: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const db: any = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([newDoc]),
          }),
        }),
      };

      const result = await createDocument(
        db,
        {
          workspaceId: 'ws-1',
          title: 'Policy v1',
          fileUrl: 'https://example.com/file.pdf',
          requiresAcceptance: true,
        },
        'user-admin',
      );

      expect(result.version).toBe(1);
      expect(result.authorId).toBe('user-admin');
      expect(db.insert).toHaveBeenCalledOnce();
    });

    it('passes authorId from parameter, not from data', async () => {
      const newDoc = { id: 'd-new', authorId: 'the-author', version: 1, active: true };
      const valuesMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([newDoc]),
      });
      const db: any = {
        insert: vi.fn().mockReturnValue({ values: valuesMock }),
      };

      await createDocument(db, { title: 'Doc', fileUrl: 'url' }, 'the-author');

      const insertArg = valuesMock.mock.calls[0]?.[0]!;
      expect(insertArg).toMatchObject({ authorId: 'the-author' });
    });
  });

  describe('updateDocument', () => {
    it('increments version when fileUrl changes', async () => {
      const existing = {
        id: 'd1',
        title: 'Doc',
        fileUrl: 'https://example.com/old.pdf',
        version: 1,
      };
      const updated = { ...existing, fileUrl: 'https://example.com/new.pdf', version: 2 };
      const returningMock = vi.fn().mockResolvedValue([updated]);
      const updateWhere = vi.fn().mockReturnValue({ returning: returningMock });
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: updateSet }),
      };

      const result = await updateDocument(
        db,
        'd1',
        { fileUrl: 'https://example.com/new.pdf' },
        'user-admin',
        'franqueadora_admin',
      );

      const setArg = updateSet.mock.calls[0]?.[0]!;
      expect(setArg.version).toBe(2);
      expect(result.version).toBe(2);
    });

    it('keeps version when only title changes (no fileUrl change)', async () => {
      const existing = {
        id: 'd1',
        title: 'Old Title',
        fileUrl: 'https://example.com/file.pdf',
        version: 3,
      };
      const updated = { ...existing, title: 'New Title' };
      const returningMock = vi.fn().mockResolvedValue([updated]);
      const updateWhere = vi.fn().mockReturnValue({ returning: returningMock });
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: updateSet }),
      };

      await updateDocument(db, 'd1', { title: 'New Title' }, 'user-admin', 'franqueadora_admin');

      const setArg = updateSet.mock.calls[0]?.[0]!;
      expect(setArg.version).toBeUndefined();
    });

    it('keeps version when same fileUrl is submitted', async () => {
      const existing = {
        id: 'd1',
        title: 'Doc',
        fileUrl: 'https://example.com/same.pdf',
        version: 2,
      };
      const returningMock = vi.fn().mockResolvedValue([{ ...existing }]);
      const updateWhere = vi.fn().mockReturnValue({ returning: returningMock });
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: updateSet }),
      };

      await updateDocument(
        db,
        'd1',
        { fileUrl: 'https://example.com/same.pdf' },
        'user-admin',
        'franqueadora_admin',
      );

      const setArg = updateSet.mock.calls[0]?.[0]!;
      expect(setArg.version).toBeUndefined();
    });

    it('throws notFound when document does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(
        updateDocument(db, 'ghost-id', { title: 'x' }, 'user-1', 'franqueadora_admin'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    });

    it('throws forbidden when franqueado_admin tries to update a document from another workspace', async () => {
      const existing = {
        id: 'd1',
        title: 'Doc',
        fileUrl: 'https://example.com/file.pdf',
        workspaceId: 'ws-other',
        version: 1,
      };
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
      };

      await expect(
        updateDocument(db, 'd1', { title: 'New Title' }, 'user-fq', 'franqueado_admin', 'ws-1'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    });

    it('franqueado_admin can update a document scoped to their own workspace', async () => {
      const existing = {
        id: 'd1',
        title: 'Old',
        fileUrl: 'https://example.com/file.pdf',
        workspaceId: 'ws-1',
        version: 1,
      };
      const updated = { ...existing, title: 'New' };
      const returningMock = vi.fn().mockResolvedValue([updated]);
      const updateWhere = vi.fn().mockReturnValue({ returning: returningMock });
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([existing]),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: updateSet }),
      };

      const result = await updateDocument(
        db,
        'd1',
        { title: 'New' },
        'user-fq',
        'franqueado_admin',
        'ws-1',
      );

      expect(result.title).toBe('New');
    });
  });

  describe('deactivateDocument', () => {
    it('sets active=false on existing document', async () => {
      const existing = { id: 'd1' };
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

      await deactivateDocument(db, 'd1');

      expect(db.update).toHaveBeenCalledOnce();
      const setArg = updateSet.mock.calls[0]?.[0]!;
      expect(setArg.active).toBe(false);
    });

    it('throws notFound when document does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(deactivateDocument(db, 'ghost-id')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });

  describe('acceptDocument', () => {
    it('inserts acceptance with documentId, userId and ipAddress', async () => {
      const doc = { id: 'd1', active: true };
      const insertOnConflict = vi.fn().mockResolvedValue(undefined);
      const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflict });
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([doc]),
          }),
        }),
        insert: vi.fn().mockReturnValue({ values: insertValues }),
      };

      await acceptDocument(db, 'd1', 'user-1', '192.168.1.10');

      expect(db.insert).toHaveBeenCalledOnce();
      expect(insertValues).toHaveBeenCalledWith({
        documentId: 'd1',
        userId: 'user-1',
        ipAddress: '192.168.1.10',
      });
      expect(insertOnConflict).toHaveBeenCalledOnce();
    });

    it('throws validation error when document is not active', async () => {
      const doc = { id: 'd1', active: false };
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([doc]),
          }),
        }),
      };

      await expect(acceptDocument(db, 'd1', 'user-1', '10.0.0.1')).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 422,
      });
    });

    it('throws notFound when document does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(acceptDocument(db, 'ghost-id', 'user-1', '10.0.0.1')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });

  describe('getAcceptances', () => {
    it('returns list of acceptances with user info and acceptedAt', async () => {
      const doc = { id: 'd1' };
      const acceptances = [
        {
          id: 'u1',
          name: 'Alice',
          email: 'alice@example.com',
          role: 'franqueado_admin',
          acceptedAt: new Date('2025-01-01'),
        },
        {
          id: 'u2',
          name: 'Bob',
          email: 'bob@example.com',
          role: 'aluno',
          acceptedAt: new Date('2025-01-02'),
        },
      ];

      const orderByMock = vi.fn().mockResolvedValue(acceptances);
      const innerJoinMock = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ orderBy: orderByMock }),
      });
      const fromMockAcceptances = vi.fn().mockReturnValue({ innerJoin: innerJoinMock });

      let selectCall = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          selectCall++;
          if (selectCall === 1) {
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([doc]),
              }),
            };
          }
          return { from: fromMockAcceptances };
        }),
      };

      const result = await getAcceptances(db, 'd1');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ name: 'Alice', email: 'alice@example.com' });
      expect(result[1]).toMatchObject({ name: 'Bob', role: 'aluno' });
    });

    it('returns empty array when no one has accepted', async () => {
      const doc = { id: 'd1' };

      const orderByMock = vi.fn().mockResolvedValue([]);
      const innerJoinMock = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ orderBy: orderByMock }),
      });
      const fromMockAcceptances = vi.fn().mockReturnValue({ innerJoin: innerJoinMock });

      let selectCall = 0;
      const db: any = {
        select: vi.fn().mockImplementation(() => {
          selectCall++;
          if (selectCall === 1) {
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([doc]),
              }),
            };
          }
          return { from: fromMockAcceptances };
        }),
      };

      const result = await getAcceptances(db, 'd1');

      expect(result).toHaveLength(0);
    });

    it('throws notFound when document does not exist', async () => {
      const db: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      await expect(getAcceptances(db, 'ghost-id')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });
});
