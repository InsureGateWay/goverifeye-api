import { IsArray, IsEmail, IsOptional, IsString, IsUrl, Length, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger'; import { IsIn, IsInt, Max, Min } from 'class-validator'; import { PageQueryDto } from '../common/page-query.dto';
export class AddressDto { @IsString() line1!: string; @IsOptional() @IsString() line2?: string; @IsString() city!: string; @IsString() state!: string; @IsString() country!: string; @IsString() postalCode!: string; }
export class AdministratorDto { @IsString() firstName!: string; @IsString() lastName!: string; @IsEmail() email!: string; @IsString() phone!: string; }
export class DocumentDto { @IsString() type!: string; @IsUrl() url!: string; }
export class CompleteOnboardingDto {
  @IsString() @Length(2, 200) companyName!: string; @IsString() registrationNumber!: string;
  @IsString() industry!: string; @IsString() country!: string;
  @ValidateNested() @Type(() => AdministratorDto) administrator!: AdministratorDto;
  @ValidateNested() @Type(() => AddressDto) address!: AddressDto;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DocumentDto) documents!: DocumentDto[];
}
export class UpdateCompanyOnboardingDto { @IsString() @Length(2,200) companyName!:string; @IsString() registrationNumber!:string; @IsString() industry!:string; @IsString() country!:string; }
export class UpdateAdministratorDto extends PartialType(AdministratorDto) {}
export class UpdateAddressDto extends PartialType(AddressDto) {}
export class DocumentQueryDto extends PageQueryDto { @IsOptional() @IsString() type?:string; @IsOptional() @IsString() status?:string; @IsIn(['fileName','type','status','createdAt','updatedAt']) override sortBy='createdAt'; }
export class CreateDocumentDto { @IsString() type!:string; @IsString() fileName!:string; @IsIn(['application/pdf','image/png','image/jpeg']) mimeType!:string; @Type(()=>Number) @IsInt() @Min(1) @Max(12*1024*1024) size!:number; }
export class UpdateDocumentDto extends PartialType(CreateDocumentDto) {}
