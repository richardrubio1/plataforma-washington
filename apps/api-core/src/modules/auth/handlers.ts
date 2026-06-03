import { revokedTokens } from '@washington/db';
import { AppError } from '@washington/shared';
import type { JwtPayload } from '@washington/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../../config.js';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  resetPasswordSchema,
} from './schemas.js';
import { forgotPassword, logout, resetPassword, validateLogin } from './service.js';

export function authHandlers(app: FastifyInstance, cfg: Config) {
  return {
    login: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = loginSchema.parse(request.body);
      const user = await validateLogin(app.db, body.email, body.password);

      const payloadBase = {
        sub: user.id,
        email: user.email,
        role: user.role as JwtPayload['role'],
        workspaceId: user.workspaceId,
      };
      const payload = user.brandId
        ? { ...payloadBase, brandId: Number(user.brandId) as JwtPayload['brandId'] }
        : payloadBase;

      const accessToken = app.jwt.sign(payload as unknown as JwtPayload, {
        expiresIn: cfg.JWT_EXPIRES_IN,
      });
      const refreshToken = app.jwt.sign(payload as unknown as JwtPayload, {
        expiresIn: cfg.REFRESH_EXPIRES_IN,
      });

      return reply.send({
        success: true,
        data: { accessToken, refreshToken, user },
      });
    },

    refresh: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = refreshSchema.parse(request.body);

      let decoded: JwtPayload;
      try {
        decoded = app.jwt.verify<JwtPayload>(body.refreshToken);
      } catch {
        throw AppError.unauthorized('Refresh token inválido');
      }

      // Reject refresh tokens that have been revoked (e.g., from a prior logout).
      const revoked = await app.db.query.revokedTokens.findFirst({
        where: eq(revokedTokens.token, body.refreshToken),
      });
      if (revoked) {
        throw AppError.unauthorized('Refresh token inválido');
      }

      const refreshPayloadBase = {
        sub: decoded.sub,
        email: decoded.email,
        role: decoded.role,
        workspaceId: decoded.workspaceId,
      };
      const payload = decoded.brandId
        ? { ...refreshPayloadBase, brandId: decoded.brandId }
        : refreshPayloadBase;

      const accessToken = app.jwt.sign(payload as unknown as JwtPayload, {
        expiresIn: cfg.JWT_EXPIRES_IN,
      });

      return reply.send({
        success: true,
        data: { accessToken },
      });
    },

    logout: async (request: FastifyRequest, reply: FastifyReply) => {
      await app.authenticate(request, reply);

      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        throw AppError.unauthorized();
      }

      const user = request.user as JwtPayload;
      const expiresAt = new Date(user.exp * 1000);

      await logout(app.db, token, user.sub, expiresAt);

      return reply.send({ success: true, data: null });
    },

    forgotPassword: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = forgotPasswordSchema.parse(request.body);
      await forgotPassword(app.db, body.email);

      // Never expose the reset token in the response — it must be sent via email only.
      return reply.send({
        success: true,
        data: {
          message: 'Se o e-mail estiver cadastrado, você receberá as instruções de redefinição.',
        },
      });
    },

    resetPassword: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = resetPasswordSchema.parse(request.body);
      await resetPassword(app.db, body.token, body.password);

      return reply.send({ success: true, data: null });
    },
  };
}
