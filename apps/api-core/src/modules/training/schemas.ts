import { z } from 'zod';

const roleEnum = z.enum([
  'franqueadora_admin',
  'franqueado_admin',
  'franqueado_professor',
  'aluno',
]);

export const createModuleSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  workspaceId: z.string().uuid().optional(),
  requiredRole: roleEnum.optional(),
  requiredPermission: z.string().optional(),
  order: z.number().int().optional(),
});

export const updateModuleSchema = createModuleSchema.partial().extend({
  active: z.boolean().optional(),
});

export const createLessonSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  videoUrl: z.string().url().optional(),
  fileUrl: z.string().url().optional(),
  order: z.number().int().optional(),
  durationMinutes: z.number().int().optional(),
});

export const updateLessonSchema = createLessonSchema.partial();

export const listModulesQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  workspaceId: z.string().uuid().optional(),
  active: z.coerce.boolean().optional(),
});
