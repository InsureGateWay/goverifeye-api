import { CallHandler, ExecutionContext, HttpException, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { DomainError } from './domain-error';
import { RequestContext } from './request-context';

type LoggedRequest = {
  method: string;
  route?: { path?: string };
  headers: Record<string, string | string[] | undefined>;
  user?: RequestContext;
};

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<LoggedRequest>();
    const response = context.switchToHttp().getResponse<{ statusCode: number; getHeader(name: string): unknown }>();
    const started = performance.now();
    const common = () => ({
      event: 'http.request',
      method: request.method,
      route: request.route?.path ?? `${context.getClass().name}.${context.getHandler().name}`,
      correlationId: String(request.headers['x-correlation-id'] ?? response.getHeader('x-correlation-id') ?? ''),
      ...(request.user ? { userId: request.user.userId, organizationId: request.user.organizationId, role: request.user.role } : {}),
    });

    return next.handle().pipe(tap({
      next: () => this.logger.log({
        ...common(),
        outcome: 'success',
        status: response.statusCode,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
      }),
      error: (error: unknown) => {
        const status = error instanceof DomainError ? error.status : error instanceof HttpException ? error.getStatus() : 500;
        const entry = {
          ...common(),
          outcome: 'failure',
          status,
          errorCode: error instanceof DomainError ? error.code : status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
          durationMs: Math.round((performance.now() - started) * 100) / 100,
        };
        if (status >= 500) this.logger.error(entry);
        else this.logger.warn(entry);
      },
    }));
  }
}
