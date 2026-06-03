import crypto from 'node:crypto';
import { inviteTokens, users } from '@washington/db';
import { AppError } from '@washington/shared';
import bcrypt from 'bcryptjs';
import { and, count, eq, gt, ilike, isNull, or } from 'drizzle-orm';
import type {
  CreateUserInput,
  InviteUserInput,
  ListUsersQuery,
  UpdateUserInput,
} from './schemas.js';

type Db = any;

type PublicUser = Omit<typeof users.$inferSelect, 'passwordHash'>;

function stripHash(user: typeof users.$inferSelect): PublicUser {
  const { passwordHash: _, ...rest } = user;
  return rest;
}

export async function listUsers(
  db: Db,
  query: ListUsersQuery,
  callerRole: string,
  callerWorkspaceId: string | null | undefined,
) {
  const { page, limit, workspaceId, role, active, search } = query;
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];

  if (callerRole !== 'franqueadora_admin') {
    if (!callerWorkspaceId) {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }
    conditions.push(eq(users.workspaceId, callerWorkspaceId));
  } else if (workspaceId) {
    conditions.push(eq(users.workspaceId, workspaceId));
  }

  if (role) {
    conditions.push(eq(users.role, role));
  }

  if (active !== undefined) {
    conditions.push(eq(users.active, active));
  }

  if (search) {
    conditions.push(
      or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`)) as ReturnType<
        typeof eq
      >,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        workspaceId: users.workspaceId,
        brandId: users.brandId,
        active: users.active,
        avatarUrl: users.avatarUrl,
        wsmartId: users.wsmartId,
        wwwbId: users.wwwbId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(users.name),
    db.select({ value: count() }).from(users).where(where),
  ]);

  return {
    data: rows,
    total: Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
  };
}

export async function getUser(db: Db, id: string): Promise<PublicUser> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      workspaceId: users.workspaceId,
      brandId: users.brandId,
      active: users.active,
      avatarUrl: users.avatarUrl,
      wsmartId: users.wsmartId,
      wwwbId: users.wwwbId,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, id));

  if (!row) throw AppError.notFound('Usuário');
  return row;
}

export async function createUser(
  db: Db,
  data: CreateUserInput & { password: string },
): Promise<PublicUser> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, data.email));

  if (existing) throw AppError.conflict('E-mail já cadastrado');

  const passwordHash = await bcrypt.hash(data.password, 10);

  const [row] = await db
    .insert(users)
    .values({
      email: data.email,
      name: data.name,
      role: data.role,
      workspaceId: data.workspaceId ?? null,
      brandId: String(data.brandId ?? 1),
      passwordHash,
    })
    .returning();

  return stripHash(row);
}

export async function updateUser(db: Db, id: string, data: UpdateUserInput): Promise<PublicUser> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, id));

  if (!existing) throw AppError.notFound('Usuário');

  const [row] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();

  return stripHash(row);
}

export async function deactivateUser(db: Db, id: string): Promise<void> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, id));

  if (!existing) throw AppError.notFound('Usuário');

  await db.update(users).set({ active: false, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function inviteUser(
  db: Db,
  data: InviteUserInput & { invitedBy: string },
): Promise<{ token: string }> {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  await db.insert(inviteTokens).values({
    email: data.email,
    role: data.role,
    workspaceId: data.workspaceId ?? null,
    token,
    invitedBy: data.invitedBy,
    expiresAt,
  });

  return { token };
}

export async function acceptInvite(
  db: Db,
  token: string,
  name: string,
  password: string,
): Promise<PublicUser> {
  const now = new Date();

  const [invite] = await db
    .select()
    .from(inviteTokens)
    .where(
      and(
        eq(inviteTokens.token, token),
        isNull(inviteTokens.acceptedAt),
        gt(inviteTokens.expiresAt, now),
      ),
    );

  if (!invite) throw AppError.validation('Convite inválido ou expirado');

  const passwordHash = await bcrypt.hash(password, 10);

  const [row] = await db
    .insert(users)
    .values({
      email: invite.email,
      name,
      role: invite.role,
      workspaceId: invite.workspaceId ?? null,
      passwordHash,
    })
    .returning();

  await db.update(inviteTokens).set({ acceptedAt: now }).where(eq(inviteTokens.id, invite.id));

  return stripHash(row);
}
