import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  acceptDocumentHandler,
  createDocumentHandler,
  deleteDocumentHandler,
  getAcceptancesHandler,
  getDocumentHandler,
  listDocumentsHandler,
  updateDocumentHandler,
} from './handlers.js';

export default fp(
  async (app: FastifyInstance) => {
    app.get('/', { preHandler: app.authenticate }, listDocumentsHandler);
    app.get<{ Params: { id: string } }>(
      '/:id',
      { preHandler: app.authenticate },
      getDocumentHandler,
    );
    app.post(
      '/',
      { preHandler: app.authorize('franqueadora_admin', 'franqueado_admin') },
      createDocumentHandler,
    );
    app.patch<{ Params: { id: string } }>(
      '/:id',
      { preHandler: app.authorize('franqueadora_admin', 'franqueado_admin') },
      updateDocumentHandler,
    );
    app.delete<{ Params: { id: string } }>(
      '/:id',
      { preHandler: app.authorize('franqueadora_admin', 'franqueado_admin') },
      deleteDocumentHandler,
    );
    app.post<{ Params: { id: string } }>(
      '/:id/accept',
      { preHandler: app.authenticate },
      acceptDocumentHandler,
    );
    app.get<{ Params: { id: string } }>(
      '/:id/acceptances',
      { preHandler: app.authorize('franqueadora_admin', 'franqueado_admin') },
      getAcceptancesHandler,
    );
  },
  { name: 'documents-routes' },
);
