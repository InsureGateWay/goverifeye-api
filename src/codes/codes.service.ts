import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DataSource, ILike, In, MoreThanOrEqual } from 'typeorm';
import codeGenerationConfig from '../config/code-generation.config';
import { DomainError } from '../common/domain-error';
import { ProductEntity } from '../products/product.entity';
import { ProductStatus } from '../products/product.model';
import { ActivateCodeDto, BatchQueryDto, CodeQueryDto, GenerateBatchDto } from './code.dto'; import { pageOf } from '../common/api-response'; import { toOrder } from '../common/page-query.dto';
import { BatchStatus, CodeBatchEntity, VerificationCodeEntity, VerificationCodeStatus, VerificationEventEntity } from './code.entity';
import { CryptographicCodeGenerator, GeneratedCodePair } from './cryptographic-code-generator.service';

export interface GeneratedCredential { verificationCode: string; activationCode: string }

@Injectable()
export class CodesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly generator: CryptographicCodeGenerator,
    @Inject(codeGenerationConfig.KEY) private readonly options: ConfigType<typeof codeGenerationConfig>,
  ) {}

  async generateBatch(organizationId: string, actorId: string, input: GenerateBatchDto) {
    if (input.quantity > this.options.maxCodesPerBatch) {
      throw new DomainError(`A batch cannot exceed ${this.options.maxCodesPerBatch} codes`, 'BATCH_LIMIT_EXCEEDED');
    }

    return this.dataSource.transaction(async manager => {
      const product = await manager.findOne(ProductEntity, { where: { id: input.productId, organizationId }, lock: { mode: 'pessimistic_write' } });
      if (!product) throw new DomainError('Product was not found', 'PRODUCT_NOT_FOUND', 404);
      if (product.status !== ProductStatus.Active) throw new DomainError('Codes can only be generated for an active product', 'PRODUCT_NOT_ACTIVE', 409);

      const batch = await manager.save(CodeBatchEntity, manager.create(CodeBatchEntity, {
        organizationId, productId: product.id, generatedBy: actorId, labelType: input.labelType,
        fulfillment: input.fulfillment, paperSize: input.paperSize, quantity: input.quantity,
        status: BatchStatus.Generating,
      }));

      const pairs = this.generateUniquePairs(input.quantity);
      const alreadyUsed = await manager.find(VerificationCodeEntity, {
        select: { code: true }, where: { code: In(pairs.map(item => item.verificationCode)) },
      });
      const used = new Set(alreadyUsed.map(item => item.code));
      for (let index = 0; index < pairs.length; index += 1) {
        while (used.has(pairs[index]!.verificationCode)) pairs[index] = this.generator.generatePair();
        used.add(pairs[index]!.verificationCode);
      }

      const rows = pairs.map(pair => manager.create(VerificationCodeEntity, {
        organizationId, productId: product.id, batchId: batch.id, code: pair.verificationCode,
        activationCodeHash: pair.activationCodeHash, status: VerificationCodeStatus.Inactive,
      }));
      for (let start = 0; start < rows.length; start += 1000) await manager.insert(VerificationCodeEntity, rows.slice(start, start + 1000));

      product.totalCodes += input.quantity;
      await manager.save(ProductEntity, product);
      batch.status = BatchStatus.Generated;
      await manager.save(CodeBatchEntity, batch);

      return {
        batch: { id: batch.id, productId: batch.productId, quantity: batch.quantity, status: batch.status, createdAt: batch.createdAt },
        credentials: pairs.map(({ verificationCode, activationCode }): GeneratedCredential => ({ verificationCode, activationCode })),
        warning: 'Activation codes are returned only once. Store the generated file securely.',
      };
    }).catch((error: unknown) => {
      if (error instanceof DomainError) throw error;
      throw new ConflictException('The batch could not be generated safely. No codes were committed.');
    });
  }

  async activate(organizationId: string, actorId: string, input: ActivateCodeDto) {
    const result = await this.dataSource.transaction(async manager => {
      const record = await manager.findOne(VerificationCodeEntity, { where: { code: input.verificationCode, organizationId }, lock: { mode: 'pessimistic_write' } });
      if (!record) throw new DomainError('Verification code was not found', 'CODE_NOT_FOUND', 404);
      if (record.status === VerificationCodeStatus.Active) return { code: this.safeCode(record), invalidSecret: false };
      if (record.status !== VerificationCodeStatus.Inactive) throw new DomainError('Verification code cannot be activated in its current state', 'INVALID_CODE_STATE', 409);
      if (!this.generator.matchesActivationCode(record.code, input.activationCode, record.activationCodeHash)) {
        record.activationAttempts += 1;
        if (record.activationAttempts >= this.options.activationMaxAttempts) record.status = VerificationCodeStatus.Suspended;
        await manager.save(VerificationCodeEntity, record);
        return { code: null, invalidSecret: true };
      }
      record.status = VerificationCodeStatus.Active; record.activatedAt = new Date(); record.activatedBy = actorId;
      return { code: this.safeCode(await manager.save(VerificationCodeEntity, record)), invalidSecret: false };
    });
    if (result.invalidSecret) throw new DomainError('Invalid activation code', 'INVALID_ACTIVATION_CODE', 401);
    return result.code;
  }

  async verify(verificationCode: string) {
    return this.dataSource.transaction(async manager => {
      const record = await manager.findOne(VerificationCodeEntity, { where: { code: verificationCode }, lock: { mode: 'pessimistic_write' } });
      if (!record || record.status !== VerificationCodeStatus.Active) return { valid: false, status: record?.status ?? 'not_found' };
      const product = await manager.findOneBy(ProductEntity, { id: record.productId, organizationId: record.organizationId });
      if (!product || product.status !== ProductStatus.Active) return { valid: false, status: 'product_unavailable' };
      record.verificationCount += 1; record.lastVerifiedAt = new Date(); await manager.save(VerificationCodeEntity, record);
      product.scanned += 1; await manager.save(ProductEntity, product);
      await manager.save(VerificationEventEntity,manager.create(VerificationEventEntity,{organizationId:record.organizationId,productId:record.productId,codeId:record.id,outcome:'valid'}));
      return { valid: true, status: 'active', firstVerification: record.verificationCount === 1, verificationCount: record.verificationCount,
        product: { id: product.id, name: product.name, description: product.description, form: product.form, manufacturer: product.manufacturer, imageUrl: product.imageUrl } };
    });
  }

  async listBatches(organizationId: string, query: BatchQueryDto) { const repo = this.dataSource.getRepository(CodeBatchEntity); const where = { organizationId, ...(query.productId ? { productId: query.productId } : {}), ...(query.labelType ? { labelType: query.labelType } : {}), ...(query.fulfillment ? { fulfillment: query.fulfillment } : {}), ...(query.status ? { status: query.status } : {}) }; const order = toOrder(query.sortBy, query.sortDirection, ['createdAt', 'quantity', 'status', 'labelType'] as const, 'createdAt'); const [data, total] = await repo.findAndCount({ where, order, skip: (query.page - 1) * query.pageSize, take: query.pageSize }); return pageOf(data, total, query.page, query.pageSize, query.sortBy, query.sortDirection); }
  async getBatch(organizationId: string, id: string) {
    const batch = await this.dataSource.getRepository(CodeBatchEntity).findOneBy({ id, organizationId });
    if (!batch) throw new DomainError('Code batch was not found', 'BATCH_NOT_FOUND', 404);
    return batch;
  }
  async listCodes(organizationId: string, batchId: string, query: CodeQueryDto) { await this.getBatch(organizationId, batchId); const repo = this.dataSource.getRepository(VerificationCodeEntity); const where = { organizationId, batchId, ...(query.status ? { status: query.status } : {}), ...(query.search ? { code: ILike(`%${query.search}%`) } : {}), ...(query.verificationCountMin !== undefined ? { verificationCount: MoreThanOrEqual(query.verificationCountMin) } : {}) }; const order = toOrder(query.sortBy, query.sortDirection, ['code', 'status', 'createdAt', 'activatedAt', 'verificationCount', 'lastVerifiedAt'] as const, 'createdAt'); const [rows, total] = await repo.findAndCount({ where, order, skip: (query.page - 1) * query.pageSize, take: query.pageSize }); return pageOf(rows.map(row => this.safeCode(row)), total, query.page, query.pageSize, query.sortBy, query.sortDirection); }
  async cancelBatch(organizationId:string,id:string){const repo=this.dataSource.getRepository(CodeBatchEntity);const batch=await repo.findOneBy({id,organizationId});if(!batch)throw new DomainError('Code batch was not found','BATCH_NOT_FOUND',404);if(batch.status!==BatchStatus.Generating)throw new DomainError('Only a generating batch can be cancelled','BATCH_NOT_CANCELLABLE',409);batch.status=BatchStatus.Failed;return repo.save(batch)}
  async setCodeStatus(organizationId:string,id:string,status:'suspended'|'active'){const repo=this.dataSource.getRepository(VerificationCodeEntity);const row=await repo.findOneBy({id,organizationId});if(!row)throw new DomainError('Verification code was not found','CODE_NOT_FOUND',404);row.status=status=== 'active'?VerificationCodeStatus.Active:VerificationCodeStatus.Suspended;return this.safeCode(await repo.save(row))}

  private generateUniquePairs(quantity: number): GeneratedCodePair[] {
    const pairs: GeneratedCodePair[] = []; const seen = new Set<string>();
    while (pairs.length < quantity) { const pair = this.generator.generatePair(); if (!seen.has(pair.verificationCode)) { seen.add(pair.verificationCode); pairs.push(pair); } }
    return pairs;
  }
  private safeCode(code: VerificationCodeEntity) { return { id: code.id, code: code.code, batchId: code.batchId, productId: code.productId, status: code.status, activatedAt: code.activatedAt, verificationCount: code.verificationCount, lastVerifiedAt: code.lastVerifiedAt }; }
}
