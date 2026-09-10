import { batchLookup, newCodeBatchId, newBatchReference, displayBatchReference, masterQrPayload } from './batch-format';
import { ProductBatchEntity } from './batch-activation.entity';
import { AuditLogEntity } from '../operations/operations.entity';
import type { VerifyCodeResponseDto } from '../customer/customer.contract';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { createHash, randomInt, randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { DataSource, EntityManager, ILike, In, MoreThan, MoreThanOrEqual } from 'typeorm';
import codeGenerationConfig from '../config/code-generation.config';
import { DomainError } from '../common/domain-error';
import { ProductEntity } from '../products/product.entity';
import { ProductStatus } from '../products/product.model';
import { UserEntity } from '../auth/auth.entity';
import { BatchQueryDto, CodeDetailsQueryDto, CodeQueryDto, GenerateBatchDto, OpenMarketLinkDto, OpenMarketLookupDto, OpenMarketVerifyDto } from './code.dto';
import { pageOf } from '../common/api-response';
import { toOrder } from '../common/page-query.dto';
import { BatchStatus, CodeBatchEntity, CodeNamespaceEntity, OpenMarketBatchEntity, OpenMarketClaimEntity, VerificationCodeEntity, VerificationCodeStatus, VerificationEventEntity } from './code.entity';
import { CryptographicCodeGenerator, GeneratedGve16Code, GVE16_FORMAT } from './cryptographic-code-generator.service';
import { ReliabilityService } from '../operations/reliability.service';
import type { RequestContext } from '../common/request-context';
import { Fulfillment } from './code.enums';
import { PricingService } from '../commerce/pricing.service';
import { EmailTemplateService } from '../operations/email-template.service';
import { verificationCodeEmail } from '../operations/email-templates';
import { ScanIdentityService } from './scan-identity.service';
import { isInternalProductName } from './internal-products';
import { AnomalyDetectionService } from './anomaly-detection.service';

export interface GeneratedCredential { verificationCode:string;displayCode:string;qrPayload:string }

@Injectable()
export class CodesService {
  constructor(
    private readonly dataSource:DataSource,
    private readonly generator:CryptographicCodeGenerator,
    @Inject(codeGenerationConfig.KEY) private readonly options:ConfigType<typeof codeGenerationConfig>,
    private readonly reliability:ReliabilityService,
    private readonly pricing:PricingService,
    private readonly emailTemplates:EmailTemplateService,
    private readonly scanIdentity:ScanIdentityService,
    private readonly anomalyDetection:AnomalyDetectionService,
  ){}

  async exportCsv(organizationId:string,batchKey:string){
    const batchRepo=this.dataSource.getRepository(CodeBatchEntity),codeRepo=this.dataSource.getRepository(VerificationCodeEntity);
    const batches=batchKey==='all'
      ?await batchRepo.find({where:{organizationId,status:BatchStatus.MarketActive},order:{createdAt:'DESC'}})
      :(batchLookup(batchKey)?await batchRepo.find({where:{...batchLookup(batchKey)!,organizationId}}):[]);
    if(!batches.length&&batchKey!=='all')throw new DomainError('Batch was not found','BATCH_NOT_FOUND',404);
    if(batchKey!=='all'&&batches[0]!.status!==BatchStatus.MarketActive)throw new DomainError('Activate this batch before downloading or printing its codes','BATCH_NOT_MARKET_ACTIVE',409);
    const ids=batches.map(row=>row.id),rows=ids.length?await codeRepo.find({where:{organizationId,batchId:In(ids)},order:{batchId:'ASC',code:'ASC'}}):[];
    const esc=(value:unknown)=>`"${String(value??'').replace(/"/g,'""')}"`;
    return{csv:['batchId,code,status,verificationCount,activatedAt,lastVerifiedAt',...rows.map(row=>[row.batchId,row.code,row.status,row.verificationCount,row.activatedAt,row.lastVerifiedAt].map(esc).join(','))].join('\n'),filename:batchKey==='all'?'all-code-batches.csv':`code-batch-${batchKey}.csv`};
  }

  async generateBatch(organizationId:string,actorId:string,input:GenerateBatchDto,clientRequestId?:string){
    try {
      return await this.dataSource.transaction((manager) =>
        this.generateBatchInTransaction(manager, organizationId, actorId, input, clientRequestId),
      );
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new ConflictException('The batch could not be generated safely. No codes were committed.');
    }
  }

  async generateBatchInTransaction(manager:EntityManager,organizationId:string,actorId:string,input:GenerateBatchDto,clientRequestId?:string){
    if(!clientRequestId||clientRequestId.length<8||clientRequestId.length>128)throw new DomainError('A valid Idempotency-Key header is required','IDEMPOTENCY_KEY_REQUIRED',400);
    const prior=await manager.findOneBy(CodeBatchEntity,{organizationId,clientRequestId});
    if(prior)return{batch:prior,credentials:[],replayed:true,batchReference:displayBatchReference(prior.batchReference),masterQrPayload:masterQrPayload(prior)};
    if(input.quantity>this.options.maxCodesPerBatch)throw new DomainError(`A batch cannot exceed ${this.options.maxCodesPerBatch} codes`,'BATCH_LIMIT_EXCEEDED');
    if(input.manufacturingDate&&input.expiryDate&&new Date(input.expiryDate)<=new Date(input.manufacturingDate))throw new DomainError('Expiry date must be after the manufacturing date','INVALID_BATCH_DATES',400);
    const product=await manager.findOne(ProductEntity,{where:{id:input.productId,organizationId},lock:{mode:'pessimistic_write'}});
    if(!product)throw new DomainError('Product was not found','PRODUCT_NOT_FOUND',404);
    if(product.status!==ProductStatus.Active)throw new DomainError('Codes can only be generated for an active product','PRODUCT_NOT_ACTIVE',409);
    const activationMode=input.fulfillment===Fulfillment.Preprinted?'controlled_physical_print':'self_print_digital';
    let batch=await manager.save(CodeBatchEntity,manager.create(CodeBatchEntity,{id:newCodeBatchId(),batchReference:newBatchReference(),allocationVendorId:organizationId,organizationId,clientRequestId,productId:product.id,generatedBy:actorId,labelType:input.labelType,fulfillment:input.fulfillment,paperSize:input.paperSize,logisticsService:input.logisticsService,manufacturingDate:input.manufacturingDate,expiryDate:input.expiryDate,quantity:input.quantity,activationMode,status:BatchStatus.Generating}));
    const generated=await this.allocateCodes(manager,organizationId,batch.id,input.quantity);
    batch.namespace=generated[0]!.namespace;
    const rows=generated.map(item=>{const id=randomUUID();return manager.create(VerificationCodeEntity,{id,organizationId,productId:product.id,batchId:batch.id,code:item.verificationCode,codeFormatVersion:item.codeFormatVersion,keyVersion:item.keyVersion,namespace:item.namespace,internalSerial:item.internalSerial,publicToken:item.publicToken,luhnDigit:item.luhnDigit,antiFabTag:item.antiFabTag,allocationId:item.allocationId,productBatchId:null,unitId:id,status:VerificationCodeStatus.Allocated})});
    for(let start=0;start<rows.length;start+=1000)await manager.insert(VerificationCodeEntity,rows.slice(start,start+1000));
    batch.status=BatchStatus.Allocated;batch=await manager.save(CodeBatchEntity,batch);
    await manager.insert(AuditLogEntity,{organizationId,actorId,action:'batch.generated',resourceType:'code_batch',resourceId:batch.id,status:'success'});
    product.totalCodes+=input.quantity;await manager.save(ProductEntity,product);
    return{batch,credentials:generated.map(({verificationCode})=>({verificationCode,displayCode:this.displayCode(verificationCode),qrPayload:this.qrPayload(verificationCode)})),batchReference:displayBatchReference(batch.batchReference),masterQrPayload:masterQrPayload(batch)};
  }

  async verify(verificationCode:string,context:{ip?:string;userAgent?:string;location?:string;customerComplaint?:string;scannerCookie?:string;nonce?:string;channel?:string;shopperId?:string}={}, transactionManager?:EntityManager){
    const work = async (manager:EntityManager):Promise<VerifyCodeResponseDto>=>{
      const identity=await this.scanIdentity.consume(manager,context.scannerCookie,context.nonce),ipHash=this.scanIdentity.anonymousHash(context.ip),userAgentHash=this.scanIdentity.anonymousHash(context.userAgent),submittedCodeHash=createHash('sha256').update(String(verificationCode)).digest('hex');
      if(context.shopperId)identity.scannerHash=this.scanIdentity.anonymousHash('shopper:'+context.shopperId);
      const candidate=this.generator.parseCandidate(verificationCode);
      if(!candidate||!this.generator.hasValidLuhn(candidate)){await this.recordInvalid(manager,{identity,ipHash,userAgentHash,submittedCodeHash,context});return this.invalidResult(identity);}
      const record=await manager.findOne(VerificationCodeEntity,{where:{namespace:candidate.namespace,publicToken:candidate.publicToken},lock:{mode:'pessimistic_write'}});
      const keyedValid=this.generator.hasValidTag({namespace:record?.namespace??candidate.namespace,publicToken:record?.publicToken??candidate.publicToken,antiFabTag:candidate.antiFabTag,allocationId:record?.allocationId??'00000000-0000-4000-8000-000000000000',codeFormatVersion:record?.codeFormatVersion??this.options.formatVersion,keyVersion:record?.keyVersion??this.options.keyVersion});
      if(!record||!['3.3.3','3.3.7'].includes(record.codeFormatVersion??'')||record.code!==candidate.canonical||!keyedValid){await this.recordInvalid(manager,{identity,ipHash,userAgentHash,submittedCodeHash,context});return this.invalidResult(identity);}
      const batch=await manager.findOneBy(CodeBatchEntity,{id:record.batchId,organizationId:record.organizationId,productId:record.productId});
      if(!batch||record.allocationId!==batch.id||(batch.allocationVendorId!==record.organizationId||batch.namespace!==record.namespace)||record.unitId!==record.id){await this.recordInvalid(manager,{identity,ipHash,userAgentHash,submittedCodeHash,context});return this.invalidResult(identity);}
      if(record.status!==VerificationCodeStatus.MarketActive||batch.status!==BatchStatus.MarketActive){
        const lifecycle:string[]=[record.status,batch.status];
        const status=lifecycle.includes('recalled')?'recalled':lifecycle.includes('revoked')?'revoked':lifecycle.includes('retired')?'retired':record.status!==VerificationCodeStatus.MarketActive?record.status:batch.status;
        return{valid:false,status:['allocated','generated','released_for_activation','generating'].includes(status)?'unactivated':status,...this.nonce(identity)};
      }
      const lot=record.productBatchId&&record.productBatchId===batch.productBatchId?await manager.findOneBy(ProductBatchEntity,{id:record.productBatchId,organizationId:record.organizationId,productId:record.productId}):null;
      if(!lot){await this.recordInvalid(manager,{identity,ipHash,userAgentHash,submittedCodeHash,context});return this.invalidResult(identity);}
      const product=await manager.findOneBy(ProductEntity,{id:record.productId,organizationId:record.organizationId});
      if(!product||product.status!==ProductStatus.Active)return{valid:false,status:'product_unavailable',...this.nonce(identity)};
      const since=new Date(Date.now()-10*60_000);
      const [recent,sameScanner,sameNetwork,sameIp,rapidDistinct]=await Promise.all([
        manager.countBy(VerificationEventEntity,{codeId:record.id,createdAt:MoreThan(since)}),
        identity.scannerHash?manager.countBy(VerificationEventEntity,{codeId:record.id,scannerHash:identity.scannerHash}):0,
        ipHash&&userAgentHash?manager.countBy(VerificationEventEntity,{codeId:record.id,ipHash,userAgentHash,createdAt:MoreThan(since)}):0,
        ipHash?manager.countBy(VerificationEventEntity,{codeId:record.id,ipHash,createdAt:MoreThan(since)}):0,
        identity.scannerHash?manager.getRepository(VerificationEventEntity).createQueryBuilder('event').select('COUNT(DISTINCT event.codeId)','count').where('event.scannerHash = :scannerHash AND event.createdAt > :since',{scannerHash:identity.scannerHash,since}).getRawOne<{count:string}>():undefined,
      ]);
      const verificationNumber=record.verificationCount+1,reasons:string[]=[];let riskScore=0;if(record.verificationCount>0)reasons.push('repeat_scan');if(verificationNumber>=5)riskScore+=70;if(recent>=4)reasons.push('high_frequency');if(sameScanner>0)reasons.push('same_scanner_repeat');else if(sameNetwork>0)reasons.push('same_ip_user_agent_repeat');else if(sameIp>0)reasons.push('same_ip_repeat');if(Number(rapidDistinct?.count??0)>=5){reasons.push('rapid_multi_code_scanning');riskScore+=50}
      // Sheet2 Anomaly Detection — merge instant catalog rules (geo, complaint, cloning, etc.).
      const assessment=await this.anomalyDetection.assessScan(manager,{
        codeId:record.id,
        organizationId:record.organizationId,
        productId:record.productId,
        verificationCount:record.verificationCount,
        location:context.location,
        ip:context.ip,
        customerComplaint:context.customerComplaint,
        productScanned:product.scanned,
        productSuspicious:product.suspicious,
        codeHint:record.code.slice(0,8),
      });
      for(const reason of assessment.reasons){if(!reasons.includes(reason))reasons.push(reason)}
      riskScore=Math.min(100,Math.max(riskScore,assessment.riskScore));
      const outcome=(riskScore>=70||assessment.outcome==='suspicious')?'suspicious':'valid';
      record.verificationCount+=1;record.lastVerifiedAt=new Date();await manager.save(VerificationCodeEntity,record);product.scanned+=1;if(outcome==='suspicious')product.suspicious+=1;await manager.save(ProductEntity,product);
      const event=await manager.save(VerificationEventEntity,manager.create(VerificationEventEntity,{organizationId:record.organizationId,productId:record.productId,codeId:record.id,outcome,channel:context.channel??'manual',submittedCodeHash,location:context.location,customerComplaint:context.customerComplaint,ipHash,userAgentHash,scannerHash:identity.scannerHash,riskScore,riskReasons:reasons}));
      await this.anomalyDetection.openAdminAlert(manager,{
        organizationId:record.organizationId,
        verificationEventId:event.id,
        assessment:{
          ...assessment,
          outcome,
          riskScore,
          reasons: reasons as typeof assessment.reasons,
        },
        codeHint:record.code.slice(0,8),
      });
      return{valid:true,status:'market_active',firstVerification:record.verificationCount===1,verificationCount:record.verificationCount,outcome,risk:outcome==='suspicious'?'review_recommended':'low',...this.nonce(identity),product:{id:product.id,name:product.name,description:product.description,form:product.form,manufacturer:product.manufacturer,imageUrl:product.imageUrl}};
    };
    return transactionManager ? work(transactionManager) : this.dataSource.transaction(work);
  }

  async listBatches(organizationId:string,query:BatchQueryDto){const allowed=new Set(['createdAt','quantity','status','labelType']),sort=allowed.has(query.sortBy)?query.sortBy:'createdAt',qb=this.dataSource.getRepository(CodeBatchEntity).createQueryBuilder('batch').leftJoin(ProductEntity,'product','product.id = batch.productId AND product.organizationId = batch.organizationId').addSelect('product.name','productName').where('batch.organizationId = :organizationId',{organizationId});if(query.productId)qb.andWhere('batch.productId = :productId',{productId:query.productId});if(query.labelType)qb.andWhere('batch.labelType = :labelType',{labelType:query.labelType});if(query.fulfillment)qb.andWhere('batch.fulfillment = :fulfillment',{fulfillment:query.fulfillment});if(query.status==='activated')qb.andWhere('batch.status = :status',{status:BatchStatus.MarketActive});else if(query.status==='awaiting_activation')qb.andWhere('batch.status IN (:...statuses)',{statuses:[BatchStatus.Generated,BatchStatus.Allocated,BatchStatus.ReleasedForActivation]});else if(query.status==='suspended')qb.andWhere('batch.status IN (:...statuses)',{statuses:[BatchStatus.Recalled,BatchStatus.Revoked]});else if(query.status)qb.andWhere('batch.status = :status',{status:query.status});if(query.search)qb.andWhere("(LOWER(product.name) LIKE :search OR CAST(batch.id AS text) LIKE :search OR LOWER(REPLACE(batch.batchReference,'-','')) LIKE :referenceSearch)",{search:`%${query.search.toLowerCase()}%`,referenceSearch:`%${query.search.toLowerCase().replace(/[-\s]/g,'')}%`});qb.orderBy(`batch.${sort}`,query.sortDirection.toUpperCase()as'ASC'|'DESC').skip((query.page-1)*query.pageSize).take(query.pageSize);const total=await qb.clone().skip(undefined).take(undefined).getCount(),{entities,raw}=await qb.getRawAndEntities();return pageOf(await Promise.all(entities.map(async(row,index)=>{const productName=raw[index]?.productName;return{...row,batchReference:displayBatchReference(row.batchReference),productName:isInternalProductName(productName)?'Selected during activation':productName,totalCost:await this.batchCost(row)}})),total,query.page,query.pageSize,query.sortBy,query.sortDirection)}
  async summary(organizationId:string){const repo=this.dataSource.getRepository(VerificationCodeEntity),base=()=>repo.createQueryBuilder('code').where('code.organizationId = :organizationId',{organizationId});const[totalCodes,availableCodes,scannedCodes]=await Promise.all([repo.countBy({organizationId}),base().andWhere('code.status = :status',{status:VerificationCodeStatus.MarketActive}).getCount(),base().andWhere('code.verificationCount > 0').getCount()]);return{totalCodes,availableCodes,scannedCodes}}

  async openMarketLookup(user: RequestContext, dto: OpenMarketLookupDto) {
    const digits = dto.batchId.replace(/\D/g, '').slice(0, 16);
    const publicBatchId = digits.match(/.{1,4}/g)?.join('-') ?? dto.batchId.trim();
    const inventory = await this.dataSource.getRepository(OpenMarketBatchEntity).findOne({
      where: { publicBatchId, status: 'available' },
      select: ['id', 'publicBatchId', 'activationCodeHash', 'labelType', 'quantity', 'totalCost', 'status', 'claimedCodeBatchId'],
    });
    if (!inventory?.claimedCodeBatchId || !await argon2.verify(inventory.activationCodeHash, dto.activationCode.replace(/\D/g, ''))) {
      throw new DomainError('The batch ID or activation code is invalid', 'OPEN_MARKET_BATCH_INVALID', 400);
    }
    const claimRepository = this.dataSource.getRepository(OpenMarketClaimEntity);
    const claim = await claimRepository.save(claimRepository.create({
      userId: user.userId,
      organizationId: user.organizationId,
      inventoryBatchId: inventory.id,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    }));
    return {
      claimId: claim.id,
      batch: {
        batchId: inventory.publicBatchId,
        labelType: inventory.labelType,
        quantity: inventory.quantity,
        totalCost: Number(inventory.totalCost),
      },
      expiresInSeconds: 900,
    };
  }

  async openMarketLink(user: RequestContext, claimId: string, dto: OpenMarketLinkDto) {
    const [claim, account, product] = await Promise.all([
      this.dataSource.getRepository(OpenMarketClaimEntity).findOneBy({
        id: claimId,
        userId: user.userId,
        organizationId: user.organizationId,
        consumed: false,
      }),
      this.dataSource.getRepository(UserEntity).findOneBy({
        id: user.userId,
        organizationId: user.organizationId,
        isActive: true,
      }),
      this.dataSource.getRepository(ProductEntity).findOneBy({
        id: dto.productId,
        organizationId: user.organizationId,
        status: ProductStatus.Active,
      }),
    ]);
    if (!claim || claim.expiresAt.getTime() <= Date.now()) {
      throw new DomainError('The Open Market claim has expired', 'OPEN_MARKET_CLAIM_EXPIRED', 400);
    }
    if (!account || account.role !== 'vendor_admin' || !product) {
      throw new DomainError('The account or selected product is unavailable', 'OPEN_MARKET_PRODUCT_INVALID', 400);
    }
    if (!await this.dataSource.getRepository(OpenMarketBatchEntity).existsBy({
      id: claim.inventoryBatchId,
      status: 'available',
    })) {
      throw new DomainError('This Open Market batch is no longer available', 'OPEN_MARKET_BATCH_UNAVAILABLE', 409);
    }
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    claim.productId = product.id;
    claim.otpHash = await argon2.hash(code, { type: argon2.argon2id });
    claim.attempts = 0;
    claim.expiresAt = new Date(Date.now() + 10 * 60_000);
    await this.dataSource.transaction(async (manager) => {
      await manager.save(OpenMarketClaimEntity, claim);
      const variables = { code, expiresInMinutes: 10 };
      const content = await this.emailTemplates.render(
        manager,
        'auth.open_market_otp',
        variables,
        () => verificationCodeEmail(code, 10),
      );
      await this.reliability.enqueue(manager, 'email.send', 'open-market-claim', claim.id, {
        to: account.email,
        ...content,
      });
    });
    return {
      claimId: claim.id,
      maskedEmail: this.maskEmail(account.email),
      expiresInSeconds: 600,
      ...(process.env.NODE_ENV === 'test' ? { code } : {}),
    };
  }

  async openMarketVerify(user: RequestContext, claimId: string, dto: OpenMarketVerifyDto) {
    const claimRepository = this.dataSource.getRepository(OpenMarketClaimEntity);
    const candidate = await claimRepository.findOne({
      where: {
        id: claimId,
        userId: user.userId,
        organizationId: user.organizationId,
        consumed: false,
      },
      select: ['id', 'userId', 'organizationId', 'inventoryBatchId', 'productId', 'otpHash', 'expiresAt', 'attempts', 'consumed'],
    });
    if (!candidate || !candidate.productId || !candidate.otpHash || candidate.expiresAt.getTime() <= Date.now() || candidate.attempts >= 5) {
      throw new DomainError('The verification code is invalid or expired', 'OPEN_MARKET_OTP_INVALID', 400);
    }
    candidate.attempts += 1;
    if (!await argon2.verify(candidate.otpHash, dto.code)) {
      await claimRepository.save(candidate);
      throw new DomainError('The verification code is invalid or expired', 'OPEN_MARKET_OTP_INVALID', 400);
    }

    return this.dataSource.transaction(async (manager) => {
      const claim = await manager.findOne(OpenMarketClaimEntity, {
        where: {
          id: claimId,
          userId: user.userId,
          organizationId: user.organizationId,
          consumed: false,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!claim?.productId) {
        throw new DomainError('The Open Market claim is unavailable', 'OPEN_MARKET_CLAIM_UNAVAILABLE', 409);
      }
      const inventory = await manager.findOne(OpenMarketBatchEntity, {
        where: { id: claim.inventoryBatchId, status: 'available' },
        lock: { mode: 'pessimistic_write' },
      });
      const product = await manager.findOne(ProductEntity, {
        where: {
          id: claim.productId,
          organizationId: user.organizationId,
          status: ProductStatus.Active,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!inventory?.claimedCodeBatchId || !product) {
        throw new DomainError('This Open Market batch is no longer available', 'OPEN_MARKET_BATCH_UNAVAILABLE', 409);
      }
      const batch = await manager.findOne(CodeBatchEntity, {
        where: { id: inventory.claimedCodeBatchId, status: BatchStatus.Allocated },
        lock: { mode: 'pessimistic_write' },
      });
      if (!batch || batch.activationMode !== 'controlled_physical_print') {
        throw new DomainError('This Open Market batch is no longer available', 'OPEN_MARKET_BATCH_UNAVAILABLE', 409);
      }
      const codes = await manager.getRepository(VerificationCodeEntity)
        .createQueryBuilder('code')
        .where('code.batchId = :batchId', { batchId: batch.id })
        .andWhere('code.organizationId = :organizationId', { organizationId: batch.organizationId })
        .andWhere('code.status = :status', { status: VerificationCodeStatus.Allocated })
        .setLock('pessimistic_write')
        .getMany();
      if (codes.length !== inventory.quantity) {
        throw new DomainError('The Open Market batch inventory is incomplete', 'OPEN_MARKET_BATCH_INVALID', 409);
      }

      const now = new Date();
      const lot = await manager.save(
        ProductBatchEntity,
        manager.create(ProductBatchEntity, {
          organizationId: user.organizationId,
          productId: product.id,
          lotReference: `OPEN-${inventory.publicBatchId.replace(/\D/g, '')}`,
        }),
      );
      const inventoryProduct = await manager.findOneBy(ProductEntity, {
        id: batch.productId,
        organizationId: batch.organizationId,
      });
      await manager.update(
        VerificationCodeEntity,
        { batchId: batch.id, organizationId: batch.organizationId, status: VerificationCodeStatus.Allocated },
        {
          organizationId: user.organizationId,
          productId: product.id,
          productBatchId: lot.id,
          status: VerificationCodeStatus.MarketActive,
          activatedAt: now,
          activatedBy: user.userId,
        },
      );
      batch.organizationId = user.organizationId;
      batch.allocationVendorId = user.organizationId;
      batch.productId = product.id;
      batch.productBatchId = lot.id;
      batch.status = BatchStatus.MarketActive;
      batch.activatedAt = now;
      batch.activatedBy = user.userId;
      await manager.save(CodeBatchEntity, batch);
      product.totalCodes += inventory.quantity;
      await manager.save(ProductEntity, product);
      if (inventoryProduct) {
        inventoryProduct.totalCodes = Math.max(0, inventoryProduct.totalCodes - inventory.quantity);
        await manager.save(ProductEntity, inventoryProduct);
      }
      claim.consumed = true;
      claim.attempts = candidate.attempts;
      await manager.save(OpenMarketClaimEntity, claim);
      inventory.status = 'claimed';
      inventory.claimedAt = now;
      inventory.claimedByOrganizationId = user.organizationId;
      await manager.save(OpenMarketBatchEntity, inventory);
      await manager.save(AuditLogEntity, manager.create(AuditLogEntity, {
        organizationId: user.organizationId,
        actorId: user.userId,
        action: 'open_market_batch.activated',
        resourceType: 'code_batch',
        resourceId: batch.id,
        status: 'success',
        metadata: { inventoryBatchId: inventory.id, publicBatchId: inventory.publicBatchId },
      }));
      const activatedBy = await manager.findOneBy(UserEntity, {
        id: user.userId,
        organizationId: user.organizationId,
      });
      return {
        batchId: batch.id,
        publicBatchId: inventory.publicBatchId,
        productId: product.id,
        productName: product.name,
        productUnit: product.form,
        labelType: inventory.labelType,
        quantity: inventory.quantity,
        activatedBy:
          [activatedBy?.firstName, activatedBy?.lastName].filter(Boolean).join(' ') ||
          activatedBy?.email ||
          'Vendor user',
        activatedByImageUrl: activatedBy?.profileImageUrl,
        activatedOn: now,
        activated: true,
      };
    });
  }

  async getBatch(organizationId:string,id:string){const lookup=batchLookup(id);const batch=lookup?await this.dataSource.getRepository(CodeBatchEntity).findOneBy({...lookup,organizationId}):null;if(!batch)throw new DomainError('Code batch was not found','BATCH_NOT_FOUND',404);const[product,user]=await Promise.all([this.dataSource.getRepository(ProductEntity).findOneBy({id:batch.productId,organizationId}),this.dataSource.getRepository(UserEntity).findOneBy({id:batch.generatedBy,organizationId})]);const productPendingSelection=isInternalProductName(product?.name);return{...batch,batchReference:displayBatchReference(batch.batchReference),masterQrPayload:masterQrPayload(batch),productName:productPendingSelection?'Selected during activation':product?.name,productImageUrl:productPendingSelection?undefined:product?.imageUrl,productUnit:productPendingSelection?'Unassigned':product?.form,generatedByName:[user?.firstName,user?.lastName].filter(Boolean).join(' ')||user?.email||'Vendor user',generatedByImageUrl:user?.profileImageUrl,totalCost:await this.batchCost(batch),isActivated:batch.status===BatchStatus.MarketActive,activatedOn:batch.activatedAt}}
  async listCodes(organizationId:string,batchId:string,query:CodeQueryDto){batchId=(await this.getBatch(organizationId,batchId)).id;const repo=this.dataSource.getRepository(VerificationCodeEntity),where={organizationId,batchId,...(query.status?{status:query.status}:{}),...(query.search?{code:ILike(`%${query.search}%`)}:{}),...(query.verificationCountMin!==undefined?{verificationCount:MoreThanOrEqual(query.verificationCountMin)}:{})},order=toOrder(query.sortBy,query.sortDirection,['code','status','createdAt','activatedAt','verificationCount','lastVerifiedAt']as const,'createdAt'),[rows,total]=await repo.findAndCount({where,order,skip:(query.page-1)*query.pageSize,take:query.pageSize});return pageOf(rows.map(row=>this.safeCode(row)),total,query.page,query.pageSize,query.sortBy,query.sortDirection)}
  async getCodeDetails(organizationId:string,id:string,query:CodeDetailsQueryDto={}){
    const code=await this.dataSource.getRepository(VerificationCodeEntity).findOneBy({id,organizationId});
    if(!code)throw new DomainError('Verification code was not found','CODE_NOT_FOUND',404);
    const[events,product,batch]=await Promise.all([
      this.dataSource.getRepository(VerificationEventEntity).find({where:{organizationId,codeId:id},order:{createdAt:'ASC'}}),
      this.dataSource.getRepository(ProductEntity).findOneBy({id:code.productId,organizationId}),
      this.dataSource.getRepository(CodeBatchEntity).findOneBy({id:code.batchId,organizationId}),
    ]);
    const today=new Date();today.setUTCHours(0,0,0,0);
    const trendEnd=query.endDate?new Date(`${query.endDate.slice(0,10)}T00:00:00.000Z`):today,trendStart=query.startDate?new Date(`${query.startDate.slice(0,10)}T00:00:00.000Z`):new Date(trendEnd);
    if(!query.startDate)trendStart.setUTCDate(trendStart.getUTCDate()-6);
    if(trendStart>trendEnd)throw new DomainError('Start date must be on or before end date','INVALID_DATE_RANGE',400);
    const rangeDays=Math.floor((trendEnd.getTime()-trendStart.getTime())/86_400_000)+1;
    if(rangeDays>366)throw new DomainError('Code scan trend date range cannot exceed 366 days','DATE_RANGE_TOO_LARGE',400);
    const trend=Array.from({length:rangeDays},(_,offset)=>{const date=new Date(trendStart);date.setUTCDate(date.getUTCDate()+offset);return{date:date.toISOString(),scans:0}}),trendByDate=new Map(trend.map(point=>[point.date.slice(0,10),point])),trendEndExclusive=new Date(trendEnd);trendEndExclusive.setUTCDate(trendEndExclusive.getUTCDate()+1);
    for(const event of events){const createdAt=new Date(event.createdAt);if(createdAt>=trendStart&&createdAt<trendEndExclusive){const point=trendByDate.get(createdAt.toISOString().slice(0,10));if(point)point.scans+=1}}
    const suspiciousEvents=events.filter(event=>event.outcome==='suspicious');
    return{
      ...this.safeCode(code),
      firstVerifiedAt:events[0]?.createdAt,
      suspiciousScans:suspiciousEvents.length,
      trend,
      trendRange:{startDate:trendStart.toISOString().slice(0,10),endDate:trendEnd.toISOString().slice(0,10)},
      suspiciousEvents:suspiciousEvents.slice().reverse().map(event=>({id:event.id,createdAt:event.createdAt,location:event.location,ipAddress:event.ipAddress,customerComplaint:event.customerComplaint,riskScore:event.riskScore,riskReasons:event.riskReasons??[]})),
      manufacturingDate:batch?.manufacturingDate,
      expiryDate:batch?.expiryDate,
      product:{id:product?.id,name:product?.name,unit:product?.form},
    }
  }
  async cancelBatch(organizationId:string,id:string){const repo=this.dataSource.getRepository(CodeBatchEntity),batch=batchLookup(id)?await repo.findOneBy({...batchLookup(id)!,organizationId}):null;if(!batch)throw new DomainError('Code batch was not found','BATCH_NOT_FOUND',404);if(batch.status!==BatchStatus.Generating)throw new DomainError('Only a generating batch can be cancelled','BATCH_NOT_CANCELLABLE',409);batch.status=BatchStatus.Failed;return repo.save(batch)}
  /** Sheet2 #23 — suspend every market-active code in a batch (→ revoked). */
  async suspendBatch(organizationId: string, actorId: string, id: string) {
    await this.getBatch(organizationId, id);
    const result = await this.dataSource
      .getRepository(VerificationCodeEntity)
      .createQueryBuilder()
      .update(VerificationCodeEntity)
      .set({ status: VerificationCodeStatus.Revoked })
      .where('"organizationId" = :organizationId AND "batchId" = :id', { organizationId, id })
      .andWhere('status = :active', { active: VerificationCodeStatus.MarketActive })
      .execute();
    void actorId;
    return { batchId: id, suspendedCodes: result.affected ?? 0 };
  }
  /** Sheet2 #23 — reactivate revoked codes in a batch (→ market active). */
  async reactivateBatch(organizationId: string, actorId: string, id: string) {
    await this.getBatch(organizationId, id);
    const result = await this.dataSource
      .getRepository(VerificationCodeEntity)
      .createQueryBuilder()
      .update(VerificationCodeEntity)
      .set({ status: VerificationCodeStatus.MarketActive })
      .where('"organizationId" = :organizationId AND "batchId" = :id', { organizationId, id })
      .andWhere('status = :suspended', { suspended: VerificationCodeStatus.Revoked })
      .execute();
    void actorId;
    return { batchId: id, reactivatedCodes: result.affected ?? 0 };
  }
  async setCodeStatus(organizationId:string,id:string,status:'suspended'|'active'){const repo=this.dataSource.getRepository(VerificationCodeEntity),row=await repo.findOneBy({id,organizationId});if(!row)throw new DomainError('Verification code was not found','CODE_NOT_FOUND',404);if(status==='active'&&row.status!==VerificationCodeStatus.Revoked)throw new DomainError('Only a revoked market code can be reactivated','CODE_STATE_INVALID',409);if(status==='suspended'&&row.status!==VerificationCodeStatus.MarketActive)throw new DomainError('Only a market-active code can be revoked','CODE_STATE_INVALID',409);row.status=status==='active'?VerificationCodeStatus.MarketActive:VerificationCodeStatus.Revoked;return this.safeCode(await repo.save(row))}

  private async allocateCodes(manager:EntityManager,organizationId:string,allocationId:string,quantity:number):Promise<GeneratedGve16Code[]>{
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,[organizationId]);
    const repo=manager.getRepository(CodeNamespaceEntity);let row=await repo.findOne({where:{organizationId},lock:{mode:'pessimistic_write'}});
    if(!row){const result=await manager.query(`SELECT nextval('gve_namespace_sequence') AS value`);const namespace=String(result[0]?.value).padStart(4,'0');row=await repo.save(repo.create({organizationId,namespace,nextSerial:'1'}));}
    const start=BigInt(row.nextSerial),end=start+BigInt(quantity)-1n;if(end>9_999_999n)throw new DomainError('The verification-code namespace has reached capacity','CODE_NAMESPACE_EXHAUSTED',409);row.nextSerial=(end+1n).toString();await repo.save(row);
    return Array.from({length:quantity},(_,index)=>this.generator.generate(row!.namespace,start+BigInt(index),allocationId));
  }
  private async recordInvalid(manager:EntityManager,input:{identity:{scannerHash?:string};ipHash?:string;userAgentHash?:string;submittedCodeHash:string;context:{location?:string;customerComplaint?:string;channel?:string}}){await manager.save(VerificationEventEntity,manager.create(VerificationEventEntity,{outcome:'invalid',channel:input.context.channel??'manual',submittedCodeHash:input.submittedCodeHash,location:input.context.location,customerComplaint:input.context.customerComplaint,ipHash:input.ipHash,userAgentHash:input.userAgentHash,scannerHash:input.identity.scannerHash,riskScore:0,riskReasons:[]}))}
  private invalidResult(identity:{nextNonce?:string;nonceExpiresInSeconds?:number}){return{valid:false,status:'invalid',...this.nonce(identity)}}
  private nonce(identity:{nextNonce?:string;nonceExpiresInSeconds?:number}){return identity.nextNonce?{nextNonce:identity.nextNonce,nonceExpiresInSeconds:identity.nonceExpiresInSeconds}:{}}
  private safeCode(code:VerificationCodeEntity){return{id:code.id,code:code.code,batchId:code.batchId,productId:code.productId,status:code.status,codeFormat:GVE16_FORMAT,codeFormatVersion:code.codeFormatVersion,keyVersion:code.keyVersion,activatedAt:code.activatedAt,verificationCount:code.verificationCount,lastVerifiedAt:code.lastVerifiedAt}}
  private displayCode(code:string){return code.match(/.{1,4}/g)?.join(' ')??code}
  private qrPayload(code:string){const base=(process.env.APP_PUBLIC_URL??'http://localhost:5173').replace(/\/$/,'');return`${base}/verify?code=${encodeURIComponent(code)}`}
  private async batchCost(batch:Pick<CodeBatchEntity,'labelType'|'quantity'>){return this.pricing.batchCost(batch)}
  private maskEmail(email:string){const[local,domain]=email.split('@');return`${local?.slice(0,2)}${'*'.repeat(Math.max(3,(local?.length??2)-2))}@${domain}`}
}
