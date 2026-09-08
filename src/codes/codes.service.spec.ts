import { ProductBatchEntity } from './batch-activation.entity';
import { CodesService } from './codes.service';
import { CryptographicCodeGenerator } from './cryptographic-code-generator.service';
import { BatchStatus, CodeBatchEntity, VerificationCodeEntity, VerificationCodeStatus, VerificationEventEntity } from './code.entity';
import { ProductEntity } from '../products/product.entity';
import { ProductStatus } from '../products/product.model';

describe('GVE-16 verification pipeline',()=>{
  const masterKey='independent-test-master-key-with-32-chars',options={formatVersion:'3.3.3',keyVersion:'test-v1',masterKey,keyRing:{'test-v1':masterKey},activationCredentialLength:8,activationMaxAttempts:5,maxCodesPerBatch:10_000};
  const generator=new CryptographicCodeGenerator(options);
  const scanIdentity={consume:jest.fn(async()=>({})),anonymousHash:jest.fn(()=>undefined)};

  function harness(record?:VerificationCodeEntity,batchStatus=BatchStatus.MarketActive){
    const batch=record?{id:record.batchId,organizationId:record.organizationId,productId:record.productId,allocationVendorId:record.organizationId,namespace:record.namespace,productBatchId:record.batchId,status:batchStatus}:undefined;
    const product=record?{id:record.productId,organizationId:record.organizationId,status:ProductStatus.Active,scanned:0,suspicious:0,name:'Test Product',description:'Test',form:'Unit',manufacturer:'Vendor'}:undefined;
    const manager={
      findOne:jest.fn(async()=>record),
      findOneBy:jest.fn(async(type:unknown)=>type===CodeBatchEntity?batch:type===ProductEntity?product:type===ProductBatchEntity?{id:record?.productBatchId}:undefined),
      countBy:jest.fn(async()=>0),
      create:jest.fn((_type:unknown,value:unknown)=>value),
      save:jest.fn(async(_type:unknown,value?:unknown)=>value),
      getRepository:jest.fn(()=>({createQueryBuilder:()=>({select(){return this},where(){return this},getRawOne:async()=>({count:'0'})})})),
    };
    const db={transaction:jest.fn(async(callback:(m:typeof manager)=>unknown)=>callback(manager))};
    const service=new CodesService(db as never,generator,options as never,{} as never,{} as never,{} as never,scanIdentity as never);
    return{service,manager};
  }

  function activeRecord(){
    const allocationId='11111111-1111-4111-8111-111111111111',generated=generator.generate('4827',42,allocationId),id='22222222-2222-4222-8222-222222222222';
    return Object.assign(new VerificationCodeEntity(),generated,{id,code:generated.verificationCode,organizationId:'33333333-3333-4333-8333-333333333333',productId:'44444444-4444-4444-8444-444444444444',batchId:allocationId,productBatchId:allocationId,unitId:id,status:VerificationCodeStatus.MarketActive,verificationCount:0});
  }

  it('returns the same public result for an unknown identity and an invalid HMAC tag',async()=>{
    const valid=activeRecord(),unknown=harness(),fabricated=Object.assign(activeRecord(),{antiFabTag:'0000',code:valid.code.slice(0,12)+'0000'}),bad=harness(fabricated);
    const unknownResult=await unknown.service.verify(valid.code),badResult=await bad.service.verify(fabricated.code);
    expect(unknownResult).toEqual({valid:false,status:'invalid'});expect(badResult).toEqual(unknownResult);
  });

  it('returns unactivated for a correctly keyed allocated code',async()=>{
    const record=activeRecord();record.status=VerificationCodeStatus.Allocated;
    await expect(harness(record,BatchStatus.Allocated).service.verify(record.code)).resolves.toMatchObject({valid:false,status:'unactivated'});
  });

  it('returns a live verdict only after tag, lifecycle, and binding checks',async()=>{
    const record=activeRecord(),result=await harness(record).service.verify(record.code,{channel:'qr'});
    expect(result).toMatchObject({valid:true,status:'market_active',firstVerification:true,outcome:'valid',product:{name:'Test Product'}});
  });

  it('keeps the first four checks valid and flags the fifth repeated check',async()=>{
    const record=activeRecord(),{service}=harness(record),results=[];
    for(let count=0;count<5;count++)results.push(await service.verify(record.code,{channel:'qr'}));
    expect(results.map(result=>result.outcome)).toEqual(['valid','valid','valid','valid','suspicious']);
    expect(results.map(result=>result.verificationCount)).toEqual([1,2,3,4,5]);
    expect(results[4]).toMatchObject({risk:'review_recommended'});
  });

  it('rejects a cross-allocation binding even when the printed tag is valid',async()=>{
    const record=activeRecord();record.productBatchId='55555555-5555-4555-8555-555555555555';
    await expect(harness(record).service.verify(record.code)).resolves.toEqual({valid:false,status:'invalid'});
  });

  it('returns the requested scan date range and the suspicious-event rows counted in code details',async()=>{
    jest.useFakeTimers().setSystemTime(new Date('2026-09-08T12:00:00.000Z'));
    try{
      const code=Object.assign(activeRecord(),{verificationCount:3,lastVerifiedAt:new Date('2026-09-08T09:00:00.000Z')}),events=[
        Object.assign(new VerificationEventEntity(),{id:'event-valid',createdAt:new Date('2026-09-07T10:00:00.000Z'),outcome:'valid',riskScore:0,riskReasons:[]}),
        Object.assign(new VerificationEventEntity(),{id:'event-alert-1',createdAt:new Date('2026-09-07T11:00:00.000Z'),outcome:'suspicious',location:'Lagos',ipAddress:'203.0.113.4',ipHash:'private-hash',riskScore:70,riskReasons:['repeat_scan_threshold']}),
        Object.assign(new VerificationEventEntity(),{id:'event-alert-2',createdAt:new Date('2026-09-08T09:00:00.000Z'),outcome:'suspicious',customerComplaint:'Seal damaged',riskScore:80,riskReasons:['high_frequency']}),
      ];
      const repositories=new Map<unknown,unknown>([
        [VerificationCodeEntity,{findOneBy:jest.fn(async()=>code)}],
        [VerificationEventEntity,{find:jest.fn(async()=>events)}],
        [ProductEntity,{findOneBy:jest.fn(async()=>({id:code.productId,name:'Test Product',form:'Unit'}))}],
        [CodeBatchEntity,{findOneBy:jest.fn(async()=>({id:code.batchId,manufacturingDate:'2026-08-01',expiryDate:'2027-08-01'}))}],
      ]);
      const db={getRepository:jest.fn((entity:unknown)=>repositories.get(entity))},service=new CodesService(db as never,generator,options as never,{} as never,{} as never,{} as never,scanIdentity as never);
      const details=await service.getCodeDetails(code.organizationId,code.id,{startDate:'2026-09-06',endDate:'2026-09-08'});
      expect(details).toMatchObject({verificationCount:3,suspiciousScans:2,firstVerifiedAt:events[0]!.createdAt,trendRange:{startDate:'2026-09-06',endDate:'2026-09-08'}});
      expect(details.trend.map(point=>[point.date.slice(0,10),point.scans])).toEqual([
        ['2026-09-06',0],['2026-09-07',2],['2026-09-08',1],
      ]);
      expect(details.suspiciousEvents).toEqual([
        {id:'event-alert-2',createdAt:events[2]!.createdAt,location:undefined,ipAddress:undefined,customerComplaint:'Seal damaged',riskScore:80,riskReasons:['high_frequency']},
        {id:'event-alert-1',createdAt:events[1]!.createdAt,location:'Lagos',ipAddress:'203.0.113.4',customerComplaint:undefined,riskScore:70,riskReasons:['repeat_scan_threshold']},
      ]);
      expect(details.suspiciousEvents[1]).not.toHaveProperty('ipHash');
    }finally{jest.useRealTimers()}
  });
});
