import { Type } from 'class-transformer';import{IsEnum,IsIn,IsInt,IsOptional,IsString,IsUUID,Length,Max,Min}from'class-validator';import{PageQueryDto}from'../common/page-query.dto';import{LabelType}from'../codes/code.enums';
export class QuoteDto{@IsUUID()productId!:string;@IsEnum(LabelType)labelType!:LabelType;@Type(()=>Number)@IsInt()@Min(100)@Max(10000)quantity!:number}
export class CreatePaymentDto extends QuoteDto{@IsString()method!:'online'|'bank'}
export class JobQueryDto extends PageQueryDto{@IsOptional()@IsString()type?:string;@IsOptional()@IsString()status?:string;@IsIn(['createdAt','updatedAt','type','status','amount','subject'])override sortBy='createdAt'}
export class CreateExportJobDto{@IsString()type!:'batch-export'|'batch-print'|'report-export';@IsOptional()@IsUUID()batchId?:string;@IsOptional()@IsString()format?:string}
export class CreateSupportTicketDto{@IsString()@Length(3,200)subject!:string;@IsString()@Length(10,4000)message!:string}
