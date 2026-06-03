import type { FastifyReply, FastifyRequest } from 'fastify';
import { createDocumentSchema, listDocumentsQuerySchema, updateDocumentSchema } from './schemas.js';
import {
  acceptDocument,
  createDocument,
  deactivateDocument,
  getAcceptances,
  getDocument,
  listDocuments,
  updateDocument,
} from './service.js';

export async function listDocumentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = listDocumentsQuerySchema.parse(request.query);
  const result = await listDocuments(request.server.db, query, request.user);
  return reply.send({ success: true, data: result });
}

export async function getDocumentHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const doc = await getDocument(request.server.db, request.params.id, request.user);
  return reply.send({ success: true, data: doc });
}

export async function createDocumentHandler(request: FastifyRequest, reply: FastifyReply) {
  const data = createDocumentSchema.parse(request.body);
  const doc = await createDocument(request.server.db, data, request.user.sub);
  return reply.status(201).send({ success: true, data: doc });
}

export async function updateDocumentHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const data = updateDocumentSchema.parse(request.body);
  const doc = await updateDocument(
    request.server.db,
    request.params.id,
    data,
    request.user.sub,
    request.user.role,
    request.user.workspaceId ?? undefined,
  );
  return reply.send({ success: true, data: doc });
}

export async function deleteDocumentHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await deactivateDocument(request.server.db, request.params.id);
  return reply.send({ success: true, data: null });
}

export async function acceptDocumentHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const ip = request.ip;
  await acceptDocument(request.server.db, request.params.id, request.user.sub, ip);
  return reply.send({ success: true, data: null });
}

export async function getAcceptancesHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const acceptances = await getAcceptances(request.server.db, request.params.id);
  return reply.send({ success: true, data: acceptances });
}
