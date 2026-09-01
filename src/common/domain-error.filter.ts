import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from './domain-error';
import { QueryFailedError } from 'typeorm';
import { DataSource } from 'typeorm';
import { AuditExceptionEntity } from '../governance/governance.entity';
import type { RequestContext } from './request-context';

@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainErrorFilter.name);

  constructor(private readonly db: DataSource) {}

  async catch(error: unknown, host: ArgumentsHost) {
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
    } else if (error instanceof QueryFailedError && ['23505','ER_DUP_ENTRY'].includes((error.driverError as { code?: string })?.code ?? '')) {
      status = HttpStatus.CONFLICT;
      code = 'RESOURCE_ALREADY_EXISTS';
      title = 'A record with these unique details already exists';
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

    const originalStatus = status;
    const unexpected = originalStatus >= 500;
    const correlationId = String(response.getHeader('x-correlation-id') ?? request.headers['x-correlation-id'] ?? '');
    if (unexpected) {
      this.logger.error({
        event: 'http.exception',
        correlationId,
        method: request.method,
        route: request.route?.path ?? 'unmatched-route',
        status,
        code,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: this.sanitize(error instanceof Error ? error.message : String(error)),
        stack: error instanceof Error ? this.sanitize(error.stack ?? '') : undefined,
      });
      status = HttpStatus.SERVICE_UNAVAILABLE;
      code = 'SERVICE_TEMPORARILY_UNAVAILABLE';
      title = 'The service is temporarily unable to complete this request';
      detail = undefined;
    }

    await this.persist(error, request, {
      correlationId,
      originalStatus,
      code,
      title,
    });

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

  private async persist(
    error: unknown,
    request: Request,
    response: { correlationId: string; originalStatus: number; code: string; title: string },
  ) {
    const actor = (request as unknown as { user?: RequestContext }).user;
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const internalMessage = this.sanitize(error instanceof Error ? error.message : String(error));
    const severity = response.originalStatus >= 500 ? 'high' : response.originalStatus >= 401 ? 'medium' : 'low';
    const title = response.originalStatus >= 500
      ? `Unexpected API failure: ${errorName}`
      : `${response.code}: ${response.title}`;
    const forwarded = request.headers['x-forwarded-for'];
    const ipAddress = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : request.ip;
    try {
      await this.db.getRepository(AuditExceptionEntity).insert({
        createdById: actor?.userId ?? null as never,
        updatedById: actor?.userId ?? null as never,
        auditLogId: null,
        organizationId: actor?.organizationId ?? null,
        severity,
        status: 'open',
        title: title.slice(0, 300),
        details: internalMessage.slice(0, 4000),
        kind: 'runtime',
        correlationId: response.correlationId || null,
        requestMethod: request.method.slice(0, 12),
        requestPath: (request.originalUrl.split('?')[0] ?? request.path).slice(0, 2000),
        originalStatus: response.originalStatus,
        errorCode: response.code.slice(0, 100),
        errorName: errorName.slice(0, 200),
        stackTrace: error instanceof Error ? this.sanitize(error.stack ?? '').slice(0, 16000) : null,
        actorId: actor?.userId ?? null,
        metadata: {
          ipAddress,
          userAgent: request.headers['user-agent']?.slice(0, 500),
          role: actor?.role,
        },
        evidence: [],
        resolutionComment: null,
        resolvedById: null,
        resolvedAt: null,
      });
    } catch (persistenceError) {
      this.logger.error({
        event: 'http.exception.persistence_failed',
        correlationId: response.correlationId,
        errorMessage: persistenceError instanceof Error ? persistenceError.message : String(persistenceError),
      });
    }
  }

  private sanitize(value: string) {
    return value
      .replace(/(postgres(?:ql)?|mysql):\/\/[^\s@]+@/gi, '$1://[REDACTED]@')
      .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
      .replace(/((?:password|token|secret|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
  }
}

export class NotFoundDomainError extends DomainError {
  constructor(resource: string) {
    super(`${resource} was not found`, 'NOT_FOUND', HttpStatus.NOT_FOUND);
  }
}
