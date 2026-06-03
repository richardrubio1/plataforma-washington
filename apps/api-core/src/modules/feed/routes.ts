import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  acknowledgePostHandler,
  createPostHandler,
  deletePostHandler,
  getAcknowledgmentsHandler,
  getPostHandler,
  listPostsHandler,
  pinPostHandler,
  updatePostHandler,
} from './handlers.js';

export default fp(
  async (app: FastifyInstance) => {
    app.get('/', { preHandler: app.authenticate }, listPostsHandler);
    app.get<{ Params: { id: string } }>('/:id', { preHandler: app.authenticate }, getPostHandler);
    app.post('/', { preHandler: app.authenticate }, createPostHandler);
    app.patch<{ Params: { id: string } }>(
      '/:id',
      { preHandler: app.authenticate },
      updatePostHandler,
    );
    app.delete<{ Params: { id: string } }>(
      '/:id',
      { preHandler: app.authenticate },
      deletePostHandler,
    );
    app.patch<{ Params: { id: string }; Body: { pinned: boolean } }>(
      '/:id/pin',
      { preHandler: app.authorize('franqueadora_admin') },
      pinPostHandler,
    );
    app.post<{ Params: { id: string } }>(
      '/:id/acknowledge',
      { preHandler: app.authenticate },
      acknowledgePostHandler,
    );
    app.get<{ Params: { id: string } }>(
      '/:id/acknowledgments',
      { preHandler: app.authenticate },
      getAcknowledgmentsHandler,
    );
  },
  { name: 'feed-routes' },
);
