import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  createWorkspaceSchema,
  listWorkspacesQuerySchema,
  updateWorkspaceSchema,
} from './schemas.js';
import {
  createWorkspace,
  deactivateWorkspace,
  getWorkspace,
  listWorkspaces,
  updateWorkspace,
} from './service.js';

export async function listHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = listWorkspacesQuerySchema.parse(request.query);
  const user = request.user;

  if (user.role !== 'franqueadora_admin') {
    const workspace = user.workspaceId
      ? await getWorkspace(request.server.db, user.workspaceId)
      : null;
    return reply.send({
      success: true,
      data: {
        data: workspace ? [workspace] : [],
        total: workspace ? 1 : 0,
        page: 1,
        limit: query.limit,
        totalPages: workspace ? 1 : 0,
      },
    });
  }

  const result = await listWorkspaces(request.server.db, query);
  return reply.send({ success: true, data: result });
}

export async function getHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const user = request.user;
  const { id } = request.params;

  if (user.role !== 'franqueadora_admin' && user.workspaceId !== id) {
    const { AppError } = await import('@washington/shared');
    throw AppError.forbidden();
  }

  const workspace = await getWorkspace(request.server.db, id);
  return reply.send({ success: true, data: workspace });
}

export async function createHandler(request: FastifyRequest, reply: FastifyReply) {
  const data = createWorkspaceSchema.parse(request.body);
  const workspace = await createWorkspace(request.server.db, data);
  return reply.status(201).send({ success: true, data: workspace });
}

export async function updateHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const data = updateWorkspaceSchema.parse(request.body);
  const workspace = await updateWorkspace(request.server.db, request.params.id, data);
  return reply.send({ success: true, data: workspace });
}

export async function deactivateHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await deactivateWorkspace(request.server.db, request.params.id);
  return reply.send({ success: true, data: null });
}
