import fastifyJwt from '@fastify/jwt';
import { AppError } from '@washington/shared';
import type { JwtPayload } from '@washington/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

vi.mock('../service.js', () => ({
  validateLogin: vi.fn(),
  logout: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
}));

import { authHandlers } from '../handlers.js';
import { forgotPassword, logout, resetPassword, validateLogin } from '../service.js';

const mockValidateLogin = validateLogin as ReturnType<typeof vi.fn>;
const mockLogout = logout as ReturnType<typeof vi.fn>;
const mockForgotPassword = forgotPassword as ReturnType<typeof vi.fn>;
const mockResetPassword = resetPassword as ReturnType<typeof vi.fn>;

const TEST_JWT_SECRET = 'supersecretjwttestkey1234567890ab';

const testCfg = {
  JWT_EXPIRES_IN: '1h',
  REFRESH_EXPIRES_IN: '7d',
};

const publicUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'franqueado_admin' as const,
  workspaceId: 'ws-1',
  brandId: '1',
};

function buildMockDb(overrides: Record<string, unknown> = {}) {
  return {
    query: {
      revokedTokens: { findFirst: vi.fn().mockResolvedValue(null) },
    },
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
    ...overrides,
  };
}

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const mockDb = buildMockDb();

  await app.register(
    fp(async (instance) => {
      instance.decorate('db', mockDb as any);
    }),
  );

  await app.register(fastifyJwt, { secret: TEST_JWT_SECRET });

  await app.register(
    fp(async (instance) => {
      instance.decorate('authenticate', async (request: any, _reply: any) => {
        try {
          await request.jwtVerify();
          const token = request.headers.authorization?.replace('Bearer ', '');
          if (token) {
            const revoked = await mockDb.query.revokedTokens.findFirst();
            if (revoked) throw AppError.unauthorized('Token revogado');
          }
        } catch (err) {
          if (err instanceof AppError) throw err;
          throw AppError.unauthorized();
        }
      });

      instance.decorate('authorize', (...roles: string[]) => async (request: any, reply: any) => {
        await (instance as any).authenticate(request, reply);
        if (!roles.includes(request.user.role)) {
          throw AppError.forbidden();
        }
      });
    }),
  );

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    if (error instanceof ZodError) {
      return reply.status(422).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos',
          details: error.flatten().fieldErrors,
        },
      });
    }
    if ((error as { statusCode?: number }).statusCode === 401) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Não autorizado' },
      });
    }
    return reply
      .status(500)
      .send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Erro interno' } });
  });

  const h = authHandlers(app as any, testCfg as any);

  app.post('/auth/login', h.login);
  app.post('/auth/refresh', h.refresh);
  app.post('/auth/logout', h.logout);
  app.post('/auth/forgot-password', h.forgotPassword);
  app.post('/auth/reset-password', h.resetPassword);

  await app.ready();
  return app;
}

function signToken(
  app: FastifyInstance,
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  expiresIn = '1h',
) {
  return app.jwt.sign(payload as unknown as JwtPayload, { expiresIn });
}

describe('POST /auth/login', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with tokens and user on valid credentials', async () => {
    mockValidateLogin.mockResolvedValue(publicUser);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'secret123' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('accessToken');
    expect(body.data).toHaveProperty('refreshToken');
    expect(body.data.user.email).toBe('test@example.com');
  });

  it('returns 401 when password is wrong', async () => {
    mockValidateLogin.mockRejectedValue(AppError.unauthorized('Credenciais inválidas'));

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'wrong-password' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 422 when email field is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { password: 'secret123' },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/refresh', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with new accessToken when refresh token is valid', async () => {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: 'user-1',
      email: 'test@example.com',
      role: 'franqueado_admin',
      workspaceId: 'ws-1',
    };
    const refreshToken = signToken(app, payload, '7d');

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('accessToken');
    expect(body.data).not.toHaveProperty('refreshToken');
  });

  it('returns 401 when refresh token is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'totally.invalid.token' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 when refresh token has been revoked', async () => {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: 'user-1',
      email: 'test@example.com',
      role: 'franqueado_admin',
      workspaceId: 'ws-1',
    };
    const refreshToken = signToken(app, payload, '7d');

    // Rebuild app with a db that marks this token as revoked
    await app.close();
    const revokedDb = buildMockDb({
      query: {
        revokedTokens: { findFirst: vi.fn().mockResolvedValue({ token: refreshToken }) },
      },
    });
    const appWithRevoked = Fastify({ logger: false });
    await appWithRevoked.register(
      fp(async (instance) => {
        instance.decorate('db', revokedDb as any);
      }),
    );
    await appWithRevoked.register(fastifyJwt, { secret: TEST_JWT_SECRET });
    await appWithRevoked.register(
      fp(async (instance) => {
        instance.decorate('authenticate', async (request: any, _reply: any) => {
          await request.jwtVerify();
        });
        instance.decorate('authorize', (...roles: string[]) => async (request: any, reply: any) => {
          await (instance as any).authenticate(request, reply);
          if (!roles.includes(request.user.role)) throw AppError.forbidden();
        });
      }),
    );
    appWithRevoked.setErrorHandler((error, _request, reply) => {
      if (error instanceof AppError) {
        return reply
          .status(error.statusCode)
          .send({ success: false, error: { code: error.code, message: error.message } });
      }
      return reply
        .status(500)
        .send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Erro interno' } });
    });
    const h2 = authHandlers(appWithRevoked as any, testCfg as any);
    appWithRevoked.post('/auth/refresh', h2.refresh);
    await appWithRevoked.ready();

    const res = await appWithRevoked.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });

    await appWithRevoked.close();
    app = await buildTestApp(); // restore for afterEach

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /auth/logout', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 401 when no Authorization token is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
  });

  it('returns 200 when valid token is provided', async () => {
    mockLogout.mockResolvedValue(undefined);

    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: 'user-1',
      email: 'test@example.com',
      role: 'franqueado_admin',
      workspaceId: 'ws-1',
    };
    const accessToken = signToken(app, payload, '1h');

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });
});

describe('POST /auth/forgot-password', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('always returns 200 regardless of whether the email exists', async () => {
    mockForgotPassword.mockResolvedValue('sometoken123');

    const res = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'anyone@example.com' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    // Token must NOT be exposed in the response — it is sent via email only
    expect(body.data).not.toHaveProperty('token');
    expect(body.data).toHaveProperty('message');
  });

  it('returns 422 when email format is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'not-an-email' },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/reset-password', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 when token is valid', async () => {
    mockResetPassword.mockResolvedValue(undefined);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: 'valid-reset-token', password: 'newpassword123' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
  });

  it('returns 422 when token is invalid or expired', async () => {
    mockResetPassword.mockRejectedValue(AppError.validation('Token inválido ou expirado'));

    const res = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: 'bad-token', password: 'newpassword123' },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 when new password is too short (schema validation)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: 'some-token', password: 'short' },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    // Service must not be called when input is invalid
    expect(mockResetPassword).not.toHaveBeenCalled();
  });
});
