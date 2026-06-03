import type { FastifyReply, FastifyRequest } from 'fastify';
import { listNotificationsQuerySchema } from './schemas.js';
import { getUnreadCount, listNotifications, markAllRead, markRead } from './service.js';

export async function listNotificationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = listNotificationsQuerySchema.parse(request.query);
  const result = await listNotifications(request.server.db, request.user.sub, query);
  return reply.send({ success: true, data: result });
}

export async function getUnreadCountHandler(request: FastifyRequest, reply: FastifyReply) {
  const count = await getUnreadCount(request.server.db, request.user.sub);
  return reply.send({ success: true, data: { count } });
}

export async function markReadHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await markRead(request.server.db, request.params.id, request.user.sub);
  return reply.send({ success: true, data: null });
}

export async function markAllReadHandler(request: FastifyRequest, reply: FastifyReply) {
  await markAllRead(request.server.db, request.user.sub);
  return reply.send({ success: true, data: null });
}
