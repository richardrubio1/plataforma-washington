import { lives } from '@washington/db';
import { AppError } from '@washington/shared';
import type { JwtPayload } from '@washington/shared';
import { and, count, desc, eq, isNull, or } from 'drizzle-orm';

type ListLivesQuery = {
  page: number;
  limit: number;
  workspaceId?: string | undefined;
  status?: 'scheduled' | 'live' | 'ended' | undefined;
};

type CreateLiveData = {
  title: string;
  description?: string | undefined;
  streamUrl?: string | undefined;
  thumbnailUrl?: string | undefined;
  workspaceId?: string | undefined;
  scheduledAt?: string | undefined;
};

export async function listLives(db: any, query: ListLivesQuery, user: JwtPayload) {
  const { page, limit, workspaceId, status } = query;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];

  if (user.role === 'franqueadora_admin') {
    if (workspaceId) {
      conditions.push(eq(lives.workspaceId, workspaceId));
    }
  } else {
    if (user.workspaceId) {
      conditions.push(or(eq(lives.workspaceId, user.workspaceId), isNull(lives.workspaceId)));
    } else {
      conditions.push(isNull(lives.workspaceId));
    }
  }

  if (status) {
    conditions.push(eq(lives.status, status));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(lives)
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(lives.scheduledAt)),
    db.select({ value: count() }).from(lives).where(where),
  ]);

  return {
    data: rows,
    total: Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
  };
}

export async function getLive(db: any, id: string, user: JwtPayload) {
  const [row] = await db.select().from(lives).where(eq(lives.id, id));

  if (!row) throw AppError.notFound('Live');

  if (user.role !== 'franqueadora_admin') {
    const ownWorkspace = user.workspaceId;
    if (row.workspaceId !== null && row.workspaceId !== ownWorkspace) {
      throw AppError.forbidden();
    }
  }

  return row;
}

export async function createLive(db: any, data: CreateLiveData, hostId: string) {
  const [row] = await db
    .insert(lives)
    .values({
      ...data,
      hostId,
      status: 'scheduled',
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
    })
    .returning();
  return row;
}

export async function updateLive(
  db: any,
  id: string,
  data: Record<string, unknown>,
  userId: string,
  role: string,
) {
  const [existing] = await db.select().from(lives).where(eq(lives.id, id));

  if (!existing) throw AppError.notFound('Live');
  if (role !== 'franqueadora_admin' && existing.hostId !== userId) {
    throw AppError.forbidden();
  }

  const updateData: Record<string, unknown> = { ...data };
  if (data.scheduledAt !== undefined) {
    updateData.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt as string) : null;
  }

  const [row] = await db.update(lives).set(updateData).where(eq(lives.id, id)).returning();

  return row;
}

export async function startLive(db: any, id: string, userId: string, role: string) {
  const [existing] = await db.select().from(lives).where(eq(lives.id, id));

  if (!existing) throw AppError.notFound('Live');
  if (role !== 'franqueadora_admin' && existing.hostId !== userId) {
    throw AppError.forbidden();
  }

  const [row] = await db
    .update(lives)
    .set({ status: 'live', startedAt: new Date() })
    .where(eq(lives.id, id))
    .returning();

  return row;
}

export async function endLive(
  db: any,
  id: string,
  userId: string,
  role: string,
  recordingUrl?: string,
) {
  const [existing] = await db.select().from(lives).where(eq(lives.id, id));

  if (!existing) throw AppError.notFound('Live');
  if (role !== 'franqueadora_admin' && existing.hostId !== userId) {
    throw AppError.forbidden();
  }

  const updateData: any = { status: 'ended', endedAt: new Date() };
  if (recordingUrl) {
    updateData.recordingUrl = recordingUrl;
  }

  const [row] = await db.update(lives).set(updateData).where(eq(lives.id, id)).returning();

  return row;
}

export async function deleteLive(db: any, id: string, userId: string, role: string): Promise<void> {
  const [existing] = await db.select().from(lives).where(eq(lives.id, id));

  if (!existing) throw AppError.notFound('Live');
  if (role !== 'franqueadora_admin' && existing.hostId !== userId) {
    throw AppError.forbidden();
  }

  if (existing.status !== 'scheduled') {
    throw AppError.conflict('Only scheduled lives can be deleted');
  }

  await db.delete(lives).where(eq(lives.id, id));
}
