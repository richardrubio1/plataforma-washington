import { z } from 'zod';

const roleEnum = z.enum([
  'franqueadora_admin',
  'franqueado_admin',
  'franqueado_professor',
  'aluno',
]);

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: roleEnum,
  workspaceId: z.string().uuid().optional(),
  brandId: z.coerce.number().default(1),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  avatarUrl: z.string().url().optional(),
  active: z.boolean().optional(),
});

export const inviteUserSchema = z.object({
  email: z.string().email(),
  role: roleEnum,
  workspaceId: z.string().uuid().optional(),
});

export const acceptInviteSchema = z.object({
  token: z.string(),
  name: z.string().min(1),
  password: z.string().min(8),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  workspaceId: z.string().uuid().optional(),
  role: roleEnum.optional(),
  active: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
