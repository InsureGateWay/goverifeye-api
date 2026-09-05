import { CodesService } from './codes.service';
import { CryptographicCodeGenerator } from './cryptographic-code-generator.service';
import { BatchStatus, CodeBatchEntity, VerificationCodeEntity, VerificationCodeStatus } from './code.entity';
import { ProductEntity } from '../products/product.entity';
import { ProductStatus } from '../products/product.model';

describe('GVE-16 verification pipeline',()=>{
  const masterKey='independent-test-master-key-with-32-chars',options={formatVersion:'3.3.3',keyVersion:'test-v1',masterKey,keyRing:{'test-v1':masterKey},activationCredentialLength:8,activationMaxAttempts:5,maxCodesPerBatch:10_000};
  const generator=new CryptographicCodeGenerator(options);
  const scanIdentity={consume:jest.fn(async()=>({})),anonymousHash:jest.fn(()=>undefined)};

  function harness(record?:VerificationCodeEntity,batchStatus=BatchStatus.MarketActive){
    const batch=record?{id:record.batchId,organizationId:record.organizationId,productId:record.productId,status:batchStatus}:undefined;
    const product=record?{id:record.productId,organizationId:record.organizationId,status:ProductStatus.Active,scanned:0,suspicious:0,name:'Test Product',description:'Test',form:'Unit',manufacturer:'Vendor'}:undefined;
    const manager={
      findOne:jest.fn(async()=>record),
      findOneBy:jest.fn(async(type:unknown)=>type===CodeBatchEntity?batch:type===ProductEntity?product:undefined),
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

  it('rejects a cross-allocation binding even when the printed tag is valid',async()=>{
    const record=activeRecord();record.productBatchId='55555555-5555-4555-8555-555555555555';
    await expect(harness(record).service.verify(record.code)).resolves.toEqual({valid:false,status:'invalid'});
  });
});
