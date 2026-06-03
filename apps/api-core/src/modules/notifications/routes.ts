import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  getUnreadCountHandler,
  listNotificationsHandler,
  markAllReadHandler,
  markReadHandler,
} from './handlers.js';

export default fp(
  async (app: FastifyInstance) => {
    app.get('/', { preHandler: app.authenticate }, listNotificationsHandler);
    app.get('/unread-count', { preHandler: app.authenticate }, getUnreadCountHandler);
    app.patch<{ Params: { id: string } }>(
      '/:id/read',
      { preHandler: app.authenticate },
      markReadHandler,
    );
    app.patch('/read-all', { preHandler: app.authenticate }, markAllReadHandler);
  },
  { name: 'notifications-routes' },
);
