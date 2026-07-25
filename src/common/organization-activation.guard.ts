import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { DomainError } from './domain-error';
import { RequestContext } from './request-context';

const ACTIVATED_ORGANIZATION_REQUIRED = 'activatedOrganizationRequired';
export const RequiresActivatedOrganization = () => SetMetadata(ACTIVATED_ORGANIZATION_REQUIRED, true);

@Injectable()
export class OrganizationActivationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ user?: RequestContext; method: string; path: string }>();
    const required = this.reflector.getAllAndOverride<boolean>(
      ACTIVATED_ORGANIZATION_REQUIRED,
      [context.getHandler(), context.getClass()],
    ) || (request.method === 'POST' && /\/team\/members\/invite\/?$/.test(request.path));
    if (!required) return true;
    const user = request.user;
    if (!user?.organizationId) return true;
    const organization = await this.dataSource.getRepository('organizations')
      .createQueryBuilder('organization')
      .select('organization.status', 'status')
      .where('organization.id = :id', { id: user.organizationId })
      .getRawOne<{ status?: string }>();
    if (organization?.status !== 'approved') {
      throw new DomainError(
        'Your vendor account has not been activated. You can view the portal, but this action will be available after administrator verification.',
        'ACCOUNT_NOT_ACTIVATED',
        403,
      );
    }
    return true;
  }
}
