import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  createLiveHandler,
  deleteLiveHandler,
  endLiveHandler,
  getLiveHandler,
  listLivesHandler,
  startLiveHandler,
  updateLiveHandler,
} from './handlers.js';

export default fp(
  async (app: FastifyInstance) => {
    app.get('/', { preHandler: app.authenticate }, listLivesHandler);
    app.get<{ Params: { id: string } }>('/:id', { preHandler: app.authenticate }, getLiveHandler);
    app.post(
      '/',
      { preHandler: app.authorize('franqueadora_admin', 'franqueado_admin') },
      createLiveHandler,
    );
    app.patch<{ Params: { id: string } }>(
      '/:id',
      { preHandler: app.authenticate },
      updateLiveHandler,
    );
    app.post<{ Params: { id: string } }>(
      '/:id/start',
      { preHandler: app.authenticate },
      startLiveHandler,
    );
    app.post<{ Params: { id: string }; Body: { recordingUrl?: string } }>(
      '/:id/end',
      { preHandler: app.authenticate },
      endLiveHandler,
    );
    app.delete<{ Params: { id: string } }>(
      '/:id',
      { preHandler: app.authenticate },
      deleteLiveHandler,
    );
  },
  { name: 'lives-routes' },
);
