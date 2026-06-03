import type { FastifyReply, FastifyRequest } from 'fastify';
import { createLiveSchema, listLivesQuerySchema, updateLiveSchema } from './schemas.js';
import {
  createLive,
  deleteLive,
  endLive,
  getLive,
  listLives,
  startLive,
  updateLive,
} from './service.js';

export async function listLivesHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = listLivesQuerySchema.parse(request.query);
  const result = await listLives(request.server.db, query, request.user);
  return reply.send({ success: true, data: result });
}

export async function getLiveHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const live = await getLive(request.server.db, request.params.id, request.user);
  return reply.send({ success: true, data: live });
}

export async function createLiveHandler(request: FastifyRequest, reply: FastifyReply) {
  const data = createLiveSchema.parse(request.body);
  const live = await createLive(request.server.db, data, request.user.sub);
  return reply.status(201).send({ success: true, data: live });
}

export async function updateLiveHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const data = updateLiveSchema.parse(request.body);
  const live = await updateLive(
    request.server.db,
    request.params.id,
    data,
    request.user.sub,
    request.user.role,
  );
  return reply.send({ success: true, data: live });
}

export async function startLiveHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const live = await startLive(
    request.server.db,
    request.params.id,
    request.user.sub,
    request.user.role,
  );
  return reply.send({ success: true, data: live });
}

export async function endLiveHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { recordingUrl?: string } }>,
  reply: FastifyReply,
) {
  const { recordingUrl } = (request.body as { recordingUrl?: string }) ?? {};
  const live = await endLive(
    request.server.db,
    request.params.id,
    request.user.sub,
    request.user.role,
    recordingUrl,
  );
  return reply.send({ success: true, data: live });
}

export async function deleteLiveHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await deleteLive(request.server.db, request.params.id, request.user.sub, request.user.role);
  return reply.send({ success: true, data: null });
}
