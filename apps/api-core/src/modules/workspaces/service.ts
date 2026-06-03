import { workspaces } from '@washington/db';
import { AppError } from '@washington/shared';
import type { PaginatedResponse } from '@washington/shared';
import { and, count, eq, ilike, ne, or } from 'drizzle-orm';

export async function listWorkspaces(
  db: any,
  query: { page: number; limit: number; search?: string | undefined; active?: boolean | undefined },
): Promise<PaginatedResponse<typeof workspaces.$inferSelect>> {
  const { page, limit, search, active } = query;
  const offset = (page - 1) * limit;

  const conditions = [];

  if (search) {
    conditions.push(
      or(ilike(workspaces.name, `%${search}%`), ilike(workspaces.city, `%${search}%`)),
    );
  }

  if (active !== undefined) {
    conditions.push(eq(workspaces.active, active));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ value: total }]] = await Promise.all([
    db.select().from(workspaces).where(where).limit(limit).offset(offset).orderBy(workspaces.name),
    db.select({ value: count() }).from(workspaces).where(where),
  ]);

  return {
    data: rows,
    total: Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
  };
}

export async function getWorkspace(db: any, id: string) {
  const [row] = await db.select().from(workspaces).where(eq(workspaces.id, id));
  if (!row) throw AppError.notFound('Workspace');
  return row;
}

export async function createWorkspace(db: any, data: typeof workspaces.$inferInsert) {
  const [existing] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, data.slug!));

  if (existing) throw AppError.conflict('Slug já em uso');

  const [row] = await db.insert(workspaces).values(data).returning();
  return row;
}

export async function updateWorkspace(db: any, id: string, data: Record<string, unknown>) {
  const [existing] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, id));

  if (!existing) throw AppError.notFound('Workspace');

  if (data.slug) {
    const [slugConflict] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.slug, data.slug as string), ne(workspaces.id, id)));

    if (slugConflict) throw AppError.conflict('Slug já em uso');
  }

  const [row] = await db
    .update(workspaces)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(workspaces.id, id))
    .returning();

  return row;
}

export async function deactivateWorkspace(db: any, id: string): Promise<void> {
  const [existing] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, id));

  if (!existing) throw AppError.notFound('Workspace');

  await db
    .update(workspaces)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(workspaces.id, id));
}
