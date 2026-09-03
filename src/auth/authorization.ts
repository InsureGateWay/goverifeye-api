import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestContext } from '../common/request-context';
export enum UserRole {
  VendorAdmin = 'vendor_admin',
  VendorStaff = 'vendor_staff',
  SuperAdmin = 'super_admin',
  PlatformAdmin = 'platform_admin',
  PlatformStaff = 'platform_staff',
  /** @deprecated Use VendorAdmin. */
  Admin = 'vendor_admin',
  /** @deprecated Use VendorStaff. */
  Staff = 'vendor_staff',
}
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
@Injectable() export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    const request=context.switchToHttp().getRequest<{user?:RequestContext;path:string;method:string;body?:{role?:string}}>(),user=request.user;
    if(!user)return !roles?.length;
    const isPersonalVendorStaffWrite=/\/(?:auth|notifications|settings\/(?:profile|password|account))(?:\/|$)/.test(request.path);
    if(user.role===UserRole.VendorStaff&&request.method!=='GET'&&!isPersonalVendorStaffWrite)throw new ForbiddenException('Vendor staff have read and print access only');
    if(user.role===UserRole.VendorAdmin&&/\/team\/members\/invite\/?$/.test(request.path)&&request.body?.role!==UserRole.VendorStaff)throw new ForbiddenException('Vendor administrators can invite vendor staff only');
    if(user.role===UserRole.VendorAdmin&&/\/team\/members(?:\/|$)/.test(request.path)&&request.method!=='GET'&&request.body?.role&&![UserRole.VendorAdmin,UserRole.VendorStaff].includes(request.body.role as UserRole))throw new ForbiddenException('Vendor administrators cannot assign platform roles');
    if(user.role===UserRole.PlatformAdmin&&/\/platform\/team\/invites\/?$/.test(request.path)&&request.body?.role!==UserRole.PlatformStaff)throw new ForbiddenException('Platform administrators can invite platform staff only');
    const isPersonalPlatformAction=/\/(?:auth|notifications|settings\/(?:profile|password|account))(?:\/|$)/.test(request.path);
    const isPlatformStaffOperation=/\/platform\/(?:approvals|manage-codes|generate-code|vendors|products)(?:\/|$)/.test(request.path);
    const isPlatformDashboardRead=request.method==='GET'&&/\/platform\/dashboard(?:\/|$)/.test(request.path);
    if(user.role===UserRole.PlatformStaff&&!isPersonalPlatformAction&&!isPlatformStaffOperation&&!isPlatformDashboardRead)throw new ForbiddenException('Platform staff have access to vendor, product, and code operations only');
    const isConfiguration=/\/platform\/(?:options|email-templates|code-pricing)(?:\/|$)/.test(request.path);
    if(user.role===UserRole.PlatformAdmin&&request.method!=='GET'&&isConfiguration)throw new ForbiddenException('Platform administrators cannot change system configuration');
    if(!roles?.length)return true;
    if(roles.includes(user.role as UserRole))return true;
    if(roles.includes(UserRole.SuperAdmin)){
      if(user.role===UserRole.PlatformAdmin)return true;
      if(user.role===UserRole.PlatformStaff&&(isPlatformStaffOperation||isPlatformDashboardRead))return true;
    }
    throw new ForbiddenException('Insufficient permissions');
  }
}
