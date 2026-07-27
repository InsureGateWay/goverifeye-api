import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { RequestContext } from '../common/request-context';

@Injectable()
export class OnboardingWriteGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request=context.switchToHttp().getRequest<{
      method:string;
      path:string;
      user?:RequestContext;
    }>();
    const isOnboardingWrite=request.method!=='GET'&&/\/onboarding(?:\/|$)/.test(request.path);
    if(isOnboardingWrite&&request.user?.role!=='admin'){
      throw new ForbiddenException('Only vendor administrators can change company account details');
    }
    return true;
  }
}
