import { validate } from 'class-validator';
import { RecallDto } from '../codes/code.dto';
import { UpdateVendorConcernBody } from '../customer/customer.dto';
import { PlatformProductStatusDto } from '../governance/governance.dto';

describe('vendor mobile workflow contracts',()=>{
  it('requires a meaningful recall reason',async()=>{const dto=Object.assign(new RecallDto(),{reason:'bad'});expect(await validate(dto)).not.toHaveLength(0);dto.reason='Confirmed safety recall';expect(await validate(dto)).toHaveLength(0)});
  it('accepts the information-required product state and requested fields',async()=>{const dto=Object.assign(new PlatformProductStatusDto(),{status:'information_required',reason:'Upload the renewed certificate',requiredFields:['verificationDocument']});expect(await validate(dto)).toHaveLength(0)});
  it('restricts concern transitions to triage outcomes',async()=>{const dto=Object.assign(new UpdateVendorConcernBody(),{status:'new'});expect(await validate(dto)).not.toHaveLength(0);dto.status='resolved';expect(await validate(dto)).toHaveLength(0)});
});
