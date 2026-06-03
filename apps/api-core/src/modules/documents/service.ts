import { documentAcceptances, documents, users } from '@washington/db';
import { AppError } from '@washington/shared';
import type { JwtPayload } from '@washington/shared';
import { and, count, eq, isNull, or, sql } from 'drizzle-orm';

type ListDocumentsQuery = {
  page: number;
  limit: number;
  workspaceId?: string | undefined;
  active?: boolean | undefined;
  requiresAcceptance?: boolean | undefined;
};

export async function listDocuments(db: any, query: ListDocumentsQuery, user: JwtPayload) {
  const { page, limit, workspaceId, active, requiresAcceptance } = query;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];

  if (user.role === 'franqueadora_admin') {
    if (workspaceId) {
      conditions.push(eq(documents.workspaceId, workspaceId));
    }
  } else {
    conditions.push(eq(documents.active, true));
    if (user.workspaceId) {
      conditions.push(
        or(eq(documents.workspaceId, user.workspaceId), isNull(documents.workspaceId)),
      );
    } else {
      conditions.push(isNull(documents.workspaceId));
    }
  }

  if (active !== undefined && user.role === 'franqueadora_admin') {
    conditions.push(eq(documents.active, active));
  }

  if (requiresAcceptance !== undefined) {
    conditions.push(eq(documents.requiresAcceptance, requiresAcceptance));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(documents)
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(documents.createdAt),
    db.select({ value: count() }).from(documents).where(where),
  ]);

  const docIds = rows.map((r: any) => r.id);

  let acceptedSet = new Set<string>();
  if (docIds.length > 0) {
    const acceptances = await db
      .select({ documentId: documentAcceptances.documentId })
      .from(documentAcceptances)
      .where(
        and(
          eq(documentAcceptances.userId, user.sub),
          sql`${documentAcceptances.documentId} = ANY(ARRAY[${sql.join(
            docIds.map((id: string) => sql`${id}::uuid`),
            sql`, `,
          )}])`,
        ),
      );
    acceptedSet = new Set(acceptances.map((a: any) => a.documentId));
  }

  const data = rows.map((r: any) => ({
    ...r,
    hasAccepted: acceptedSet.has(r.id),
  }));

  return {
    data,
    total: Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
  };
}

export async function getDocument(db: any, id: string, user: JwtPayload) {
  const [row] = await db.select().from(documents).where(eq(documents.id, id));

  if (!row) throw AppError.notFound('Document');

  if (user.role !== 'franqueadora_admin') {
    // Non-admin users may only access active documents visible to their workspace
    if (!row.active) throw AppError.notFound('Document');
    const visibleToWorkspace = row.workspaceId === null || row.workspaceId === user.workspaceId;
    if (!visibleToWorkspace) throw AppError.forbidden();
  }

  const [acceptance] = await db
    .select({ id: documentAcceptances.id })
    .from(documentAcceptances)
    .where(and(eq(documentAcceptances.documentId, id), eq(documentAcceptances.userId, user.sub)));

  return { ...row, hasAccepted: !!acceptance };
}

export async function createDocument(db: any, data: any, authorId: string) {
  const [row] = await db
    .insert(documents)
    .values({ ...data, authorId })
    .returning();
  return row;
}

export async function updateDocument(
  db: any,
  id: string,
  data: any,
  _userId: string,
  role: string,
  userWorkspaceId?: string,
) {
  const [existing] = await db.select().from(documents).where(eq(documents.id, id));

  if (!existing) throw AppError.notFound('Document');

  if (role !== 'franqueadora_admin') {
    // franqueado_admin may only update documents scoped to their own workspace
    if (existing.workspaceId !== userWorkspaceId) {
      throw AppError.forbidden();
    }
  }

  const updates: any = { ...data, updatedAt: new Date() };

  if (data.fileUrl && data.fileUrl !== existing.fileUrl) {
    updates.version = existing.version + 1;
  }

  const [row] = await db.update(documents).set(updates).where(eq(documents.id, id)).returning();

  return row;
}

export async function deactivateDocument(db: any, id: string): Promise<void> {
  const [existing] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.id, id));

  if (!existing) throw AppError.notFound('Document');

  await db
    .update(documents)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(documents.id, id));
}

export async function acceptDocument(
  db: any,
  documentId: string,
  userId: string,
  ipAddress: string,
): Promise<void> {
  const [doc] = await db
    .select({ id: documents.id, active: documents.active })
    .from(documents)
    .where(eq(documents.id, documentId));

  if (!doc) throw AppError.notFound('Document');
  if (!doc.active) throw AppError.validation('Document is not active');

  await db
    .insert(documentAcceptances)
    .values({ documentId, userId, ipAddress })
    .onConflictDoNothing();
}

export async function getAcceptances(db: any, documentId: string) {
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.id, documentId));

  if (!doc) throw AppError.notFound('Document');

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      acceptedAt: documentAcceptances.acceptedAt,
    })
    .from(documentAcceptances)
    .innerJoin(users, eq(documentAcceptances.userId, users.id))
    .where(eq(documentAcceptances.documentId, documentId))
    .orderBy(documentAcceptances.acceptedAt);

  return rows;
}
