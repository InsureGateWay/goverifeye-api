import 'reflect-metadata';
import { createHmac, randomUUID } from 'crypto';
import { readdirSync } from 'fs';
import { join } from 'path';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { UserEntity } from '../auth/auth.entity';
import { OrganizationEntity } from '../onboarding/onboarding.entity';
import { ProductEntity } from '../products/product.entity';
import { ProductStatus } from '../products/product.model';
import { AuditLogEntity } from '../operations/operations.entity';
import { RequestContext } from '../common/request-context';
import { CompleteBatchActivationSpec1725700000000 } from '../database/migrations/1725700000000-complete-batch-activation-spec';
import { BatchActivationService } from './batch-activation.service';
import { BatchActivationEventEntity, BatchActivationLimitEntity, ProductBatchEntity } from './batch-activation.entity';
import { CodeBatchEntity, CodeNamespaceEntity, VerificationCodeEntity, VerificationEventEntity } from './code.entity';
import { BatchStatus, Fulfillment, LabelType, VerificationCodeStatus } from './code.enums';
import { CodesService } from './codes.service';
import { CryptographicCodeGenerator } from './cryptographic-code-generator.service';
import { displayBatchReference } from './batch-format';
import { BatchQueryDto, CodeQueryDto } from './code.dto';

const testUrl=process.env.BATCH_TEST_DATABASE_URL;
const integration=testUrl?describe:describe.skip;

integration('batch activation against PostgreSQL',()=>{
  jest.setTimeout(120_000);
  let db:DataSource,activation:BatchActivationService,codes:CodesService;
  const masterKey='test-only-gve-master-secret-at-least-32-characters';
  const pepper='test-only-independent-activation-pepper-32-characters';
  const options={formatVersion:'3.3.7',keyVersion:'1',masterKey,keyRing:{'1':masterKey},activationCredentialLength:8,activationMaxAttempts:3,maxCodesPerBatch:10_000};
  const pinOptions={pepperVersion:'1',peppers:{'1':pepper},maxAttempts:3,windowMs:15*60_000};
  const password='IntegrationPassword123!';
  let passwordHash:string;
  const platform:RequestContext={userId:randomUUID(),organizationId:randomUUID(),sessionId:randomUUID(),role:'platform_admin'};
  let legacyId:string,legacyCode:string;

  beforeAll(async()=>{
    const url=new URL(testUrl!);
    if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/batch_spec'))throw new Error('Use a dedicated local batch_spec database');
    const folder=join(__dirname,'../database/migrations');
    const migrations=readdirSync(folder).filter(file=>file.endsWith('.ts')&&!file.startsWith('172570')).flatMap(file=>Object.values(require(join(folder,file))).filter(value=>typeof value==='function')) as Function[];
    db=new DataSource({type:'postgres',url:testUrl,entities:[UserEntity,OrganizationEntity,ProductEntity,AuditLogEntity,CodeBatchEntity,CodeNamespaceEntity,VerificationCodeEntity,VerificationEventEntity,ProductBatchEntity,BatchActivationLimitEntity,BatchActivationEventEntity],migrations,logging:false});
    await db.initialize();
    const existing=await db.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'");
    if(existing[0].count!==0)throw new Error('Integration tests require a fresh disposable database');
    await db.runMigrations();
    passwordHash=await argon2.hash(password);
    // Seed one issued 3.3.3 identity before applying the new migration.
    legacyId=randomUUID();
    const org=randomUUID(),product=randomUUID(),actor=randomUUID(),codeId=randomUUID();
    await db.getRepository(OrganizationEntity).save({id:org,companyName:`Legacy ${org}`,registrationNumber:org,industry:'test',country:'NG',administrator:{},address:{},documents:[],status:'approved'} as never);
    await db.getRepository(UserEntity).save({id:actor,organizationId:org,email:`${actor}@example.test`,passwordHash,firstName:'Legacy',lastName:'Vendor',role:'vendor_admin',isActive:true});
    await db.getRepository(ProductEntity).save({id:product,organizationId:org,name:'Legacy product',description:'Test',form:'Unit',manufacturer:'Test',status:ProductStatus.Active,createdBy:actor});
    const oldGenerator=new CryptographicCodeGenerator({...options,formatVersion:'3.3.3'});
    const generated=oldGenerator.generate('4827',1,legacyId);legacyCode=generated.verificationCode;
    await db.query('INSERT INTO code_batches (id,"organizationId","productId","labelType",fulfillment,quantity,status,"generatedBy","activationMode","activationCredentialHash") VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8,$9)',[legacyId,org,product,'main','preprinted','allocated',actor,'controlled_physical_print','old-hash']);
    await db.query('INSERT INTO verification_codes (id,"organizationId","productId","batchId",code,"codeFormatVersion","keyVersion",namespace,"internalSerial","publicToken","luhnDigit","antiFabTag","allocationId","productBatchId","unitId",status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$10,$11,$4,$4,$1,$12)',[codeId,org,product,legacyId,legacyCode,'3.3.3','1','4827',generated.publicToken,generated.luhnDigit,generated.antiFabTag,'allocated']);
    const runner=db.createQueryRunner();await runner.startTransaction();
    try{await new CompleteBatchActivationSpec1725700000000().up(runner);await runner.commitTransaction();}catch(error){await runner.rollbackTransaction();throw error;}finally{await runner.release();}
    activation=new BatchActivationService(db,pinOptions);
    codes=new CodesService(db,new CryptographicCodeGenerator(options),options,{} as never,{batchCost:async()=>0} as never,{} as never,{consume:async()=>({}),anonymousHash:()=>undefined} as never);
  });
  afterAll(async()=>{if(db?.isInitialized)await db.destroy()});

  async function fixture(fulfillment=Fulfillment.Preprinted){
    const organizationId=randomUUID(),userId=randomUUID();
    await db.getRepository(OrganizationEntity).save({id:organizationId,companyName:`Test ${organizationId}`,registrationNumber:organizationId,industry:'test',country:'NG',administrator:{},address:{},documents:[],status:'approved'} as never);
    await db.getRepository(UserEntity).save({id:userId,organizationId,email:`${userId}@example.test`,passwordHash,firstName:'Test',lastName:'Vendor',role:'vendor_admin',isActive:true});
    const product=await db.getRepository(ProductEntity).save({organizationId,name:'Test product',description:'Test',form:'Unit',manufacturer:'Test vendor',status:ProductStatus.Active,createdBy:userId});
    const actor:RequestContext={organizationId,userId,sessionId:randomUUID(),role:'vendor_admin'};
    const generated=await codes.generateBatch(organizationId,userId,{productId:product.id,labelType:LabelType.Main,fulfillment,quantity:100,paperSize:'Roll'},randomUUID());
    return {actor,batch:generated.batch,generated,source:randomUUID()};
  }
  async function reveal(f:Awaited<ReturnType<typeof fixture>>){return activation.reveal(f.batch.batchReference,f.actor,{password,reason:'First authorised reveal'},f.source)}
  async function activate(f:Awaited<ReturnType<typeof fixture>>,pin?:string,service=activation){return service.activate(displayBatchReference(f.batch.batchReference),f.actor,{confirm:true,productBatchReference:'LOT-001',password,pin:pin?.replace(/\s/g,'')},f.source)}

  it('migrates issued IDs and codes without changing the HMAC input',async()=>{
    const batch=await db.getRepository(CodeBatchEntity).findOneByOrFail({id:legacyId});
    expect(batch.id).toBe(legacyId);expect(batch.batchReference).toMatch(/^CB-[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(batch.pinRevealedAt).toBeNull();
    const code=await db.getRepository(VerificationCodeEntity).findOneByOrFail({batchId:legacyId});
    expect(code.code).toBe(legacyCode);expect(new CryptographicCodeGenerator(options).hasValidTag({...code,antiFabTag:code.antiFabTag!,namespace:code.namespace!,publicToken:code.publicToken!,allocationId:code.allocationId!,codeFormatVersion:code.codeFormatVersion!,keyVersion:code.keyVersion!})).toBe(true);
  });
  it.each([Fulfillment.Preprinted,Fulfillment.SelfPrint])('generates %s batches unactivated, with no PIN or digest',async mode=>{
    const f=await fixture(mode);
    expect(f.batch.id[14]).toBe('7');expect(f.batch.status).toBe(BatchStatus.Allocated);
    expect(JSON.stringify(f.generated)).not.toContain('batchActivationCredential');
    expect(await db.getRepository(VerificationCodeEntity).countBy({batchId:f.batch.id,status:VerificationCodeStatus.Allocated})).toBe(100);
    const [stored]=await db.query('SELECT "activationPinDigest","pinRevealedAt" FROM code_batches WHERE id=$1',[f.batch.id]);
    expect(stored).toEqual({activationPinDigest:null,pinRevealedAt:null});
    expect(JSON.parse(f.generated.masterQrPayload!)).toEqual({batchReference:f.batch.batchReference,deploymentMode:f.batch.activationMode});
  });
  it('enforces release, vendor ownership and fresh password proof',async()=>{
    const f=await fixture();
    await expect(reveal(f)).rejects.toMatchObject({code:'BATCH_NOT_RELEASED'});
    await activation.release(f.batch.id,platform);
    await expect(activation.reveal(f.batch.id,f.actor,{password:'wrong-password',reason:'Reveal'},f.source)).rejects.toMatchObject({code:'STEP_UP_REQUIRED'});
    await expect(activation.reveal(f.batch.id,{...f.actor,organizationId:randomUUID()},{password,reason:'Reveal'},randomUUID())).rejects.toMatchObject({code:'BATCH_NOT_FOUND'});
    const pin=await reveal(f);
    await expect(activation.activate(f.batch.id,f.actor,{confirm:true,productBatchReference:'LOT-001',pin:pin.pin.replace(/\s/g,'')},f.source)).rejects.toMatchObject({code:'STEP_UP_REQUIRED'});
    expect(await db.getRepository(BatchActivationEventEntity).countBy({batchId:f.batch.id,action:'step_up_failed'})).toBe(2);
  });
  it('stores only a batch-bound HMAC; resets invalidate prior PINs and rotation retains verification',async()=>{
    const f=await fixture();await activation.release(f.batch.id,platform);
    const first=await reveal(f),second=await reveal(f);expect(second.pin).not.toBe(first.pin);
    const [row]=await db.query('SELECT "activationPinDigest","activationPepperVersion" FROM code_batches WHERE id=$1',[f.batch.id]);
    expect(row.activationPinDigest).toBe(createHmac('sha256',pepper).update(`${f.batch.id}:${second.pin.replace(/\s/g,'')}`).digest('hex'));
    await expect(activate(f,first.pin)).rejects.toMatchObject({code:'BATCH_ACTIVATION_INVALID'});
    const rotated=new BatchActivationService(db,{...pinOptions,pepperVersion:'2',peppers:{...pinOptions.peppers,'2':'second-independent-activation-pepper-32-characters'}});
    expect(await activate(f,second.pin,rotated)).toMatchObject({activatedCodes:100});
    const stored=await codes.getBatch(f.actor.organizationId,f.batch.id);expect(JSON.stringify(stored)).not.toContain('activationPinDigest');
    const code=await db.getRepository(VerificationCodeEntity).findOneByOrFail({batchId:f.batch.id});
    expect(code.productBatchId).not.toBe(f.batch.id);expect(await codes.verify(code.code)).toMatchObject({valid:true,status:'market_active'});
  });
  it('commits rolling failures despite successful reveals and never revokes product codes',async()=>{
    const f=await fixture();await activation.release(f.batch.id,platform);
    let current=await reveal(f);
    for(let i=0;i<3;i++){
      const wrong=current.pin.replace(/\s/g,'')==='00000000'?'11111111':'00000000';
      await expect(activate(f,wrong)).rejects.toMatchObject({code:i===2?'ACTIVATION_COOLDOWN':'BATCH_ACTIVATION_INVALID'});
      if(i<2)current=await reveal(f);
    }
    const restarted=new BatchActivationService(db,pinOptions);
    await expect(activate(f,current.pin,restarted)).rejects.toMatchObject({code:'ACTIVATION_COOLDOWN'});
    expect((await db.getRepository(CodeBatchEntity).findOneByOrFail({id:f.batch.id})).status).toBe(BatchStatus.ReleasedForActivation);
    expect(await db.getRepository(VerificationCodeEntity).countBy({batchId:f.batch.id,status:VerificationCodeStatus.Allocated})).toBe(100);
    const now=Date.now(),clock=jest.spyOn(Date,'now').mockReturnValue(now+16*60_000);
    try{expect(await activate(f,current.pin,restarted)).toMatchObject({activatedCodes:100});}finally{clock.mockRestore();}
  });
  it.each(['vendor','source'])('enforces the shared %s limit across different batches',async scope=>{
    const first=await fixture(),group=[first];
    for(let i=0;i<2;i++){
      if(scope==='source')group.push(await fixture());
      else {
        const generated=await codes.generateBatch(first.actor.organizationId,first.actor.userId,{productId:first.batch.productId,labelType:LabelType.Main,fulfillment:Fulfillment.Preprinted,quantity:100,paperSize:'Roll'},randomUUID());
        group.push({...first,batch:generated.batch,generated,source:randomUUID()});
      }
    }
    if(scope==='source')for(const f of group)f.source=first.source;
    const pins:string[]=[];
    for(const f of group){await activation.release(f.batch.id,platform);pins.push((await reveal(f)).pin.replace(/\s/g,''));}
    for(let i=0;i<group.length;i++)await expect(activate(group[i]!,pins[i]==='00000000'?'11111111':'00000000')).rejects.toMatchObject({code:i===2?'ACTIVATION_COOLDOWN':'BATCH_ACTIVATION_INVALID'});
    await expect(activate(first,pins[0])).rejects.toMatchObject({code:'ACTIVATION_COOLDOWN'});
  });
  it('accepts canonical and displayed references in listing, details and export',async()=>{
    const f=await fixture(),reference=displayBatchReference(f.batch.batchReference);
    expect((await codes.getBatch(f.actor.organizationId,reference)).id).toBe(f.batch.id);
    expect((await codes.getBatch(f.actor.organizationId,f.batch.batchReference)).id).toBe(f.batch.id);
    const query=Object.assign(new BatchQueryDto(),{search:reference});
    expect((await codes.listBatches(f.actor.organizationId,query)).data).toHaveLength(1);
    expect((await codes.listCodes(f.actor.organizationId,reference,new CodeQueryDto())).meta.total).toBe(100);
    const exported=await codes.exportCsv(f.actor.organizationId,reference);
    expect(exported.csv.split('\n')).toHaveLength(101);expect(exported.csv).not.toContain('activationPin');
  });
  it('activates self-print only through a deliberate audited confirmation',async()=>{
    const f=await fixture(Fulfillment.SelfPrint);
    const code=await db.getRepository(VerificationCodeEntity).findOneByOrFail({batchId:f.batch.id});
    expect(await codes.verify(code.code)).toMatchObject({valid:false,status:'unactivated'});
    await expect(activation.activate(f.batch.id,f.actor,{confirm:false,productBatchReference:'LOT-001'},f.source)).rejects.toMatchObject({code:'ACTIVATION_CONFIRMATION_REQUIRED'});
    expect(await activate(f)).toMatchObject({activatedCodes:100});
    expect(await db.getRepository(BatchActivationEventEntity).countBy({batchId:f.batch.id,action:'activated'})).toBe(1);
    await expect(db.query('DELETE FROM batch_activation_events WHERE "batchId"=$1',[f.batch.id])).rejects.toThrow('append-only');
  });
  it('serializes competing reveals and activation so only the latest PIN works once',async()=>{
    const f=await fixture();await activation.release(f.batch.id,platform);
    const pins=await Promise.all([reveal(f),reveal(f)]);
    const [stored]=await db.query('SELECT "activationPinDigest" FROM code_batches WHERE id=$1',[f.batch.id]);
    const current=pins.find(p=>createHmac('sha256',pepper).update(`${f.batch.id}:${p.pin.replace(/\s/g,'')}`).digest('hex')===stored.activationPinDigest)!;
    expect(current).toBeDefined();
    const results=await Promise.all([activate(f,current.pin),activate(f,current.pin)]);
    expect(results.map(r=>r.activatedCodes).sort((a,b)=>a-b)).toEqual([0,100]);
    expect(await db.getRepository(BatchActivationEventEntity).countBy({batchId:f.batch.id,action:'activated'})).toBe(1);
  });
  it('rejects namespace tampering, immutable vendor reassignment, and legacy claims',async()=>{
    const f=await fixture(Fulfillment.SelfPrint);
    await expect(db.query('UPDATE code_batches SET "allocationVendorId"=$1,"organizationId"=$1 WHERE id=$2',[randomUUID(),f.batch.id])).rejects.toThrow('immutable');
    await db.query('UPDATE code_namespaces SET namespace=$1 WHERE "organizationId"=$2',['9998',f.actor.organizationId]);
    await expect(activate(f)).rejects.toMatchObject({code:'BATCH_BINDING_INVALID'});
    await expect(codes.openMarketVerify(f.actor,randomUUID(),{code:'123456'})).rejects.toMatchObject({code:'OPEN_MARKET_CLAIM_DISABLED'});
  });
});
