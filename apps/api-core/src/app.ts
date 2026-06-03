import cors from '@fastify/cors';
import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { authPlugin } from './plugins/auth.js';
import { dbPlugin } from './plugins/db.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';

import authRoutes from './modules/auth/routes.js';
import documentsRoutes from './modules/documents/routes.js';
import feedRoutes from './modules/feed/routes.js';
import livesRoutes from './modules/lives/routes.js';
import notificationsRoutes from './modules/notifications/routes.js';
import trainingRoutes from './modules/training/routes.js';
import usersRoutes from './modules/users/routes.js';
import workspacesRoutes from './modules/workspaces/routes.js';

export async function buildApp() {
  const cfg = loadConfig(process.env);

  const app = Fastify({ logger: { level: cfg.LOG_LEVEL } });

  await app.register(cors, { origin: true });
  await app.register(dbPlugin, { url: cfg.DATABASE_URL });
  await app.register(authPlugin, { secret: cfg.JWT_SECRET });
  await app.register(errorHandlerPlugin);

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(workspacesRoutes, { prefix: '/workspaces' });
  await app.register(usersRoutes, { prefix: '/users' });
  await app.register(feedRoutes, { prefix: '/feed' });
  await app.register(documentsRoutes, { prefix: '/documents' });
  await app.register(trainingRoutes, { prefix: '/training' });
  await app.register(notificationsRoutes, { prefix: '/notifications' });
  await app.register(livesRoutes, { prefix: '/lives' });

  app.get('/healthz', async () => {
    return { status: 'ok', service: 'api-core', version: '0.0.1' };
  });

  return app;
}
