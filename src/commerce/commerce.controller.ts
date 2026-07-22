import { Body, Controller, Get, Headers, NotImplementedException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { pageOf } from '../common/api-response';
import { DomainError } from '../common/domain-error';
import { toOrder } from '../common/page-query.dto';
import { CurrentUser, RequestContext } from '../common/request-context';
import { ReliabilityService } from '../operations/reliability.service';
import { ProductEntity } from '../products/product.entity';
import { CreateExportJobDto, CreatePaymentDto, CreateSupportTicketDto, JobQueryDto, QuoteDto, UpdateSupportTicketDto } from './commerce.dto'; import { Roles,UserRole } from '../auth/authorization';
import { BackgroundJobEntity, PaymentEntity, SupportTicketEntity } from './commerce.entity';

@ApiBearerAuth() @ApiTags('commerce') @Controller()
export class CommerceController {
  constructor(
    @InjectRepository(ProductEntity) private readonly products: Repository<ProductEntity>,
    @InjectRepository(PaymentEntity) private readonly payments: Repository<PaymentEntity>,
    @InjectRepository(BackgroundJobEntity) private readonly jobs: Repository<BackgroundJobEntity>,
    @InjectRepository(SupportTicketEntity) private readonly tickets: Repository<SupportTicketEntity>,
    private readonly reliability: ReliabilityService,
    private readonly db: DataSource,
  ) {}

  @Post('code-batch-quotes') async quote(@CurrentUser() user: RequestContext, @Body() dto: QuoteDto) {
    const product = await this.products.findOneBy({ id: dto.productId, organizationId: user.organizationId });
    if (!product) throw new DomainError('Product was not found', 'PRODUCT_NOT_FOUND', 404);
    const unitPrice = dto.labelType === 'pair' ? 14.25 : 7.5;
    return { productId: product.id, quantity: dto.quantity, labelType: dto.labelType, unitPrice, subtotal: Number((unitPrice * dto.quantity).toFixed(2)), currency: 'NGN', expiresAt: new Date(Date.now() + 15 * 60_000) };
  }

  @Post('payments') payment(@CurrentUser() user: RequestContext, @Headers('idempotency-key') key: string | undefined, @Body() dto: CreatePaymentDto) {
    void user;void key;void dto;throw new NotImplementedException('Payment processing is intentionally deferred');
  }

  @Get('payments/:id') async getPayment(@CurrentUser() user: RequestContext, @Param('id') id: string) { const row = await this.payments.findOneBy({ id, organizationId: user.organizationId }); if (!row) throw new DomainError('Payment was not found', 'PAYMENT_NOT_FOUND', 404); return row; }
  @Get('payments') async listPayments(@CurrentUser() user: RequestContext, @Query() query: JobQueryDto) { const order = toOrder(query.sortBy, query.sortDirection, ['createdAt','updatedAt','status','amount'] as const, 'createdAt'); const [data,total] = await this.payments.findAndCount({ where: { organizationId:user.organizationId, ...(query.status ? { status:query.status } : {}) }, order, skip:(query.page-1)*query.pageSize, take:query.pageSize }); return pageOf(data,total,query.page,query.pageSize,query.sortBy,query.sortDirection); }

  @Post('jobs') createJob(@CurrentUser() user: RequestContext, @Headers('idempotency-key') key: string | undefined, @Body() dto: CreateExportJobDto) {
    return this.reliability.execute(user.organizationId, user.userId, key, `job.${dto.type}`, () => this.db.transaction(async manager => {
      const job = await manager.save(BackgroundJobEntity, manager.create(BackgroundJobEntity, { organizationId:user.organizationId, createdBy:user.userId, type:dto.type, payload:{ batchId:dto.batchId, format:dto.format }, status:'queued' }));
      await this.reliability.enqueue(manager, 'job.created', 'job', job.id, { jobId:job.id, type:job.type });
      return job;
    }));
  }
  @Get('jobs') async listJobs(@CurrentUser() user:RequestContext,@Query() query:JobQueryDto){const order=toOrder(query.sortBy,query.sortDirection,['createdAt','updatedAt','type','status']as const,'createdAt');const[data,total]=await this.jobs.findAndCount({where:{organizationId:user.organizationId,...(query.type?{type:query.type}:{}),...(query.status?{status:query.status}:{})},order,skip:(query.page-1)*query.pageSize,take:query.pageSize});return pageOf(data,total,query.page,query.pageSize,query.sortBy,query.sortDirection)}
  @Get('jobs/:id') async job(@CurrentUser()user:RequestContext,@Param('id')id:string){const row=await this.jobs.findOneBy({id,organizationId:user.organizationId});if(!row)throw new DomainError('Job was not found','JOB_NOT_FOUND',404);return row}
  @Post('support-tickets') ticket(@CurrentUser()user:RequestContext,@Body()dto:CreateSupportTicketDto){return this.tickets.save(this.tickets.create({...dto,organizationId:user.organizationId,createdBy:user.userId}))}
  @Get('support-tickets') async listTickets(@CurrentUser()user:RequestContext,@Query()query:JobQueryDto){const order=toOrder(query.sortBy,query.sortDirection,['createdAt','updatedAt','status','subject']as const,'createdAt');const[data,total]=await this.tickets.findAndCount({where:{organizationId:user.organizationId,...(query.status?{status:query.status}:{})},order,skip:(query.page-1)*query.pageSize,take:query.pageSize});return pageOf(data,total,query.page,query.pageSize,query.sortBy,query.sortDirection)}
  @Roles(UserRole.PlatformAdmin) @Get('platform/support-tickets')async platformTickets(@Query()query:JobQueryDto){const order=toOrder(query.sortBy,query.sortDirection,['createdAt','updatedAt','status','subject']as const,'createdAt');const[data,total]=await this.tickets.findAndCount({where:{...(query.status?{status:query.status}:{})},order,skip:(query.page-1)*query.pageSize,take:query.pageSize});return pageOf(data,total,query.page,query.pageSize,query.sortBy,query.sortDirection)}
  @Roles(UserRole.PlatformAdmin) @Patch('platform/support-tickets/:id')async updateTicket(@Param('id')id:string,@Body()dto:UpdateSupportTicketDto){const row=await this.tickets.findOneBy({id});if(!row)throw new DomainError('Support ticket was not found','SUPPORT_TICKET_NOT_FOUND',404);row.status=dto.status;return this.tickets.save(row)}
}
