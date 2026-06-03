import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  createLessonSchema,
  createModuleSchema,
  listModulesQuerySchema,
  updateLessonSchema,
  updateModuleSchema,
} from './schemas.js';
import {
  addLesson,
  completeLesson,
  createModule,
  deactivateModule,
  deleteLesson,
  getModule,
  listModules,
  updateLesson,
  updateModule,
} from './service.js';

export async function listModulesHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = listModulesQuerySchema.parse(request.query);
  const result = await listModules(request.server.db, query, request.user);
  return reply.send({ success: true, data: result });
}

export async function getModuleHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const module = await getModule(request.server.db, request.params.id, request.user.sub);
  return reply.send({ success: true, data: module });
}

export async function createModuleHandler(request: FastifyRequest, reply: FastifyReply) {
  const data = createModuleSchema.parse(request.body);
  const module = await createModule(request.server.db, data, request.user.sub);
  return reply.status(201).send({ success: true, data: module });
}

export async function updateModuleHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const data = updateModuleSchema.parse(request.body);
  const module = await updateModule(
    request.server.db,
    request.params.id,
    data,
    request.user.sub,
    request.user.role,
  );
  return reply.send({ success: true, data: module });
}

export async function deleteModuleHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await deactivateModule(request.server.db, request.params.id, request.user.sub, request.user.role);
  return reply.send({ success: true, data: null });
}

export async function addLessonHandler(
  request: FastifyRequest<{ Params: { moduleId: string } }>,
  reply: FastifyReply,
) {
  const data = createLessonSchema.parse(request.body);
  const lesson = await addLesson(
    request.server.db,
    request.params.moduleId,
    data,
    request.user.sub,
    request.user.role,
  );
  return reply.status(201).send({ success: true, data: lesson });
}

export async function updateLessonHandler(
  request: FastifyRequest<{ Params: { moduleId: string; lessonId: string } }>,
  reply: FastifyReply,
) {
  const data = updateLessonSchema.parse(request.body);
  const lesson = await updateLesson(
    request.server.db,
    request.params.lessonId,
    data,
    request.user.sub,
    request.user.role,
  );
  return reply.send({ success: true, data: lesson });
}

export async function deleteLessonHandler(
  request: FastifyRequest<{ Params: { moduleId: string; lessonId: string } }>,
  reply: FastifyReply,
) {
  await deleteLesson(
    request.server.db,
    request.params.lessonId,
    request.user.sub,
    request.user.role,
  );
  return reply.send({ success: true, data: null });
}

export async function completeLessonHandler(
  request: FastifyRequest<{ Params: { moduleId: string; lessonId: string } }>,
  reply: FastifyReply,
) {
  await completeLesson(request.server.db, request.params.lessonId, request.user.sub);
  return reply.send({ success: true, data: null });
}
