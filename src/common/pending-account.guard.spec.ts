import { ExecutionContext } from '@nestjs/common';
import { PendingAccountGuard } from './pending-account.guard';

const context=(path:string,isActive:boolean)=>({switchToHttp:()=>({getRequest:()=>({path,user:{isActive}})})}) as ExecutionContext;

describe('PendingAccountGuard',()=>{
  const guard=new PendingAccountGuard();
  it('allows an inactive applicant to complete onboarding',()=>expect(guard.canActivate(context('/api/v1/onboarding',false))).toBe(true));
  it('blocks an inactive applicant from vendor operations',()=>expect(()=>guard.canActivate(context('/api/v1/products',false))).toThrow('awaiting administrator approval'));
  it('allows an activated account',()=>expect(guard.canActivate(context('/api/v1/products',true))).toBe(true));
});
