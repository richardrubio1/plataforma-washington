import fastifyJwt from '@fastify/jwt';
import { revokedTokens } from '@washington/db';
import { AppError } from '@washington/shared';
import type { JwtPayload, Role } from '@washington/shared';
import { eq } from 'drizzle-orm';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (
      ...roles: Role[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: JwtPayload;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export const authPlugin = fp(async (app, opts: { secret: string }) => {
  await app.register(fastifyJwt, { secret: opts.secret });

  app.decorate('authenticate', async (request: any, _reply: any) => {
    try {
      await request.jwtVerify();

      // Verificar se token foi revogado
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (token) {
        const revoked = await app.db.query.revokedTokens.findFirst({
          where: eq(revokedTokens.token, token),
        });
        if (revoked) {
          throw AppError.unauthorized('Token revogado');
        }
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.unauthorized();
    }
  });

  app.decorate('authorize', (...roles: Role[]) => async (request: any, reply: any) => {
    await app.authenticate(request, reply);
    if (!roles.includes(request.user.role as Role)) {
      throw AppError.forbidden();
    }
  });
});
