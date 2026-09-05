import { ScanIdentityService } from './scan-identity.service';

describe('ScanIdentityService',()=>{
  function fixture(){
    const rows:any[]=[];
    const repository={
      create:(value:any)=>value,
      save:async(value:any)=>{const saved={id:value.id??`session-${rows.length+1}`,createdAt:value.createdAt??new Date(),updatedAt:new Date(),version:(value.version??0)+1,...value};const index=rows.findIndex(row=>row.id===saved.id);if(index>=0)rows[index]=saved;else rows.push(saved);return saved},
      findOneBy:async(where:any)=>rows.find(row=>row.scannerHash===where.scannerHash)??null,
      findOne:async({where}:any)=>rows.find(row=>row.scannerHash===where.scannerHash)??null,
    };
    const db={getRepository:()=>repository};
    const manager={getRepository:()=>repository};
    const service=new ScanIdentityService(db as never,{activationPepper:'test-scan-pepper-with-sufficient-entropy'} as never);
    return{service,manager};
  }
  it('creates a signed browser identity and consumes each nonce only once',async()=>{
    const{service,manager}=fixture(),started=await service.begin(undefined,'203.0.113.5','Browser/1');
    const consumed=await service.consume(manager as never,started.cookieValue,started.nonce);
    expect(consumed.scannerHash).toMatch(/^[a-f0-9]{64}$/);expect(consumed.nextNonce).toBeDefined();
    await expect(service.consume(manager as never,started.cookieValue,started.nonce)).rejects.toMatchObject({code:'SCAN_NONCE_INVALID'});
  });
  it('does not trust a modified scanner cookie',async()=>{
    const{service,manager}=fixture(),started=await service.begin(undefined);
    await expect(service.consume(manager as never,`${started.cookieValue}x`,started.nonce)).resolves.toEqual({});
  });
});
