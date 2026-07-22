import{IsIn,IsOptional,IsString,Length}from'class-validator';import{PageQueryDto}from'../common/page-query.dto';
export class ReviewDecisionDto{@IsIn(['approved','rejected','changes_requested'])decision!:'approved'|'rejected'|'changes_requested';@IsOptional()@IsString()@Length(3,2000)notes?:string}
export class ReviewQueueDto extends PageQueryDto{@IsOptional()@IsIn(['product','onboarding'])resourceType?:'product'|'onboarding';@IsIn(['createdAt','updatedAt','status','name','companyName'])override sortBy='createdAt'}
