import fp from 'fastify-plugin';
import { loadConfig } from '../../config.js';
import { authHandlers } from './handlers.js';

export const authRoutes = fp(async (app) => {
  const cfg = loadConfig(process.env);
  const h = authHandlers(app, cfg);

  app.post('/login', h.login);
  app.post('/refresh', h.refresh);
  app.post('/logout', h.logout);
  app.post('/forgot-password', h.forgotPassword);
  app.post('/reset-password', h.resetPassword);
});

export default authRoutes;
