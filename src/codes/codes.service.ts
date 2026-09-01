import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DataSource, ILike, In, MoreThan, MoreThanOrEqual } from 'typeorm'; import { createHash } from 'crypto';
import { randomInt } from 'crypto'; import * as argon2 from 'argon2';
import codeGenerationConfig from '../config/code-generation.config';
import { DomainError } from '../common/domain-error';
import { ProductEntity } from '../products/product.entity';
import { ProductStatus } from '../products/product.model';
import { UserEntity } from '../auth/auth.entity';
import { ActivateCodeDto, BatchQueryDto, CodeQueryDto, GenerateBatchDto, OpenMarketLinkDto, OpenMarketLookupDto, OpenMarketVerifyDto } from './code.dto'; import { pageOf } from '../common/api-response'; import { toOrder } from '../common/page-query.dto';
import { BatchStatus, CodeBatchEntity, OpenMarketBatchEntity, OpenMarketClaimEntity, VerificationCodeEntity, VerificationCodeStatus, VerificationEventEntity } from './code.entity';
import { CryptographicCodeGenerator, GeneratedCodePair } from './cryptographic-code-generator.service';
import { ReliabilityService } from '../operations/reliability.service'; import { verificationCodeEmail } from '../operations/email-templates'; import type { RequestContext } from '../common/request-context';
import { Fulfillment } from './code.enums';
import { PricingService } from '../commerce/pricing.service';

export interface GeneratedCredential { verificationCode: string; activationCode: string }

@Injectable()
export class CodesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly generator: CryptographicCodeGenerator,
    @Inject(codeGenerationConfig.KEY) private readonly options: ConfigType<typeof codeGenerationConfig>,
    private readonly reliability:ReliabilityService,
    private readonly pricing: PricingService,
  ) {}

  async exportCsv(organizationId: string, batchKey: string) {
    const batchRepo = this.dataSource.getRepository(CodeBatchEntity);
    const codeRepo = this.dataSource.getRepository(VerificationCodeEntity);
    const batches = batchKey === 'all'
      ? await batchRepo.find({ where: { organizationId }, order: { createdAt: 'DESC' } })
      : await batchRepo.find({ where: [{ id: batchKey, organizationId }, { clientRequestId: batchKey, organizationId }] });
    if (!batches.length && batchKey !== 'all') throw new DomainError('Batch was not found', 'BATCH_NOT_FOUND', 404);
    const ids = batches.map((b) => b.id);
    const rows = ids.length ? await codeRepo.find({ where: { organizationId, batchId: In(ids) }, order: { batchId: 'ASC', code: 'ASC' } }) : [];
    const esc = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = ['batchId,code,status,verificationCount,activatedAt,lastVerifiedAt', ...rows.map((r) => [r.batchId,r.code,r.status,r.verificationCount,r.activatedAt,r.lastVerifiedAt].map(esc).join(','))].join('\n');
    return { csv, filename: batchKey === 'all' ? 'all-code-batches.csv' : `code-batch-${batchKey}.csv` };
  }

  async generateBatch(organizationId: string, actorId: string, input: GenerateBatchDto,clientRequestId?:string) {
    if(!clientRequestId||clientRequestId.length<8||clientRequestId.length>128)throw new DomainError('A valid Idempotency-Key header is required','IDEMPOTENCY_KEY_REQUIRED',400);
    const prior=await this.dataSource.getRepository(CodeBatchEntity).findOneBy({organizationId,clientRequestId});if(prior)return{batch:prior,credentials:[],replayed:true,warning:'This request was already completed. Activation credentials are never returned again.'};
    if (input.quantity > this.options.maxCodesPerBatch) {
      throw new DomainError(`A batch cannot exceed ${this.options.maxCodesPerBatch} codes`, 'BATCH_LIMIT_EXCEEDED');
    }
    if(input.manufacturingDate&&input.expiryDate&&new Date(input.expiryDate)<=new Date(input.manufacturingDate))throw new DomainError('Expiry date must be after the manufacturing date','INVALID_BATCH_DATES',400);

    return this.dataSource.transaction(async manager => {
      const product = await manager.findOne(ProductEntity, { where: { id: input.productId, organizationId }, lock: { mode: 'pessimistic_write' } });
      if (!product) throw new DomainError('Product was not found', 'PRODUCT_NOT_FOUND', 404);
      if (product.status !== ProductStatus.Active) throw new DomainError('Codes can only be generated for an active product', 'PRODUCT_NOT_ACTIVE', 409);

      const batch = await manager.save(CodeBatchEntity, manager.create(CodeBatchEntity, {
        organizationId, clientRequestId, productId: product.id, generatedBy: actorId, labelType: input.labelType,
        fulfillment: input.fulfillment, paperSize: input.paperSize, logisticsService: input.logisticsService, manufacturingDate:input.manufacturingDate, expiryDate:input.expiryDate, quantity: input.quantity,
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

  async verify(verificationCode: string,context:{ip?:string;userAgent?:string;location?:string;customerComplaint?:string}={}) {
    return this.dataSource.transaction(async manager => {
      const record = await manager.findOne(VerificationCodeEntity, { where: { code: verificationCode }, lock: { mode: 'pessimistic_write' } });
      if (!record || record.status !== VerificationCodeStatus.Active) return { valid: false, status: record?.status ?? 'not_found' };
      const product = await manager.findOneBy(ProductEntity, { id: record.productId, organizationId: record.organizationId });
      if (!product || product.status !== ProductStatus.Active) return { valid: false, status: 'product_unavailable' };
      const recent=await manager.countBy(VerificationEventEntity,{codeId:record.id,createdAt:MoreThan(new Date(Date.now()-10*60_000))});const reasons:string[]=[];if(recent>=5)reasons.push('high_frequency');if(record.verificationCount>0)reasons.push('repeat_scan');const riskScore=Math.min(100,(recent>=5?70:0)+(record.verificationCount>0?20:0)),outcome=riskScore>=70?'suspicious':'valid';
      record.verificationCount += 1; record.lastVerifiedAt = new Date(); await manager.save(VerificationCodeEntity, record);
      product.scanned += 1;if(outcome==='suspicious')product.suspicious+=1;await manager.save(ProductEntity, product);
      const hash=(value:string|undefined)=>value?createHash('sha256').update(`${process.env.CODE_ACTIVATION_PEPPER}:${value}`).digest('hex'):undefined;await manager.save(VerificationEventEntity,manager.create(VerificationEventEntity,{organizationId:record.organizationId,productId:record.productId,codeId:record.id,outcome,location:context.location,ipAddress:context.ip,customerComplaint:context.customerComplaint,ipHash:hash(context.ip),userAgentHash:hash(context.userAgent),riskScore,riskReasons:reasons}));
      return { valid: true, status: 'active', firstVerification: record.verificationCount === 1, verificationCount: record.verificationCount,
        outcome,risk:outcome==='suspicious'?'review_recommended':'low',product: { id: product.id, name: product.name, description: product.description, form: product.form, manufacturer: product.manufacturer, imageUrl: product.imageUrl } };
    });
  }

  async listBatches(organizationId:string,query:BatchQueryDto){const allowed=new Set(['createdAt','quantity','status','labelType']),sort=allowed.has(query.sortBy)?query.sortBy:'createdAt',qb=this.dataSource.getRepository(CodeBatchEntity).createQueryBuilder('batch').leftJoin(ProductEntity,'product','product.id = batch.productId AND product.organizationId = batch.organizationId').addSelect('product.name','productName').where('batch.organizationId = :organizationId',{organizationId});if(query.productId)qb.andWhere('batch.productId = :productId',{productId:query.productId});if(query.labelType)qb.andWhere('batch.labelType = :labelType',{labelType:query.labelType});if(query.fulfillment)qb.andWhere('batch.fulfillment = :fulfillment',{fulfillment:query.fulfillment});if(query.status)qb.andWhere('batch.status = :status',{status:query.status});if(query.search){const isId=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.search);qb.andWhere(isId?'(batch.id = :batchId OR LOWER(product.name) LIKE :search)':'(LOWER(product.name) LIKE :search OR CAST(batch.id AS text) LIKE :search)',{batchId:query.search,search:`%${query.search.toLowerCase()}%`})}qb.orderBy(`batch.${sort}`,query.sortDirection.toUpperCase()as'ASC'|'DESC').skip((query.page-1)*query.pageSize).take(query.pageSize);const total=await qb.clone().skip(undefined).take(undefined).getCount(),{entities,raw}=await qb.getRawAndEntities();const items=await Promise.all(entities.map(async(row,index)=>({...row,productName:raw[index]?.productName,totalCost:await this.batchCost(row)})));return pageOf(items,total,query.page,query.pageSize,query.sortBy,query.sortDirection)}
  async summary(organizationId:string){const repo=this.dataSource.getRepository(VerificationCodeEntity),base=()=>repo.createQueryBuilder('code').where('code.organizationId = :organizationId',{organizationId});const [totalCodes,availableCodes,scannedCodes]=await Promise.all([repo.countBy({organizationId}),base().andWhere('code.verificationCount = 0').andWhere('code.status != :suspended',{suspended:VerificationCodeStatus.Suspended}).getCount(),base().andWhere('code.verificationCount > 0').getCount()]);return{totalCodes,availableCodes,scannedCodes}}
  async openMarketLookup(user:RequestContext,dto:OpenMarketLookupDto){const inventory=await this.dataSource.getRepository(OpenMarketBatchEntity).findOneBy({publicBatchId:dto.batchId.trim(),status:'available'});if(!inventory||!await argon2.verify(inventory.activationCodeHash,dto.activationCode))throw new DomainError('The batch ID or activation code is invalid','OPEN_MARKET_BATCH_INVALID',400);const claim=await this.dataSource.getRepository(OpenMarketClaimEntity).save(this.dataSource.getRepository(OpenMarketClaimEntity).create({userId:user.userId,organizationId:user.organizationId,inventoryBatchId:inventory.id,expiresAt:new Date(Date.now()+15*60000)}));return{claimId:claim.id,batch:{batchId:inventory.publicBatchId,labelType:inventory.labelType,quantity:inventory.quantity,totalCost:Number(inventory.totalCost)},expiresInSeconds:900}}
  async openMarketLink(user:RequestContext,claimId:string,dto:OpenMarketLinkDto){const [claim,account,product]=await Promise.all([this.dataSource.getRepository(OpenMarketClaimEntity).findOneBy({id:claimId,userId:user.userId,organizationId:user.organizationId,consumed:false}),this.dataSource.getRepository(UserEntity).findOneBy({id:user.userId,organizationId:user.organizationId,isActive:true}),this.dataSource.getRepository(ProductEntity).findOneBy({id:dto.productId,organizationId:user.organizationId,status:ProductStatus.Active})]);if(!claim||claim.expiresAt.getTime()<=Date.now())throw new DomainError('The Open Market claim has expired','OPEN_MARKET_CLAIM_EXPIRED',400);if(!account||!product)throw new DomainError('The account or selected product is unavailable','OPEN_MARKET_PRODUCT_INVALID',400);const code=randomInt(0,1_000_000).toString().padStart(6,'0');claim.productId=product.id;claim.otpHash=await argon2.hash(code,{type:argon2.argon2id});claim.attempts=0;claim.expiresAt=new Date(Date.now()+10*60000);await this.dataSource.transaction(async manager=>{await manager.save(OpenMarketClaimEntity,claim);await this.reliability.enqueue(manager,'email.send','open-market-claim',claim.id,{to:account.email,...verificationCodeEmail(code,10)})});return{claimId:claim.id,maskedEmail:this.maskEmail(account.email),expiresInSeconds:600,...(process.env.NODE_ENV==='test'?{code}:{})}}
  async openMarketVerify(user:RequestContext,claimId:string,dto:OpenMarketVerifyDto){
    const claimRepo=this.dataSource.getRepository(OpenMarketClaimEntity),candidate=await claimRepo.findOneBy({id:claimId,userId:user.userId,organizationId:user.organizationId,consumed:false});
    if(!candidate||!candidate.productId||!candidate.otpHash||candidate.expiresAt.getTime()<=Date.now()||candidate.attempts>=5)throw new DomainError('The verification code is invalid or expired','OPEN_MARKET_OTP_INVALID',400);
    candidate.attempts+=1;
    if(!await argon2.verify(candidate.otpHash,dto.code)){await claimRepo.save(candidate);throw new DomainError('The verification code is invalid or expired','OPEN_MARKET_OTP_INVALID',400)}
    return this.dataSource.transaction(async manager=>{
      const claim=await manager.findOne(OpenMarketClaimEntity,{where:{id:claimId,userId:user.userId,organizationId:user.organizationId,consumed:false},lock:{mode:'pessimistic_write'}});
      if(!claim||!claim.productId)throw new DomainError('The Open Market claim is unavailable','OPEN_MARKET_CLAIM_UNAVAILABLE',409);
      const inventory=await manager.findOne(OpenMarketBatchEntity,{where:{id:claim.inventoryBatchId,status:'available'},lock:{mode:'pessimistic_write'}}),product=await manager.findOneBy(ProductEntity,{id:claim.productId,organizationId:user.organizationId,status:ProductStatus.Active});
      if(!inventory||!product)throw new DomainError('This Open Market batch is no longer available','OPEN_MARKET_BATCH_UNAVAILABLE',409);
      const batch=await manager.save(CodeBatchEntity,manager.create(CodeBatchEntity,{organizationId:user.organizationId,productId:product.id,generatedBy:user.userId,labelType:inventory.labelType,fulfillment:Fulfillment.Preprinted,paperSize:'Roll',quantity:inventory.quantity,status:BatchStatus.Generated}));
      const pairs=this.generateUniquePairs(inventory.quantity),rows=pairs.map(pair=>manager.create(VerificationCodeEntity,{organizationId:user.organizationId,productId:product.id,batchId:batch.id,code:pair.verificationCode,activationCodeHash:pair.activationCodeHash,status:VerificationCodeStatus.Active,activatedAt:new Date(),activatedBy:user.userId}));
      for(let start=0;start<rows.length;start+=1000)await manager.insert(VerificationCodeEntity,rows.slice(start,start+1000));
      product.totalCodes+=inventory.quantity;await manager.save(ProductEntity,product);claim.consumed=true;claim.attempts=candidate.attempts;await manager.save(OpenMarketClaimEntity,claim);inventory.status='claimed';inventory.claimedAt=new Date();inventory.claimedByOrganizationId=user.organizationId;inventory.claimedCodeBatchId=batch.id;await manager.save(OpenMarketBatchEntity,inventory);
      const activatedBy=await manager.findOneBy(UserEntity,{id:user.userId,organizationId:user.organizationId});
      return{batchId:batch.id,publicBatchId:inventory.publicBatchId,productId:product.id,productName:product.name,productUnit:product.form,labelType:inventory.labelType,quantity:inventory.quantity,activatedBy:[activatedBy?.firstName,activatedBy?.lastName].filter(Boolean).join(' ')||activatedBy?.email||'Vendor user',activatedByImageUrl:activatedBy?.profileImageUrl,activatedOn:inventory.claimedAt,activated:true}
    })
  }
  async getBatch(organizationId: string, id: string) {
    const batch = await this.dataSource.getRepository(CodeBatchEntity).findOneBy({ id, organizationId });
    if (!batch) throw new DomainError('Code batch was not found', 'BATCH_NOT_FOUND', 404);
    const codeRepo=this.dataSource.getRepository(VerificationCodeEntity);
    const [product,user,activation]=await Promise.all([
      this.dataSource.getRepository(ProductEntity).findOneBy({id:batch.productId,organizationId}),
      this.dataSource.getRepository(UserEntity).findOneBy({id:batch.generatedBy,organizationId}),
      codeRepo.createQueryBuilder('code').select('COUNT(*)','total').addSelect(`SUM(CASE WHEN code.status = 'active' THEN 1 ELSE 0 END)`,'active').addSelect('MAX(code.activatedAt)','activatedOn').where('code.organizationId = :organizationId AND code.batchId = :id',{organizationId,id}).getRawOne<{total:string;active:string;activatedOn?:string}>(),
    ]);
    const total=Number(activation?.total??0),active=Number(activation?.active??0);
    return {...batch,productName:product?.name,productImageUrl:product?.imageUrl,productUnit:product?.form,generatedByName:[user?.firstName,user?.lastName].filter(Boolean).join(' ')||user?.email||'Vendor user',generatedByImageUrl:user?.profileImageUrl,totalCost:await this.batchCost(batch),isActivated:total>0&&active===total,activatedOn:total>0&&active===total?activation?.activatedOn:undefined};
  }
  async listCodes(organizationId: string, batchId: string, query: CodeQueryDto) { await this.getBatch(organizationId, batchId); const repo = this.dataSource.getRepository(VerificationCodeEntity); const where = { organizationId, batchId, ...(query.status ? { status: query.status } : {}), ...(query.search ? { code: ILike(`%${query.search}%`) } : {}), ...(query.verificationCountMin !== undefined ? { verificationCount: MoreThanOrEqual(query.verificationCountMin) } : {}) }; const order = toOrder(query.sortBy, query.sortDirection, ['code', 'status', 'createdAt', 'activatedAt', 'verificationCount', 'lastVerifiedAt'] as const, 'createdAt'); const [rows, total] = await repo.findAndCount({ where, order, skip: (query.page - 1) * query.pageSize, take: query.pageSize });const ids=rows.map(row=>row.id),events=ids.length?await this.dataSource.getRepository(VerificationEventEntity).createQueryBuilder('event').select('event.codeId','codeId').addSelect('MIN(event.createdAt)','firstVerifiedAt').addSelect(`SUM(CASE WHEN event.outcome = 'suspicious' THEN 1 ELSE 0 END)`,'suspiciousScans').where('event.codeId IN (:...ids)',{ids}).groupBy('event.codeId').getRawMany<{codeId:string;firstVerifiedAt:string;suspiciousScans:string}>():[],eventMap=new Map(events.map(row=>[row.codeId,row])); return pageOf(rows.map(row => ({...this.safeCode(row),firstVerifiedAt:eventMap.get(row.id)?.firstVerifiedAt,suspiciousScans:Number(eventMap.get(row.id)?.suspiciousScans??0)})), total, query.page, query.pageSize, query.sortBy, query.sortDirection); }
  async getCodeDetails(organizationId:string,id:string){const code=await this.dataSource.getRepository(VerificationCodeEntity).findOneBy({id,organizationId});if(!code)throw new DomainError('Verification code was not found','CODE_NOT_FOUND',404);const [events,product,batch]=await Promise.all([this.dataSource.getRepository(VerificationEventEntity).find({where:{organizationId,codeId:id},order:{createdAt:'ASC'}}),this.dataSource.getRepository(ProductEntity).findOneBy({id:code.productId,organizationId}),this.dataSource.getRepository(CodeBatchEntity).findOneBy({id:code.batchId,organizationId})]),actor=code.activatedBy?await this.dataSource.getRepository(UserEntity).findOneBy({id:code.activatedBy,organizationId}):null,suspicious=events.filter(event=>event.outcome==='suspicious'),firstVerifiedAt=events[0]?.createdAt;const days=Array.from({length:7},(_,index)=>{const date=new Date();date.setHours(0,0,0,0);date.setDate(date.getDate()-(6-index));return date}),trend=days.map(date=>{const next=new Date(date);next.setDate(next.getDate()+1);return{date:date.toISOString(),scans:events.filter(event=>event.createdAt>=date&&event.createdAt<next).length}});return{...this.safeCode(code),firstVerifiedAt,suspiciousScans:suspicious.length,manufacturingDate:batch?.manufacturingDate,expiryDate:batch?.expiryDate,activatedByName:[actor?.firstName,actor?.lastName].filter(Boolean).join(' ')||actor?.email,activatedByImageUrl:actor?.profileImageUrl,product:{id:product?.id,name:product?.name,unit:product?.form},trend,suspiciousEvents:suspicious.slice(-20).reverse().map(event=>({id:event.id,createdAt:event.createdAt,location:event.location,ipAddress:event.ipAddress,customerComplaint:event.customerComplaint,riskScore:event.riskScore,riskReasons:event.riskReasons??[]}))}}
  async cancelBatch(organizationId:string,id:string){const repo=this.dataSource.getRepository(CodeBatchEntity);const batch=await repo.findOneBy({id,organizationId});if(!batch)throw new DomainError('Code batch was not found','BATCH_NOT_FOUND',404);if(batch.status!==BatchStatus.Generating)throw new DomainError('Only a generating batch can be cancelled','BATCH_NOT_CANCELLABLE',409);batch.status=BatchStatus.Failed;return repo.save(batch)}
  async setCodeStatus(organizationId:string,id:string,status:'suspended'|'active'){const repo=this.dataSource.getRepository(VerificationCodeEntity);const row=await repo.findOneBy({id,organizationId});if(!row)throw new DomainError('Verification code was not found','CODE_NOT_FOUND',404);row.status=status=== 'active'?VerificationCodeStatus.Active:VerificationCodeStatus.Suspended;return this.safeCode(await repo.save(row))}

  private generateUniquePairs(quantity: number): GeneratedCodePair[] {
    const pairs: GeneratedCodePair[] = []; const seen = new Set<string>();
    while (pairs.length < quantity) { const pair = this.generator.generatePair(); if (!seen.has(pair.verificationCode)) { seen.add(pair.verificationCode); pairs.push(pair); } }
    return pairs;
  }
  private safeCode(code: VerificationCodeEntity) { return { id: code.id, code: code.code, batchId: code.batchId, productId: code.productId, status: code.status, activatedAt: code.activatedAt, verificationCount: code.verificationCount, lastVerifiedAt: code.lastVerifiedAt }; }
  private async batchCost(batch: Pick<CodeBatchEntity,'labelType'|'quantity'>) {
    return this.pricing.batchCost(batch);
  }
  private maskEmail(email:string){const[local,domain]=email.split('@');return`${local?.slice(0,2)}${'*'.repeat(Math.max(3,(local?.length??2)-2))}@${domain}`}
}
