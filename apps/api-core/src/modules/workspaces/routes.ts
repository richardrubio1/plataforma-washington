import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  createHandler,
  deactivateHandler,
  getHandler,
  listHandler,
  updateHandler,
} from './handlers.js';

export default fp(
  async (app: FastifyInstance) => {
    app.get('/', { preHandler: app.authenticate }, listHandler);
    app.get<{ Params: { id: string } }>('/:id', { preHandler: app.authenticate }, getHandler);
    app.post('/', { preHandler: app.authorize('franqueadora_admin') }, createHandler);
    app.patch<{ Params: { id: string } }>(
      '/:id',
      { preHandler: app.authorize('franqueadora_admin') },
      updateHandler,
    );
    app.delete<{ Params: { id: string } }>(
      '/:id',
      { preHandler: app.authorize('franqueadora_admin') },
      deactivateHandler,
    );
  },
  { name: 'workspaces-routes' },
);
