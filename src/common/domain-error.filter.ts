import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from './domain-error';

@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainErrorFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let title = 'An unexpected error occurred';
    let detail: unknown;

    if (error instanceof DomainError) {
      status = error.status;
      code = error.code;
      title = error.message;
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      code = status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 429 ? 'RATE_LIMITED' : 'REQUEST_ERROR';
      title = typeof body === 'string'
        ? body
        : (body as { message?: string | string[] }).message instanceof Array
          ? 'Request validation failed'
          : String((body as { message?: string }).message ?? error.message);
      detail = typeof body === 'object' ? (body as { message?: unknown }).message : undefined;
    }

    const correlationId = String(response.getHeader('x-correlation-id') ?? request.headers['x-correlation-id'] ?? '');
    if (status >= 500) {
      this.logger.error({
        event: 'http.exception',
        correlationId,
        method: request.method,
        route: request.route?.path ?? 'unmatched-route',
        status,
        code,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    response.status(status).type('application/problem+json').json({
      type: `https://api.goverifeye.com/problems/${code.toLowerCase()}`,
      title,
      status,
      code,
      instance: request.originalUrl,
      correlationId,
      ...(detail ? { detail } : {}),
    });
  }
}

export class NotFoundDomainError extends DomainError {
  constructor(resource: string) {
    super(`${resource} was not found`, 'NOT_FOUND', HttpStatus.NOT_FOUND);
  }
}
