export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
  }

  static notFound(resource: string) {
    return new AppError('NOT_FOUND', `${resource} não encontrado`, 404);
  }

  static unauthorized(message = 'Não autorizado') {
    return new AppError('UNAUTHORIZED', message, 401);
  }

  static forbidden(message = 'Acesso negado') {
    return new AppError('FORBIDDEN', message, 403);
  }

  static conflict(message: string) {
    return new AppError('CONFLICT', message, 409);
  }

  static validation(message: string) {
    return new AppError('VALIDATION_ERROR', message, 422);
  }

  static internal(message = 'Erro interno do servidor') {
    return new AppError('INTERNAL_ERROR', message, 500);
  }
}
