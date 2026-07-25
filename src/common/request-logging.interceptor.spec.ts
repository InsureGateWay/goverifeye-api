import 'reflect-metadata';
import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { DomainError } from './domain-error';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

function context() {
  const request = {
    method: 'POST',
    route: { path: '/invitations/:token/summary' },
    headers: { 'x-correlation-id': 'correlation-id' },
    user: { userId: 'user-id', organizationId: 'organization-id', role: 'admin', sessionId: 'session-id' },
  };
  const response = { statusCode: 201, getHeader: jest.fn().mockReturnValue('correlation-id') };
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    getClass: () => ({ name: 'TestController' }),
    getHandler: () => ({ name: 'test' }),
  } as unknown as ExecutionContext;
}

describe('RequestLoggingInterceptor', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs safe route templates and request timing on success', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const next = { handle: () => of({ ok: true }) } as CallHandler;
    await lastValueFrom(new RequestLoggingInterceptor().intercept(context(), next));
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      event: 'http.request',
      route: '/invitations/:token/summary',
      correlationId: 'correlation-id',
      organizationId: 'organization-id',
      status: 201,
      outcome: 'success',
      durationMs: expect.any(Number),
    }));
  });

  it('logs domain error status and code without swallowing the error', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const error = new DomainError('Product is not active', 'PRODUCT_NOT_ACTIVE', 409);
    const next = { handle: () => throwError(() => error) } as CallHandler;
    await expect(lastValueFrom(new RequestLoggingInterceptor().intercept(context(), next))).rejects.toBe(error);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'failure',
      status: 409,
      errorCode: 'PRODUCT_NOT_ACTIVE',
    }));
  });
});
