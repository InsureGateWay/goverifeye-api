import { ExecutionContext } from '@nestjs/common';
import { OnboardingWriteGuard } from './onboarding-write.guard';

describe('OnboardingWriteGuard',()=>{
  const guard=new OnboardingWriteGuard();
  function context(method:string,path:string,role:'admin'|'staff'){
    return {switchToHttp:()=>({getRequest:()=>({method,path,user:{role}})})} as unknown as ExecutionContext;
  }
  it('allows staff to view company information',()=>{
    expect(guard.canActivate(context('GET','/api/v1/onboarding','staff'))).toBe(true);
  });
  it('rejects staff company changes',()=>{
    expect(()=>guard.canActivate(context('PATCH','/api/v1/onboarding/company','staff'))).toThrow('Only vendor administrators');
  });
  it('allows administrators to update onboarding data',()=>{
    expect(guard.canActivate(context('PATCH','/api/v1/onboarding/company','admin'))).toBe(true);
  });
});
