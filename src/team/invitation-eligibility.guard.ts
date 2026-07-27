import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { DataSource, IsNull, Raw } from 'typeorm';
import { UserEntity } from '../auth/auth.entity';
import { DomainError } from '../common/domain-error';
import { RequestContext } from '../common/request-context';
import { TeamInvitationEntity } from './team.entity';

@Injectable()
export class InvitationEligibilityGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{method:string;path:string;body?:{email?:string};user?:RequestContext}>();
    if (request.method !== 'POST' || !/\/team\/members\/invite\/?$/.test(request.path)) return true;
    const email=request.body?.email?.trim().toLowerCase();
    if(!email||!request.user)return true;
    request.body!.email=email;
    const[account,pending]=await Promise.all([
      this.dataSource.getRepository(UserEntity).findOneBy({
        email:Raw(column=>`LOWER(TRIM(${column})) = :email`,{email}),
      }),
      this.dataSource.getRepository(TeamInvitationEntity).findOneBy({
        email:Raw(column=>`LOWER(TRIM(${column})) = :email`,{email}),
        acceptedAt:IsNull(),
        revokedAt:IsNull(),
      }),
    ]);
    if(account)throw new DomainError('A user account already exists for this email address','INVITEE_ACCOUNT_ALREADY_EXISTS',409);
    if(pending)throw new DomainError('A pending invitation already exists for this email address','INVITATION_ALREADY_PENDING',409);
    return true;
  }
}
