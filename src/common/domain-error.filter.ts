import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from './domain-error';
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(error.status).json({
      type: `https://api.goverifeye.com/problems/${error.code.toLowerCase()}`,
      title: error.message, status: error.status, code: error.code,
    });
  }
}
export class NotFoundDomainError extends DomainError {
  constructor(resource: string) { super(`${resource} was not found`, 'NOT_FOUND', HttpStatus.NOT_FOUND); }
}
