import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export interface RequestContext { userId: string; organizationId: string; role: string; sessionId: string }
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): RequestContext => {
  const request = context.switchToHttp().getRequest<{ user?: RequestContext }>();
  if (!request.user) throw new Error('Authenticated request context is missing');
  return request.user;
});
