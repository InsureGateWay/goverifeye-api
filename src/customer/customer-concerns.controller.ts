import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Roles, UserRole } from '../auth/authorization';
import { CurrentUser, RequestContext } from '../common/request-context';
import { DomainError } from '../common/domain-error';
import { pageOf } from '../common/api-response';
import { VerificationCodeEntity } from '../codes/code.entity';
import { CustomerHistoryQuery, UpdateVendorConcernBody, VendorConcernQuery } from './customer.dto';
import { CustomerCheckEntity, CustomerConcernEntity } from './customer.entity';

@ApiBearerAuth() @ApiTags('customer-concerns') @Roles(UserRole.SuperAdmin) @Controller('platform/customer-concerns')
export class CustomerConcernsController {
  constructor(private readonly db: DataSource) {}
  @Get() async list(@Query() query: CustomerHistoryQuery) {
    const [rows, total] = await this.db.getRepository(CustomerConcernEntity).findAndCount({ order: { createdAt: 'DESC', id: 'DESC' }, skip: (query.page - 1) * 20, take: 20 });
    const items = await Promise.all(rows.map(async row => {
      const check = await this.db.getRepository(CustomerCheckEntity).findOneBy({ id: row.checkId });
      return { id: row.id, submittedAt: row.createdAt.toISOString(), reason: row.reason, note: row.note, code: check?.code, product: check?.result.product };
    }));
    return { items, total, page: query.page, pageSize: 20 };
  }
  @Get(':id/photo') async photo(@Param('id', ParseUUIDPipe) id: string, @Res() response: Response) {
    const row = await this.db.getRepository(CustomerConcernEntity).createQueryBuilder('concern').addSelect('concern.photo').where('concern.id = :id', { id }).getOne();
    if (!row?.photo) throw new DomainError('No photo is attached to this report.', 'PHOTO_NOT_FOUND', 404);
    response.setHeader('Cache-Control', 'private, no-store');
    response.type('image/jpeg').send(Buffer.from(row.photo.split(',')[1] ?? '', 'base64'));
  }
}

@ApiBearerAuth() @ApiTags('vendor-consumer-concerns') @Controller('vendor/consumer-concerns')
export class VendorCustomerConcernsController {
  constructor(private readonly db: DataSource) {}

  @Roles(UserRole.VendorAdmin, UserRole.VendorStaff) @Get()
  async list(@CurrentUser() user: RequestContext, @Query() query: VendorConcernQuery) {
    const sort=['createdAt','updatedAt','status','reason'].includes(query.sortBy)?query.sortBy:'createdAt',direction=query.sortDirection.toUpperCase()as'ASC'|'DESC';
    const qb = this.scoped(user.organizationId)
      .orderBy(`concern.${sort}`,direction).addOrderBy('concern.id',direction)
      .skip((query.page - 1) * query.pageSize).take(query.pageSize);
    if (query.status) qb.andWhere('concern.status = :status', { status: query.status });
    if (query.search?.trim()) qb.andWhere('(concern.reason ILIKE :search OR concern.note ILIKE :search OR check.code ILIKE :search)', { search: `%${query.search.trim()}%` });
    const [rows, total] = await qb.getManyAndCount();
    return pageOf(await Promise.all(rows.map((row) => this.response(row))), total, query.page, query.pageSize, query.sortBy, query.sortDirection);
  }

  @Roles(UserRole.VendorAdmin, UserRole.VendorStaff) @Get(':id')
  async detail(@CurrentUser() user: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const row = await this.scoped(user.organizationId).andWhere('concern.id = :id', { id }).getOne();
    if (!row) throw new DomainError('Consumer concern was not found', 'CONCERN_NOT_FOUND', 404);
    return this.response(row);
  }

  @Roles(UserRole.VendorAdmin) @Patch(':id')
  async update(@CurrentUser() user: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVendorConcernBody) {
    const row = await this.scoped(user.organizationId).andWhere('concern.id = :id', { id }).getOne();
    if (!row) throw new DomainError('Consumer concern was not found', 'CONCERN_NOT_FOUND', 404);
    row.status = dto.status;
    row.assignedToId = user.userId;
    row.resolutionNote = dto.resolutionNote?.trim() || null;
    return this.response(await this.db.getRepository(CustomerConcernEntity).save(row));
  }

  @Roles(UserRole.VendorAdmin, UserRole.VendorStaff) @Get(':id/photo')
  async photo(@CurrentUser() user: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Res() response: Response) {
    const row = await this.scoped(user.organizationId).andWhere('concern.id = :id', { id }).getOne();
    if (!row?.photo) throw new DomainError('No photo is attached to this report.', 'PHOTO_NOT_FOUND', 404);
    response.setHeader('Cache-Control', 'private, no-store');
    response.type('image/jpeg').send(Buffer.from(row.photo.split(',')[1] ?? '', 'base64'));
  }

  private scoped(organizationId: string) {
    return this.db.getRepository(CustomerConcernEntity).createQueryBuilder('concern')
      .addSelect('concern.photo')
      .innerJoin(CustomerCheckEntity, 'check', 'check.id = concern.checkId')
      .innerJoin(VerificationCodeEntity, 'verificationCode', 'verificationCode.code = check.code AND verificationCode.organizationId = :organizationId', { organizationId });
  }

  private async response(row: CustomerConcernEntity) {
    const check = await this.db.getRepository(CustomerCheckEntity).findOneBy({ id: row.checkId });
    return { id: row.id, submittedAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), reason: row.reason, note: row.note, status: row.status, resolutionNote: row.resolutionNote, assignedToId: row.assignedToId, hasPhoto: Boolean(row.photo), code: check?.code, product: check?.result.product };
  }
}
