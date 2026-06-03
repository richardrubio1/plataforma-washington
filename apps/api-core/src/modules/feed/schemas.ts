import { z } from 'zod';

const categoryEnum = z.enum(['geral', 'marketing', 'comercial', 'operacional', 'rh', 'produto']);

export const createPostSchema = z.object({
  category: categoryEnum,
  content: z.string().min(1),
  title: z.string().optional(),
  imageUrl: z.string().url().optional(),
  workspaceId: z.string().uuid().optional(),
  requiresAck: z.boolean().optional(),
  pinned: z.boolean().optional(),
});

export const updatePostSchema = createPostSchema.partial();

export const listPostsQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  workspaceId: z.string().uuid().optional(),
  category: categoryEnum.optional(),
  pinnedOnly: z.coerce.boolean().optional(),
});
