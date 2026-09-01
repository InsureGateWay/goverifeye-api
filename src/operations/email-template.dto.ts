import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { PageQueryDto } from '../common/page-query.dto';

export class EmailTemplateQueryDto extends PageQueryDto {
  @IsOptional() @IsString() key?:string;
  @IsOptional() @IsIn(['vendor','platform_admin','staff','customer','security']) audience?:string;
  @IsOptional() @IsIn(['draft','active','archived']) status?:string;
  @IsIn(['key','name','audience','status','versionNumber','createdAt','updatedAt']) override sortBy='key';
}
export class CreateEmailTemplateDto {
  @IsString() @Length(2,120) key!:string;
  @IsString() @Length(2,200) name!:string;
  @IsIn(['vendor','platform_admin','staff','customer','security']) audience!:string;
  @IsString() @Length(1,300) subjectTemplate!:string;
  @IsString() @Length(1,20000) textTemplate!:string;
  @IsString() @Length(1,100000) htmlTemplate!:string;
  @IsArray() @IsString({each:true}) requiredVariables!:string[];
  @IsOptional() @IsString() @Length(1,2000) description?:string;
  @IsString() @Length(3,1000) reason!:string;
}
export class UpdateEmailTemplateDto {
  @IsOptional() @IsString() @Length(2,200) name?:string;
  @IsOptional() @IsString() @Length(1,300) subjectTemplate?:string;
  @IsOptional() @IsString() @Length(1,20000) textTemplate?:string;
  @IsOptional() @IsString() @Length(1,100000) htmlTemplate?:string;
  @IsOptional() @IsArray() @IsString({each:true}) requiredVariables?:string[];
  @IsOptional() @IsString() @Length(1,2000) description?:string;
  @IsString() @Length(3,1000) reason!:string;
}
export class ActivateEmailTemplateDto { @IsString() @Length(3,1000) reason!:string; }
export class PreviewEmailTemplateDto { @IsObject() variables!:Record<string,string|number|boolean>; }
