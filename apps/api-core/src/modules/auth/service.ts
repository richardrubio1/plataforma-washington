import crypto from 'node:crypto';
import { passwordResetTokens, revokedTokens, users } from '@washington/db';
import type { Db } from '@washington/db';
import { AppError } from '@washington/shared';
import bcrypt from 'bcryptjs';
import { and, eq, gt, isNull } from 'drizzle-orm';

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  workspaceId: string | null;
  brandId: string | null;
};

export async function validateLogin(db: Db, email: string, password: string): Promise<PublicUser> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user || !user.active) {
    throw AppError.unauthorized('Credenciais inválidas');
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    throw AppError.unauthorized('Credenciais inválidas');
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    workspaceId: user.workspaceId ?? null,
    brandId: user.brandId ?? null,
  };
}

export async function logout(
  db: Db,
  token: string,
  userId: string,
  expiresAt: Date,
): Promise<void> {
  await db.insert(revokedTokens).values({ token, userId, expiresAt });
}

export async function forgotPassword(db: Db, email: string): Promise<string> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    return crypto.randomBytes(32).toString('hex');
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    token,
    expiresAt,
  });

  return token;
}

export async function resetPassword(db: Db, token: string, newPassword: string): Promise<void> {
  const now = new Date();

  const resetToken = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.token, token),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, now),
    ),
  });

  if (!resetToken) {
    throw AppError.validation('Token inválido ou expirado');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await db.update(users).set({ passwordHash }).where(eq(users.id, resetToken.userId));

  await db
    .update(passwordResetTokens)
    .set({ usedAt: now })
    .where(eq(passwordResetTokens.id, resetToken.id));
}
