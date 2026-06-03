import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  unreadOnly: z.coerce.boolean().optional(),
});
