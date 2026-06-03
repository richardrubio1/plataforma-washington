import { feedAcknowledgments, feedPosts, users } from '@washington/db';
import { AppError } from '@washington/shared';
import type { JwtPayload } from '@washington/shared';
import { and, count, desc, eq, isNull, or, sql } from 'drizzle-orm';

type ListPostsQuery = {
  page: number;
  limit: number;
  workspaceId?: string | undefined;
  category?: string | undefined;
  pinnedOnly?: boolean | undefined;
};

export async function listPosts(db: any, query: ListPostsQuery, user: JwtPayload) {
  const { page, limit, workspaceId, category, pinnedOnly } = query;
  const offset = (page - 1) * limit;

  const conditions: any[] = [isNull(feedPosts.deletedAt)];

  if (user.role === 'franqueadora_admin') {
    if (workspaceId) {
      conditions.push(eq(feedPosts.workspaceId, workspaceId));
    }
  } else {
    if (user.workspaceId) {
      conditions.push(
        or(eq(feedPosts.workspaceId, user.workspaceId), isNull(feedPosts.workspaceId)),
      );
    } else {
      conditions.push(isNull(feedPosts.workspaceId));
    }
  }

  if (category) {
    conditions.push(eq(feedPosts.category, category));
  }

  if (pinnedOnly) {
    conditions.push(eq(feedPosts.pinned, true));
  }

  const where = and(...conditions);

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(feedPosts)
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(sql`${feedPosts.pinned} DESC`, desc(feedPosts.createdAt)),
    db.select({ value: count() }).from(feedPosts).where(where),
  ]);

  const postIds = rows.map((r: any) => r.id);

  let ackSet = new Set<string>();
  if (postIds.length > 0) {
    const acks = await db
      .select({ postId: feedAcknowledgments.postId })
      .from(feedAcknowledgments)
      .where(
        and(
          eq(feedAcknowledgments.userId, user.sub),
          sql`${feedAcknowledgments.postId} = ANY(ARRAY[${sql.join(
            postIds.map((id: string) => sql`${id}::uuid`),
            sql`, `,
          )}])`,
        ),
      );
    ackSet = new Set(acks.map((a: any) => a.postId));
  }

  const data = rows.map((r: any) => ({
    ...r,
    acknowledgedByMe: ackSet.has(r.id),
  }));

  return {
    data,
    total: Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
  };
}

export async function getPost(db: any, id: string, userId: string) {
  const [row] = await db
    .select()
    .from(feedPosts)
    .where(and(eq(feedPosts.id, id), isNull(feedPosts.deletedAt)));

  if (!row) throw AppError.notFound('Post');

  const [ack] = await db
    .select({ id: feedAcknowledgments.id })
    .from(feedAcknowledgments)
    .where(and(eq(feedAcknowledgments.postId, id), eq(feedAcknowledgments.userId, userId)));

  return { ...row, acknowledgedByMe: !!ack };
}

export async function createPost(
  db: any,
  data: any,
  authorId: string,
  userRole: string,
  userWorkspaceId?: string,
) {
  // Franqueados can only create posts for their own workspace (or global if workspaceId is omitted).
  // Only franqueadora_admin may set an arbitrary workspaceId.
  if (
    userRole !== 'franqueadora_admin' &&
    data.workspaceId &&
    data.workspaceId !== userWorkspaceId
  ) {
    throw AppError.forbidden();
  }

  const [row] = await db
    .insert(feedPosts)
    .values({ ...data, authorId })
    .returning();
  return row;
}

export async function updatePost(db: any, id: string, data: any, userId: string, role: string) {
  const [existing] = await db
    .select()
    .from(feedPosts)
    .where(and(eq(feedPosts.id, id), isNull(feedPosts.deletedAt)));

  if (!existing) throw AppError.notFound('Post');

  if (role !== 'franqueadora_admin' && existing.authorId !== userId) {
    throw AppError.forbidden();
  }

  const [row] = await db
    .update(feedPosts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(feedPosts.id, id))
    .returning();

  return row;
}

export async function softDeletePost(db: any, id: string, userId: string, role: string) {
  const [existing] = await db
    .select()
    .from(feedPosts)
    .where(and(eq(feedPosts.id, id), isNull(feedPosts.deletedAt)));

  if (!existing) throw AppError.notFound('Post');

  if (role !== 'franqueadora_admin' && existing.authorId !== userId) {
    throw AppError.forbidden();
  }

  await db
    .update(feedPosts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(feedPosts.id, id));
}

export async function pinPost(db: any, id: string, pinned: boolean, role: string) {
  if (role !== 'franqueadora_admin') throw AppError.forbidden();

  const [existing] = await db
    .select({ id: feedPosts.id })
    .from(feedPosts)
    .where(and(eq(feedPosts.id, id), isNull(feedPosts.deletedAt)));

  if (!existing) throw AppError.notFound('Post');

  const [row] = await db
    .update(feedPosts)
    .set({ pinned, updatedAt: new Date() })
    .where(eq(feedPosts.id, id))
    .returning();

  return row;
}

export async function acknowledgePost(db: any, postId: string, userId: string): Promise<void> {
  const [post] = await db
    .select({ id: feedPosts.id, requiresAck: feedPosts.requiresAck })
    .from(feedPosts)
    .where(and(eq(feedPosts.id, postId), isNull(feedPosts.deletedAt)));

  if (!post) throw AppError.notFound('Post');
  if (!post.requiresAck) throw AppError.validation('Este post não requer confirmação');

  await db.insert(feedAcknowledgments).values({ postId, userId }).onConflictDoNothing();
}

export async function getAcknowledgments(db: any, postId: string) {
  const [post] = await db
    .select({ id: feedPosts.id })
    .from(feedPosts)
    .where(and(eq(feedPosts.id, postId), isNull(feedPosts.deletedAt)));

  if (!post) throw AppError.notFound('Post');

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      acknowledgedAt: feedAcknowledgments.acknowledgedAt,
    })
    .from(feedAcknowledgments)
    .innerJoin(users, eq(feedAcknowledgments.userId, users.id))
    .where(eq(feedAcknowledgments.postId, postId))
    .orderBy(feedAcknowledgments.acknowledgedAt);

  return rows;
}
