import { AppError } from '@washington/shared';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';

export const errorHandlerPlugin = fp(async (app) => {
  app.setErrorHandler((error, request, reply) => {
    // AppError — erros de negócio esperados
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }

    // Zod — erros de validação de schema
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

    // Fastify JWT errors
    if ((error as { statusCode?: number }).statusCode === 401) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Não autorizado' },
      });
    }

    // Erros inesperados
    app.log.error({ err: error, url: request.url }, 'Unhandled error');
    return reply.status(500).send({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
    });
  });
});
