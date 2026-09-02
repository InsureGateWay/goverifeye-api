import { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';

describe('AuditInterceptor',()=>{
  const save=jest.fn().mockResolvedValue(undefined),db={getRepository:jest.fn(()=>({save}))}as never;
  const request={method:'DELETE',url:'/api/v1/platform/vendors/vendor-1/products/product-1/image',originalUrl:'/api/v1/platform/vendors/vendor-1/products/product-1/image',headers:{'user-agent':'test-browser','x-correlation-id':'correlation-1'},params:{vendorId:'vendor-1',productId:'product-1'},user:{userId:'admin-1',organizationId:'platform-1',role:'super_admin',sessionId:'session-1'}};
  const context={switchToHttp:()=>({getRequest:()=>request})}as ExecutionContext;
  beforeEach(()=>jest.clearAllMocks());
  it('captures useful super-admin context for the UI',async()=>{await lastValueFrom(new AuditInterceptor(db).intercept(context,{handle:()=>of({deleted:true})}));await new Promise(resolve=>setImmediate(resolve));expect(save).toHaveBeenCalledWith(expect.objectContaining({action:'delete.product',resourceType:'product',resourceId:'product-1',status:'success',metadata:expect.objectContaining({authority:'Super Admin',userAgent:'test-browser',sessionId:'session-1',vendorId:'vendor-1'})}));});
  it('captures failures and preserves the original error',async()=>{const error=new Error('failed');await expect(lastValueFrom(new AuditInterceptor(db).intercept(context,{handle:()=>throwError(()=>error)}))).rejects.toBe(error);await new Promise(resolve=>setImmediate(resolve));expect(save).toHaveBeenCalledWith(expect.objectContaining({status:'failed'}));});
  it('captures sensitive exports but not ordinary reads',async()=>{const interceptor=new AuditInterceptor(db),getContext=(url:string)=>({switchToHttp:()=>({getRequest:()=>({...request,method:'GET',url,originalUrl:url,params:{}})})}as ExecutionContext);await lastValueFrom(interceptor.intercept(getContext('/api/v1/platform/products/export'),{handle:()=>of('csv')}));await new Promise(resolve=>setImmediate(resolve));expect(save).toHaveBeenCalledWith(expect.objectContaining({action:'get.product'}));save.mockClear();await lastValueFrom(interceptor.intercept(getContext('/api/v1/platform/products'),{handle:()=>of([])}));expect(save).not.toHaveBeenCalled();});
});
