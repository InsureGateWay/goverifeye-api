import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { DomainError } from './domain-error';
import { RequestContext } from './request-context';

@Injectable()
export class PendingAccountGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request=context.switchToHttp().getRequest<{path:string;user?:RequestContext}>();
    if(request.user?.isActive!==false)return true;
    if(/\/onboarding(?:\/|$)/.test(request.path)||/\/auth\/(?:me|logout)(?:\/|$)/.test(request.path))return true;
    throw new DomainError('Your vendor account is awaiting administrator approval. Complete onboarding or wait for approval.','ACCOUNT_NOT_ACTIVATED',403);
  }
}
