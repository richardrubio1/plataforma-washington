import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  acceptInviteHandler,
  createHandler,
  deactivateHandler,
  getHandler,
  inviteHandler,
  listHandler,
  updateHandler,
} from './handlers.js';

export default fp(
  async (app: FastifyInstance) => {
    app.get('/', { preHandler: app.authenticate }, listHandler);
    app.get<{ Params: { id: string } }>('/:id', { preHandler: app.authenticate }, getHandler);
    app.post(
      '/',
      { preHandler: app.authorize('franqueadora_admin', 'franqueado_admin') },
      createHandler,
    );
    app.patch<{ Params: { id: string } }>('/:id', { preHandler: app.authenticate }, updateHandler);
    app.delete<{ Params: { id: string } }>(
      '/:id',
      { preHandler: app.authorize('franqueadora_admin', 'franqueado_admin') },
      deactivateHandler,
    );
    app.post(
      '/invite',
      { preHandler: app.authorize('franqueadora_admin', 'franqueado_admin') },
      inviteHandler,
    );
    app.post('/accept-invite', acceptInviteHandler);
  },
  { name: 'users-routes' },
);
