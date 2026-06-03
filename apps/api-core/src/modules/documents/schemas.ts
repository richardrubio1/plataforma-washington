import { z } from 'zod';

export const createDocumentSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  fileUrl: z.string().url(),
  workspaceId: z.string().uuid().optional(),
  requiresAcceptance: z.boolean().optional(),
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  fileUrl: z.string().url().optional(),
  workspaceId: z.string().uuid().optional(),
  requiresAcceptance: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  workspaceId: z.string().uuid().optional(),
  active: z.coerce.boolean().optional(),
  requiresAcceptance: z.coerce.boolean().optional(),
});
