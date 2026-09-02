import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DataSource, FindOptionsWhere } from 'typeorm';
import { Roles, UserRole } from '../auth/authorization';
import { DomainError } from '../common/domain-error';
import { pageOf } from '../common/api-response';
import { CurrentUser, RequestContext } from '../common/request-context';
import { OrganizationEntity } from '../onboarding/onboarding.entity';
import { OnboardingWelcomeService } from '../onboarding/onboarding-welcome.service';
import { ProductEntity } from '../products/product.entity';
import { ProductStatus } from '../products/product.model';
import { ApprovalDecisionEntity } from './approval.entity';
import {
  OrganizationListQueryDto,
  ReviewDecisionDto,
  ReviewQueueDto,
} from './approval.dto';

@ApiTags('platform-approvals')
@ApiBearerAuth()
@Roles(UserRole.SuperAdmin)
@Controller('platform/approvals')
export class ApprovalController {
  constructor(
    private readonly db: DataSource,
    private readonly welcome: OnboardingWelcomeService,
  ) {}

  @Get('queue')
  async queue(@Query() q: ReviewQueueDto) {
    const skip = (q.page - 1) * q.pageSize;
    if (q.resourceType === 'onboarding') {
      const [data, total] = await this.db
        .getRepository(OrganizationEntity)
        .findAndCount({
          where: { status: 'submitted' },
          order: {
            createdAt: q.sortDirection.toUpperCase() as 'ASC' | 'DESC',
          },
          skip,
          take: q.pageSize,
        });
      return pageOf(data, total, q.page, q.pageSize, q.sortBy, q.sortDirection);
    }
    const [data, total] = await this.db.getRepository(ProductEntity).findAndCount({
      where: { status: ProductStatus.Pending },
      order: { createdAt: q.sortDirection.toUpperCase() as 'ASC' | 'DESC' },
      skip,
      take: q.pageSize,
    });
    return pageOf(data, total, q.page, q.pageSize, q.sortBy, q.sortDirection);
  }

  /** Cross-tenant organization directory for the admin portal. */
  @Get('organizations')
  async organizations(@Query() q: OrganizationListQueryDto) {
    const where: FindOptionsWhere<OrganizationEntity> = {};
    if (q.status) where.status = q.status;
    const [data, total] = await this.db
      .getRepository(OrganizationEntity)
      .findAndCount({
        where,
        order: {
          createdAt: q.sortDirection.toUpperCase() as 'ASC' | 'DESC',
        },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      });
    return pageOf(data, total, q.page, q.pageSize, q.sortBy, q.sortDirection);
  }

  /** Single organization for admin vendor detail (avoids full-list scan). */
  @Get('organizations/:id')
  async organizationById(@Param('id') id: string) {
    const row = await this.db
      .getRepository(OrganizationEntity)
      .findOneBy({ id });
    if (!row) {
      throw new DomainError(
        'Organization was not found',
        'ORGANIZATION_NOT_FOUND',
        404,
      );
    }
    return row;
  }

  /** Products for a vendor organization (platform admin). */
  @Get('organizations/:id/products')
  async organizationProducts(
    @Param('id') id: string,
    @Query() q: ReviewQueueDto,
  ) {
    const org = await this.db
      .getRepository(OrganizationEntity)
      .findOneBy({ id });
    if (!org) {
      throw new DomainError(
        'Organization was not found',
        'ORGANIZATION_NOT_FOUND',
        404,
      );
    }
    const [data, total] = await this.db.getRepository(ProductEntity).findAndCount({
      where: { organizationId: id },
      order: { createdAt: q.sortDirection.toUpperCase() as 'ASC' | 'DESC' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    });
    return pageOf(data, total, q.page, q.pageSize, q.sortBy, q.sortDirection);
  }

  @Post('products/:id/decision')
  decideProduct(
    @CurrentUser() u: RequestContext,
    @Param('id') id: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return this.db.transaction(async (m) => {
      const row = await m.findOneBy(ProductEntity, { id });
      if (!row) throw new DomainError('Product was not found', 'PRODUCT_NOT_FOUND', 404);
      if (row.status !== ProductStatus.Pending) {
        throw new DomainError(
          'Product is not awaiting review',
          'REVIEW_STATE_INVALID',
          409,
        );
      }
      row.status =
        dto.decision === 'approved' ? ProductStatus.Active : ProductStatus.Rejected;
      row.rejectionReason = dto.decision === 'approved' ? undefined : dto.notes;
      await m.save(ProductEntity, row);
      await m.save(
        ApprovalDecisionEntity,
        m.create(ApprovalDecisionEntity, {
          resourceType: 'product',
          resourceId: row.id,
          organizationId: row.organizationId,
          decision: dto.decision,
          reviewedBy: u.userId,
          notes: dto.notes,
        }),
      );
      return row;
    });
  }

  @Post('onboarding/:id/decision')
  decideOnboarding(
    @CurrentUser() u: RequestContext,
    @Param('id') id: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return this.db.transaction(async (m) => {
      const row = await m.findOne(OrganizationEntity, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) {
        throw new DomainError(
          'Organization was not found',
          'ORGANIZATION_NOT_FOUND',
          404,
        );
      }
      if (row.status !== 'submitted') {
        throw new DomainError(
          'Onboarding is not awaiting review',
          'REVIEW_STATE_INVALID',
          409,
        );
      }
      row.status = dto.decision;
      await m.save(OrganizationEntity, row);
      await m.save(
        ApprovalDecisionEntity,
        m.create(ApprovalDecisionEntity, {
          resourceType: 'onboarding',
          resourceId: row.id,
          organizationId: row.id,
          decision: dto.decision,
          reviewedBy: u.userId,
          notes: dto.notes,
        }),
      );
      if (dto.decision === 'approved') {
        await this.welcome.enqueueVerifiedOnce(m, row);
      }
      return row;
    });
  }

  @Get(':type/:id/history')
  async history(
    @Param('type') type: 'product' | 'onboarding',
    @Param('id') id: string,
    @Query() q: ReviewQueueDto,
  ) {
    const repo = this.db.getRepository(ApprovalDecisionEntity);
    const [data, total] = await repo.findAndCount({
      where: { resourceType: type, resourceId: id },
      order: { createdAt: q.sortDirection.toUpperCase() as 'ASC' | 'DESC' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    });
    return pageOf(data, total, q.page, q.pageSize, 'createdAt', q.sortDirection);
  }
}
