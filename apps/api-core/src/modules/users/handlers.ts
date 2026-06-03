import { AppError } from '@washington/shared';
import type { JwtPayload } from '@washington/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  acceptInviteSchema,
  createUserSchema,
  inviteUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from './schemas.js';
import {
  acceptInvite,
  createUser,
  deactivateUser,
  getUser,
  inviteUser,
  listUsers,
  updateUser,
} from './service.js';

export async function listHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = listUsersQuerySchema.parse(request.query);
  const user = request.user as JwtPayload;
  const result = await listUsers(request.server.db, query, user.role, user.workspaceId);
  return reply.send({ success: true, data: result });
}

export async function getHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const caller = request.user as JwtPayload;
  const result = await getUser(request.server.db, request.params.id);

  // Non-admins can only view users within their own workspace (or themselves).
  if (caller.role !== 'franqueadora_admin') {
    const isSelf = result.id === caller.sub;
    const sameWorkspace = caller.workspaceId !== null && result.workspaceId === caller.workspaceId;
    if (!isSelf && !sameWorkspace) {
      throw AppError.forbidden();
    }
  }

  return reply.send({ success: true, data: result });
}

export async function createHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = createUserSchema.parse(request.body);
  // Extract and validate password separately — kept out of createUserSchema to
  // avoid leaking it in type-inferred output types, but validated here via Zod.
  const rawPassword = (request.body as Record<string, unknown>).password;
  if (!rawPassword || typeof rawPassword !== 'string' || rawPassword.length < 8) {
    throw AppError.validation('password deve ter no mínimo 8 caracteres');
  }
  const result = await createUser(request.server.db, { ...body, password: rawPassword });
  return reply.status(201).send({ success: true, data: result });
}

export async function updateHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const caller = request.user as JwtPayload;
  const targetId = request.params.id;

  // Only admins can update arbitrary users; regular users can only update themselves.
  const isAdmin = caller.role === 'franqueadora_admin' || caller.role === 'franqueado_admin';
  const isSelf = targetId === caller.sub;

  if (!isAdmin && !isSelf) {
    throw AppError.forbidden();
  }

  // Non-admins cannot change the `active` flag (they cannot deactivate accounts).
  const rawData = updateUserSchema.parse(request.body);
  if (!isAdmin && rawData.active !== undefined) {
    throw AppError.forbidden();
  }

  // franqueado_admin can only update users within their own workspace.
  if (caller.role === 'franqueado_admin' && !isSelf) {
    const target = await getUser(request.server.db, targetId);
    if (target.workspaceId !== caller.workspaceId) {
      throw AppError.forbidden();
    }
  }

  const result = await updateUser(request.server.db, targetId, rawData);
  return reply.send({ success: true, data: result });
}

export async function deactivateHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await deactivateUser(request.server.db, request.params.id);
  return reply.send({ success: true, data: null });
}

export async function inviteHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = inviteUserSchema.parse(request.body);
  const caller = request.user as JwtPayload;
  const result = await inviteUser(request.server.db, { ...body, invitedBy: caller.sub });
  return reply.status(201).send({ success: true, data: result });
}

export async function acceptInviteHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = acceptInviteSchema.parse(request.body);
  const result = await acceptInvite(request.server.db, body.token, body.name, body.password);
  return reply.send({ success: true, data: result });
}
