import{IsIn,IsOptional,IsString,Length}from'class-validator';import{PageQueryDto}from'../common/page-query.dto';
import{ApiProperty,ApiPropertyOptional}from'@nestjs/swagger';
export class ReviewDecisionDto{@ApiProperty({enum:['approved','rejected','changes_requested'],example:'approved'})@IsIn(['approved','rejected','changes_requested'])decision!:'approved'|'rejected'|'changes_requested';@ApiPropertyOptional({example:'All submitted information has been verified.'})@IsOptional()@IsString()@Length(3,2000)notes?:string}
export class ReviewQueueDto extends PageQueryDto{@IsOptional()@IsIn(['product','onboarding'])resourceType?:'product'|'onboarding';@IsIn(['createdAt','updatedAt','status','name','companyName'])override sortBy='createdAt'}
