import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { RequestContext } from '../common/request-context';
import { UserRole } from '../auth/authorization';

@Injectable()
export class OnboardingWriteGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request=context.switchToHttp().getRequest<{
      method:string;
      path:string;
      user?:RequestContext;
    }>();
    // Platform approval decisions contain `/onboarding/` in their URL, but they
    // are governance actions protected by their own super-admin role guard.
    const isPlatformApproval=/\/platform\/approvals\/onboarding(?:\/|$)/.test(request.path);
    const isOnboardingWrite=request.method!=='GET'&&!isPlatformApproval&&/\/onboarding(?:\/|$)/.test(request.path);
    const canManageVendorProfile=request.user?.role===UserRole.VendorAdmin||request.user?.role===UserRole.SuperAdmin;
    if(isOnboardingWrite&&!canManageVendorProfile){
      throw new ForbiddenException('Only vendor administrators or super administrators can change company account details');
    }
    return true;
  }
}
