import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export interface SubmittedByIdentity { name: string; role: string; email: string }
export interface RequestContext { userId: string; organizationId: string; role: string; sessionId: string; name?: string; email?: string }
export function submittedBy(u: RequestContext): SubmittedByIdentity {
  return { name: u.name?.trim() || u.email || u.userId, role: u.role, email: u.email || '' };
}
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): RequestContext => {
  const request = context.switchToHttp().getRequest<{ user?: RequestContext }>();
  if (!request.user) throw new Error('Authenticated request context is missing');
  return request.user;
});
