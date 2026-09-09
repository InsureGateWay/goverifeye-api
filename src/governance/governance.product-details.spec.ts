import { AuditLogEntity } from '../operations/operations.entity';
import { ProductEntity } from '../products/product.entity';
import { VerificationCodeEntity, VerificationCodeStatus, VerificationEventEntity } from '../codes/code.entity';
import { PlatformProductDetailsQueryDto } from './governance.dto';
import { GovernanceService } from './governance.service';

describe('GovernanceService platform product details',()=>{
  it('loads a vendor-owned product using its organization for every related query',async()=>{
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T12:00:00.000Z'));
    try{
      const product={id:'84a6ebe4-c5ba-46a7-a539-120c1abca245',organizationId:'vendor-org',name:'Laptop',form:'Unit',manufacturer:'Vendor',description:'Test',status:'active',totalCodes:10,scanned:3,createdAt:new Date('2026-09-01T08:00:00.000Z'),updatedAt:new Date('2026-09-09T09:00:00.000Z')};
      const productRepository={findOneBy:jest.fn().mockResolvedValue(product)},codeRepository={countBy:jest.fn().mockResolvedValue(8)};
      const locationQuery={select:jest.fn(),addSelect:jest.fn(),where:jest.fn(),andWhere:jest.fn(),groupBy:jest.fn(),orderBy:jest.fn(),limit:jest.fn(),getRawOne:jest.fn().mockResolvedValue({location:'Lagos',scans:'3'})};
      for(const method of ['select','addSelect','where','andWhere','groupBy','orderBy','limit'] as const)locationQuery[method].mockReturnValue(locationQuery);
      const eventRepository={
        createQueryBuilder:jest.fn(()=>locationQuery),
        find:jest.fn().mockResolvedValue([{createdAt:new Date('2026-09-09T09:00:00.000Z')}]),
        findAndCount:jest.fn().mockResolvedValue([[{id:'alert-1',createdAt:new Date('2026-09-09T09:00:00.000Z'),outcome:'suspicious',location:'Lagos',ipHash:'private',riskScore:70,riskReasons:['repeat_scan_threshold']}],1]),
        findOne:jest.fn().mockResolvedValueOnce({createdAt:new Date('2026-09-07T09:00:00.000Z')}).mockResolvedValueOnce({createdAt:new Date('2026-09-09T09:00:00.000Z')}),
      };
      const auditRepository={find:jest.fn().mockResolvedValue([])},repositories=new Map<unknown,unknown>([[ProductEntity,productRepository],[VerificationCodeEntity,codeRepository],[VerificationEventEntity,eventRepository],[AuditLogEntity,auditRepository]]),db={getRepository:jest.fn((entity:unknown)=>repositories.get(entity))};
      const service=new GovernanceService(db as never,{} as never,{} as never,{} as never,{} as never,{} as never,{} as never,{} as never,{} as never),query=Object.assign(new PlatformProductDetailsQueryDto(),{page:1,pageSize:10});
      const result=await service.productDetails(product.id,query);

      expect(productRepository.findOneBy).toHaveBeenCalledWith({id:product.id});
      expect(codeRepository.countBy).toHaveBeenCalledWith({organizationId:'vendor-org',productId:product.id,status:VerificationCodeStatus.MarketActive});
      expect(eventRepository.find).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({organizationId:'vendor-org',productId:product.id})}));
      expect(result).toMatchObject({id:product.id,activeCodes:8,scanned:3,suspicious:1,topRegion:'Lagos',suspiciousTotal:1});
      expect(result.trend.at(-1)).toMatchObject({date:'2026-09-09T00:00:00.000Z',scans:1});
      expect(result.suspiciousEvents[0]).not.toHaveProperty('ipHash');
    }finally{jest.useRealTimers()}
  });
});
