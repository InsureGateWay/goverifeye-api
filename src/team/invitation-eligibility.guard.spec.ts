import { ExecutionContext } from '@nestjs/common';
import { InvitationEligibilityGuard } from './invitation-eligibility.guard';

describe('InvitationEligibilityGuard',()=>{
  const request={method:'POST',path:'/api/v1/team/members/invite',body:{email:' STAFF@EXAMPLE.COM '},user:{organizationId:'org-1'}};
  const context={switchToHttp:()=>({getRequest:()=>request})} as unknown as ExecutionContext;
  function guard(account:unknown,pending:unknown){
    const repositories=[{findOneBy:jest.fn().mockResolvedValue(account)},{findOneBy:jest.fn().mockResolvedValue(pending)}];
    const db={getRepository:jest.fn().mockImplementation(()=>repositories.shift())};
    return new InvitationEligibilityGuard(db as never);
  }
  it('normalizes and permits an eligible invite',async()=>{await expect(guard(null,null).canActivate(context)).resolves.toBe(true);expect(request.body.email).toBe('staff@example.com')});
  it('rejects an existing account',async()=>{await expect(guard({id:'user-1'},null).canActivate(context)).rejects.toMatchObject({code:'INVITEE_ACCOUNT_ALREADY_EXISTS',status:409})});
  it('rejects a duplicate pending invite',async()=>{await expect(guard(null,{id:'invite-1'}).canActivate(context)).rejects.toMatchObject({code:'INVITATION_ALREADY_PENDING',status:409})});
});
