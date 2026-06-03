import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
  cnpj: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  logoUrl: z.string().url().optional(),
});

export const updateWorkspaceSchema = createWorkspaceSchema.partial();

export const listWorkspacesQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  search: z.string().optional(),
  active: z.coerce.boolean().optional(),
});
