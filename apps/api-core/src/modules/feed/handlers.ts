import type { FastifyReply, FastifyRequest } from 'fastify';
import { createPostSchema, listPostsQuerySchema, updatePostSchema } from './schemas.js';
import {
  acknowledgePost,
  createPost,
  getAcknowledgments,
  getPost,
  listPosts,
  pinPost,
  softDeletePost,
  updatePost,
} from './service.js';

export async function listPostsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = listPostsQuerySchema.parse(request.query);
  const result = await listPosts(request.server.db, query, request.user);
  return reply.send({ success: true, data: result });
}

export async function getPostHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const post = await getPost(request.server.db, request.params.id, request.user.sub);
  return reply.send({ success: true, data: post });
}

export async function createPostHandler(request: FastifyRequest, reply: FastifyReply) {
  const data = createPostSchema.parse(request.body);
  const post = await createPost(
    request.server.db,
    data,
    request.user.sub,
    request.user.role,
    request.user.workspaceId ?? undefined,
  );
  return reply.status(201).send({ success: true, data: post });
}

export async function updatePostHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const data = updatePostSchema.parse(request.body);
  const post = await updatePost(
    request.server.db,
    request.params.id,
    data,
    request.user.sub,
    request.user.role,
  );
  return reply.send({ success: true, data: post });
}

export async function deletePostHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await softDeletePost(request.server.db, request.params.id, request.user.sub, request.user.role);
  return reply.send({ success: true, data: null });
}

export async function pinPostHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { pinned: boolean } }>,
  reply: FastifyReply,
) {
  const { pinned } = request.body as { pinned: boolean };
  const post = await pinPost(request.server.db, request.params.id, pinned, request.user.role);
  return reply.send({ success: true, data: post });
}

export async function acknowledgePostHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await acknowledgePost(request.server.db, request.params.id, request.user.sub);
  return reply.send({ success: true, data: null });
}

export async function getAcknowledgmentsHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const acks = await getAcknowledgments(request.server.db, request.params.id);
  return reply.send({ success: true, data: acks });
}
