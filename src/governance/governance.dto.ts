import { Type } from 'class-transformer';
import { IsBoolean, IsDefined, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, IsUrl, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { PageQueryDto } from '../common/page-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChangeRequestDto {
  @IsString() @Length(3, 4000) details!: string;
  @IsOptional() @IsObject() requestedChanges?: Record<string, unknown>;
}
export class ReviewChangeRequestDto {
  @IsIn(['approved', 'rejected']) status!: string;
  @IsOptional() @IsString() @Length(1, 4000) notes?: string;
}
export class ChangeRequestQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['pending','approved','rejected']) status?: string;
  @IsOptional() @IsUUID() organizationId?: string;
}
export class PlatformProductQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['active', 'pending', 'archived', 'rejected']) status?: string;
  @IsOptional() @IsUUID() organizationId?: string;
  @IsIn(['createdAt', 'updatedAt', 'name', 'status', 'totalCodes', 'scanned']) override sortBy = 'updatedAt';
}
export class PlatformProductStatusDto {
  @IsIn(['active', 'pending', 'archived', 'rejected']) status!: string;
  @IsOptional() @IsString() @Length(1, 4000) reason?: string;
}
export class InviteVendorDto {
  @IsString() @Length(2, 200) vendorName!: string;
  @IsString() @Length(2, 200) contactPerson!: string;
  @IsEmail() email!: string;
}
export class VendorLifecycleDto {
  @IsOptional() @IsString() @Length(1, 4000) reason?: string;
}
export class FraudCaseQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['critical', 'high', 'medium', 'low']) severity?: string;
  @IsOptional() @IsIn(['open', 'investigating', 'contained', 'resolved', 'dismissed']) status?: string;
  @IsOptional() @IsString() category?: string;
  @IsIn(['createdAt', 'updatedAt', 'severity', 'status']) override sortBy = 'createdAt';
}
export class CreateFraudCaseDto {
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsUUID() verificationEventId?: string;
  @IsString() @Length(2, 100) category!: string;
  @IsIn(['critical', 'high', 'medium', 'low']) severity!: string;
  @IsString() @Length(2, 300) title!: string;
  @IsOptional() @IsString() @Length(1, 4000) description?: string;
  @IsOptional() @IsObject() signals?: Record<string, unknown>;
}
export class UpdateFraudCaseDto {
  @IsOptional() @IsIn(['critical', 'high', 'medium', 'low']) severity?: string;
  @IsOptional() @IsIn(['open', 'investigating', 'contained', 'resolved', 'dismissed']) status?: string;
  @IsOptional() @IsUUID() assignedToId?: string;
}
export class AddCaseNoteDto {
  @IsString() @Length(1, 4000) body!: string;
  @IsOptional() evidence?: Array<{ fileName: string; url?: string }>;
}
export class AuditExceptionQueryDto extends PageQueryDto {
  @ApiPropertyOptional({type:String,maxLength:200}) @IsOptional() @IsString() @MaxLength(200) query?: string;
  @ApiPropertyOptional({type:String,enum:['high','medium','low','all']}) @IsOptional() @IsIn(['high', 'medium', 'low', 'all']) severity?: string;
  @ApiPropertyOptional({type:String,enum:['open','closed','all']}) @IsOptional() @IsIn(['open', 'closed', 'all']) status?: string;
  @ApiPropertyOptional({type:String,enum:['createdAt','updatedAt','severity','status'],default:'createdAt'}) @IsIn(['createdAt', 'updatedAt', 'severity', 'status']) override sortBy = 'createdAt';
}
export class CreateAuditExceptionDto {
  @IsOptional() @IsUUID() auditLogId?: string;
  @IsOptional() @IsUUID() organizationId?: string;
  @IsIn(['high', 'medium', 'low']) severity!: string;
  @IsString() @Length(2, 300) title!: string;
  @IsString() @Length(2, 4000) details!: string;
}
export class ResolveAuditExceptionDto {
  @IsString() @Length(1, 4000) comment!: string;
  @IsOptional() @IsString() @Length(1, 255) evidenceFileName?: string;
  @IsOptional() @IsString() @Length(1, 2000) evidenceUrl?: string;
}
export class CreateIncidentDto {
  @IsString() @Length(2, 300) title!: string;
  @IsString() @Length(2, 100) component!: string;
  @IsIn(['high', 'medium', 'low']) severity!: string;
  @IsOptional() @IsString() @Length(1, 4000) description?: string;
}
export class UpdateIncidentDto {
  @IsIn(['investigating', 'identified', 'monitoring', 'resolved']) status!: string;
}
export class MfaCodeDto { @IsString() @Length(6, 8) code!: string; }
export class MfaDisableDto extends MfaCodeDto { @IsString() password!: string; }
export class ExportQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) limit = 10000;
}
export class OptionQueryDto extends PageQueryDto {
  @IsOptional() @IsString() namespace?: string;
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsIn(['true','false']) active?: string;
  @IsIn(['namespace','key','label','sortOrder','createdAt','updatedAt']) override sortBy='namespace';
}
export class CreateOptionDto {
  @IsString() @Length(2,100) namespace!:string;
  @IsString() @Length(1,100) key!:string;
  @IsString() @Length(1,200) label!:string;
  @IsDefined() value!:unknown;
  @IsIn(['string','number','boolean','object','array']) valueType!:string;
  @IsOptional() @IsUUID() organizationId?:string;
  @IsOptional() @IsString() @Length(1,1000) description?:string;
  @IsOptional() @IsObject() validation?:Record<string,unknown>;
  @IsOptional() @IsBoolean() isPublic?:boolean;
  @IsOptional() @IsBoolean() isActive?:boolean;
  @IsOptional() @Type(()=>Number) @IsInt() sortOrder?:number;
  @IsOptional() @IsString() @Length(1,1000) reason?:string;
}
export class UpdateOptionDto {
  @IsOptional() @IsString() @Length(1,200) label?:string;
  @IsOptional() value?:unknown;
  @IsOptional() @IsString() @Length(1,1000) description?:string;
  @IsOptional() @IsObject() validation?:Record<string,unknown>;
  @IsOptional() @IsBoolean() isPublic?:boolean;
  @IsOptional() @IsBoolean() isActive?:boolean;
  @IsOptional() @Type(()=>Number) @IsInt() sortOrder?:number;
  @IsString() @Length(1,1000) reason!:string;
}
export class SetVendorLogoDto {
  @IsUrl() logoUrl!: string;
}
