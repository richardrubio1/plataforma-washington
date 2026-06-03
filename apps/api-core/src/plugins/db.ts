import { type Db, createDb } from '@washington/db';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

export const dbPlugin = fp(async (app, opts: { url: string }) => {
  const { db, queryClient } = createDb(opts.url);
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    await queryClient.end();
  });
});
