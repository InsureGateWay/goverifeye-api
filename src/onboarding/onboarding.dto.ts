import { Equals, IsArray, IsEmail, IsNumber, IsOptional, IsString, IsUrl, Length, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'; import { IsIn, IsInt } from 'class-validator'; import { PageQueryDto } from '../common/page-query.dto';
export class AddressDto { @ApiProperty({example:'12 Verification Avenue'}) @IsString() line1!: string; @ApiPropertyOptional({example:'Suite 4'}) @IsOptional() @IsString() line2?: string; @ApiProperty({example:'Lagos'}) @IsString() city!: string; @ApiProperty({example:'Lagos'}) @IsString() state!: string; @ApiProperty({example:'Nigeria'}) @IsString() country!: string; @ApiProperty({example:'100001'}) @IsString() postalCode!: string; }
export class AdministratorDto { @ApiProperty({example:'Ada'}) @IsString() firstName!: string; @ApiProperty({example:'Okafor'}) @IsString() lastName!: string; @ApiProperty({example:'ada@example.com',format:'email'}) @IsEmail() email!: string; @ApiProperty({example:'+2348012345678'}) @IsString() phone!: string; }
export class DocumentDto { @ApiProperty({example:'cac_certificate'}) @IsString() type!: string; @ApiProperty({example:'https://example.com/document.pdf',format:'uri'}) @IsUrl() url!: string; }
export class CompleteOnboardingDto {
  @ApiProperty({example:'Verified Goods Ltd'}) @IsString() @Length(2, 200) companyName!: string; @ApiProperty({example:'RC1234567'}) @IsString() registrationNumber!: string;
  @ApiProperty({example:'Pharmaceuticals'}) @IsString() industry!: string; @ApiProperty({example:'Nigeria'}) @IsString() country!: string;
  @ApiProperty({type:()=>AdministratorDto}) @ValidateNested() @Type(() => AdministratorDto) administrator!: AdministratorDto;
  @ApiProperty({type:()=>AddressDto}) @ValidateNested() @Type(() => AddressDto) address!: AddressDto;
  @ApiProperty({type:()=>[DocumentDto]}) @IsArray() @ValidateNested({ each: true }) @Type(() => DocumentDto) documents!: DocumentDto[];
}
export class UpdateCompanyOnboardingDto { @ApiProperty({example:'Verified Goods Ltd'}) @IsString() @Length(2,200) companyName!:string; @ApiProperty({example:'RC1234567'}) @IsString() registrationNumber!:string; @ApiProperty({example:'Pharmaceuticals'}) @IsString() industry!:string; @ApiProperty({example:'Nigeria'}) @IsString() country!:string; }
export class UpdateAdministratorDto extends PartialType(AdministratorDto) {}
export class UpdateAddressDto extends PartialType(AddressDto) {}
export class DocumentQueryDto extends PageQueryDto { @IsOptional() @IsString() type?:string; @IsOptional() @IsString() status?:string; @IsIn(['fileName','type','status','createdAt','updatedAt']) override sortBy='createdAt'; }
export class CreateDocumentDto { @ApiProperty({example:'cac_certificate'}) @IsString() type!:string; @ApiProperty({example:'certificate.pdf'}) @IsString() fileName!:string; @ApiProperty({enum:['application/pdf','image/png','image/jpeg'],example:'application/pdf'}) @IsIn(['application/pdf','image/png','image/jpeg']) mimeType!:string; @ApiProperty({example:245760,minimum:1,maximum:12582912}) @Type(()=>Number) @IsInt() @Min(1) @Max(12*1024*1024) size!:number; }
export class UpdateDocumentDto extends PartialType(CreateDocumentDto) {}
export class SubmitOnboardingDto {
  @ApiProperty({example:true}) @Equals(true) termsAccepted!:true;
  @ApiProperty({example:true}) @Equals(true) dataUsePolicyAccepted!:true;
  @ApiProperty({example:'2026-07-25'}) @IsString() @Length(1,50) termsVersion!:string;
  @ApiProperty({example:'2026-07-25'}) @IsString() @Length(1,50) dataUsePolicyVersion!:string;
  @ApiPropertyOptional({example:6.5244}) @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?:number;
  @ApiPropertyOptional({example:3.3792}) @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?:number;
  @ApiPropertyOptional({example:1200}) @IsOptional() @IsNumber() @Min(0) accuracyMeters?:number;
}
