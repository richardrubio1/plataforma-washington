import { z } from 'zod';

const statusEnum = z.enum(['scheduled', 'live', 'ended']);

export const createLiveSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  streamUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  workspaceId: z.string().uuid().optional(),
  scheduledAt: z.string().datetime().optional(),
});

export const updateLiveSchema = createLiveSchema.partial();

export const listLivesQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  workspaceId: z.string().uuid().optional(),
  status: statusEnum.optional(),
});
