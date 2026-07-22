import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestContext } from '../common/request-context';
export enum UserRole { Admin = 'admin', Staff = 'staff', PlatformAdmin = 'platform_admin' }
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
@Injectable() export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    const user = context.switchToHttp().getRequest<{ user?: RequestContext }>().user;
    if (!user || !roles.includes(user.role as UserRole)) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
