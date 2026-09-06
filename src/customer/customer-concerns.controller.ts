import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Roles, UserRole } from '../auth/authorization';
import { DomainError } from '../common/domain-error';
import { CustomerHistoryQuery } from './customer.dto';
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
